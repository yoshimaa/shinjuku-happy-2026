"""OpenFreeMap の Liberty スタイルを日本語ラベル化・軽量化して docs/assets/map/liberty-ja.json に保存する。

- 地名ラベルを日本語名（name:ja）優先にする
- 新宿区だけを表示するアプリでは使わないレイヤー（国境・国名・空港・低ズームの陰影など）を外す
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "map" / "liberty-ja.json"
SRC = "https://tiles.openfreemap.org/styles/liberty"

DROP_SOURCES = {"ne2_shaded"}
DROP_LAYERS = {
    "natural_earth", "aeroway_fill", "aeroway_runway", "aeroway_taxiway", "airport",
    "boundary_2", "boundary_3", "boundary_disputed",
    "label_country_1", "label_country_2", "label_country_3", "label_state",
    "highway-shield-us-interstate", "road_shield_us", "building-3d",
}
JA_LABEL = ["coalesce", ["get", "name:ja"], ["get", "name"]]


def main():
    req = urllib.request.Request(SRC, headers={"User-Agent": "shinjuku-happy-2026/build_style"})
    style = json.loads(urllib.request.urlopen(req, timeout=30).read())
    for key in DROP_SOURCES:
        style["sources"].pop(key, None)
    layers = []
    for layer in style["layers"]:
        if layer["id"] in DROP_LAYERS or layer.get("source") in DROP_SOURCES:
            continue
        tf = layer.get("layout", {}).get("text-field")
        if tf and "name" in json.dumps(tf):
            layer["layout"]["text-field"] = JA_LABEL
        layers.append(layer)
    style["layers"] = layers
    style["name"] = "Liberty (ja, Shinjuku)"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(style, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(layers)} layers -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
