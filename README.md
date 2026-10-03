# shinjuku-happy-2026

新宿区 商店街ハッピー商品券の取扱店検索アプリ

> 本アプリは非公式です。最新・正確な情報は[公式サイト](https://shinjuku-happy.jp/)をご確認ください。

## 商店街ハッピー商品券とは

新宿区商店会連合会が、商店街の活性化と区民の生活応援を目的に発行する紙の商品券です。1冊10,000円で、13,000円分の買い物ができます（1冊あたり3,000円お得）。

| 券種 | 金額 | 使える店舗 |
|---|---|---|
| 応援券 | 8,000円分（500円×16枚） | 中小企業・個人店の取扱店 |
| 共通券 | 5,000円分（500円×10枚） | すべての取扱店 |

- 発行冊数：15万冊
- 大手企業の百貨店・大型商業施設に入居する店舗は、共通券のみ利用できます。
- たばこ、医療保険・介護保険の支払い、換金性の高いもの（商品券・切手・プリペイドカード等）、税金・公共料金の支払いなどには使えません。

## 令和8年度（2026年度）の概要

| 項目 | 内容 |
|---|---|
| 申込期間 | 2026年7月1日（水）〜7月27日（月） |
| 販売期間 | 2026年9月16日（水）〜10月16日（金） |
| 利用期間 | 2026年10月1日（木）〜2027年1月8日（金） |
| 対象者 | 新宿区民、新宿区内に在勤・在学の方（申込多数の場合は区民優先で抽選） |
| 申込上限 | 1人最大5冊 |

取扱店舗は、ミニフラッグまたはステッカーが目印です。

## アプリの機能

- 地図（OpenFreeMap Liberty＋MapLibre GL JS、新宿区のみ）と一覧で取扱店を表示
- 起動時に現在地を取得して近い順に表示（取得までは牛込保健センター周辺）
- 店名・業種・住所でのキーワード検索
- 地図上の分類バーで大分類（7種）→中分類をワンタップで切り替え
- 券種・分類・エリア・商店会での絞り込み（初期状態は「応援券が使える店舗」のみ）
- 複数の商店会に重複掲載されている店舗（削除フラグ=1）は初期状態で非表示

## 開発

ビルド不要の静的サイトで、`docs/` をそのまま GitHub Pages で公開します。

```
docs/                 GitHub Pages の公開ディレクトリ
  index.html
  assets/css/style.css
  assets/js/app.js
  assets/map/liberty-ja.json  地図スタイル（生成物）
  data/shops.json     アプリが読み込む店舗データ（生成物）
  .nojekyll
data/                 元データ（公開サイトには含めない）
  shinjuku_happy_shops.csv
  geocache.json       住所→緯度経度のキャッシュ
scripts/
  scrape.py           公式サイト → data/shinjuku_happy_shops.csv（大分類・中分類も付与）
  categories.py       業種 → 大分類・中分類の対応表
  build_data.py       CSV + 緯度経度 → docs/data/shops.json
  build_style.py      OpenFreeMap Liberty → 日本語化・軽量化 → docs/assets/map/liberty-ja.json
```

ローカルで確認する：

```bash
python3 -m http.server 8000 -d docs
```

ブラウザで http://localhost:8000 を開きます。

店舗データの更新手順：

```bash
python3 scripts/scrape.py
```
```bash
python3 scripts/build_data.py
```

緯度経度は国土地理院の住所検索APIで取得し、`data/geocache.json` にキャッシュします（新しい住所だけ問い合わせます）。

### GitHub Pages の設定

リポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` / `/docs` にします。

## データの出典

取扱店舗の情報は、公式サイトの「商品券取扱店検索」から取得しています。

- 商店街ハッピー商品券 公式サイト：https://shinjuku-happy.jp/
- 商品券取扱店検索：https://shinjuku-happy.jp/shop/

取扱店舗は公式サイトで随時更新されるため、本アプリの情報と異なる場合があります（2026年10月4日時点の情報）。
