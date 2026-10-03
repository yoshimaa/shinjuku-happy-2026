"""公式サイトの商品券取扱店検索（リスト表示）を全ページ取得して CSV に保存する。

重複行（店舗名と住所が同じ行）は削除せず、2件目以降に削除フラグ=1 を立てる。
"""
import csv
import html
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "shinjuku_happy_shops.csv"
FIRST = "https://shinjuku-happy.jp/shop/?listall"
PAGE = "https://shinjuku-happy.jp/shop/page/{}/?listall"
COLUMNS = ["項番", "エリア", "商店会", "共通券", "応援券", "店舗名", "業種", "電話番号", "住所", "URL", "削除フラグ"]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def field(pattern, item):
    m = re.search(pattern, item, re.S)
    return m.group(1) if m else ""


def parse(page_html):
    for item in re.findall(r'<li class="result__list__item">(.*?)</li>', page_html, re.S):
        area, _, assoc = text(field(r'class="result--block">(.*?)</span>', item)).partition(" / ")
        types = field(r'class="result--type">(.*?)</p>', item)
        name = field(r'class="result--name">(.*?)</p>', item)
        link = re.search(r'href="([^"]+)"', name)
        yield {
            "エリア": area.strip(),
            "商店会": assoc.strip(),
            "共通券": "1" if "共通券" in types else "0",
            "応援券": "1" if "応援券" in types else "0",
            "店舗名": text(name),
            "業種": text(field(r'class="result--industry">(.*?)</span>', item)),
            "電話番号": text(field(r'class="result--tel">(.*?)</span>', item)),
            "住所": text(field(r'class="result--add">(.*?)</p>', item)),
            "URL": html.unescape(link.group(1)) if link else "",
        }


def main():
    first = fetch(FIRST)
    last = max(int(n) for n in re.findall(r"/shop/page/(\d+)/\?listall", first))
    rows = list(parse(first))
    for p in range(2, last + 1):
        time.sleep(1)
        rows.extend(parse(fetch(PAGE.format(p))))
        print(f"page {p}/{last}", flush=True)

    seen = set()
    for i, row in enumerate(rows, 1):
        key = (row["店舗名"], row["住所"])
        row["項番"] = str(i)
        row["削除フラグ"] = "1" if key in seen else "0"
        seen.add(key)

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
