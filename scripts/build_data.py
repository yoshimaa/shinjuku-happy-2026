"""CSV の住所を国土地理院の住所検索 API で緯度経度に変換し、アプリ用の data/shops.json を作る。

変換結果は data/geocache.json にキャッシュし、未取得の住所だけ API に問い合わせる。
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "shinjuku_happy_shops.csv"
CACHE = ROOT / "data" / "geocache.json"
OUT = ROOT / "docs" / "data" / "shops.json"
API = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="


def query(addr):
    # 建物名を落として番地までで検索する
    m = re.match(r"(東京都新宿区[^\d０-９]*[\d０-９\-－‐ー―丁目番地号の]+)", addr.replace("　", " "))
    return (m.group(1) if m else addr).strip()


def geocode(addr):
    res = json.loads(urllib.request.urlopen(API + urllib.parse.quote(query(addr)), timeout=20).read())
    if not res:
        return None
    lng, lat = res[0]["geometry"]["coordinates"]
    return [round(lat, 6), round(lng, 6)]


def main():
    rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    todo = sorted({r["住所"] for r in rows} - cache.keys())
    for i, addr in enumerate(todo, 1):
        cache[addr] = geocode(addr)
        time.sleep(0.2)
        if i % 50 == 0:
            print(f"geocoded {i}/{len(todo)}", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))

    shops = [
        {
            "id": int(r["項番"]),
            "area": r["エリア"],
            "assoc": r["商店会"],
            "common": r["共通券"] == "1",
            "support": r["応援券"] == "1",
            "name": r["店舗名"],
            "industry": r["業種"],
            "tel": r["電話番号"],
            "address": r["住所"],
            "url": r["URL"],
            "deleted": r["削除フラグ"] == "1",
            "latlng": cache.get(r["住所"]),
        }
        for r in rows
    ]
    OUT.write_text(json.dumps(shops, ensure_ascii=False, separators=(",", ":")))
    missing = sum(s["latlng"] is None for s in shops)
    print(f"{len(shops)} shops -> {OUT} (no location: {missing})")


if __name__ == "__main__":
    main()
