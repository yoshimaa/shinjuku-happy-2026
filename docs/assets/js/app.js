(() => {
  "use strict";

  // ---------- master data ----------
  const ICONS = {
    daily: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    food: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 2-2 6 0 8v10"/>',
    fashion: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z"/>',
    beauty: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z"/>',
    shop: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    service: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    filter: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    other: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  };
  // 大分類（表示順）→ 中分類。店舗データの big / mid（scripts/categories.py で付与）と対応
  const CATEGORIES = [
    { key: "日常のお買い物", icon: "daily", color: "#3a9d5d", mids: ["コンビニ", "スーパー", "ドラッグストア", "食料品・酒店"] },
    { key: "飲食", icon: "food", color: "#ec6a3c", mids: ["飲食店", "居酒屋・バー", "カフェ・パン"] },
    { key: "ファッション", icon: "fashion", color: "#8a5cd0", mids: ["洋服・ファッション", "メガネ・コンタクト"] },
    { key: "美容・リラクゼーション", icon: "beauty", color: "#d6487e", mids: ["美容院・理容室", "エステ・マッサージ", "銭湯・サウナ"] },
    { key: "ショッピング", icon: "shop", color: "#2f7fd6", mids: ["百貨店・商業施設", "家電・日用品", "本・文具・趣味", "花・植木"] },
    { key: "暮らし・サービス", icon: "service", color: "#b7791f", mids: ["クリーニング", "暮らしのサービス"] },
    { key: "その他", icon: "other", color: "#6b7280", mids: ["その他"] },
  ];
  const categoryOf = (big) => CATEGORIES.find((c) => c.key === big) || CATEGORIES[CATEGORIES.length - 1];
  const TICKETS = [
    { key: "support", label: "応援券" },
    { key: "common", label: "共通券" },
  ];
  const AREAS = ["四谷", "新宿", "淀橋A", "淀橋B", "戸塚", "早稲田", "神楽坂"];
  // 絞り込みの初期状態（起動時・リセット時・検索をやめたとき）
  const DEFAULT = () => ({ tickets: ["support"], bigs: [], mids: [], areas: [], assoc: "", deleted: false });
  // 絞り込みなし（検索を始めたとき。重複掲載の2件目以降だけは除く）
  const NONE = () => ({ ...DEFAULT(), tickets: [] });
  const PAGE = 60;

  // ---------- state ----------
  let shops = [];
  let applied = DEFAULT();
  let draft = DEFAULT();
  // 検索中は { raw, tokens, fuzzy }。検索を始めると絞り込みをすべて外して全店舗を対象にし、
  // その後に選んだ分類・絞り込みは検索結果にかけ合わせる。検索語が空になるかリセットすると初期状態に戻る
  let search = null;
  let me = null; // [lat, lng]
  let visible = [];
  let shown = PAGE;
  let activeId = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isDesktop = () => matchMedia("(min-width: 900px)").matches;
  // 全角の英数字・記号を半角にして、店名が間延びして何行にも折り返されないようにする（括弧は全角のまま）
  const tidy = (s) =>
    String(s)
      .replace(/[！-～]/g, (c) => ("（）［］｛｝".includes(c) ? c : String.fromCharCode(c.charCodeAt(0) - 0xfee0)))
      .replace(/　/g, " ");
  const icon = (key, cls = "icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
  const PIN_ICON = '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/>';

  // ---------- map ----------
  // 新宿区だけを表示し（範囲外へは移動できない）、現在地が取れるまでは牛込保健センターを起点にする
  const HOME = [35.703259, 139.727463]; // 牛込保健センター（新宿区弁天町50）
  const BOUNDS = [[139.655, 35.665], [139.765, 35.735]]; // [西南, 東北]
  const inBounds = ([lat, lng]) => lng >= BOUNDS[0][0] && lng <= BOUNDS[1][0] && lat >= BOUNDS[0][1] && lat <= BOUNDS[1][1];
  // MapLibre のズームは 512px タイル基準。13.x では軽い z13 タイル、14 以上で詳細な z14 タイルを読む
  const START_ZOOM = 13.9;
  const DETAIL_ZOOM = 15.5;
  const toLngLat = ([lat, lng]) => [lng, lat];
  // 現在地が区外なら、距離は意味をなさない（数十km）ので牛込保健センターからの近さで並べる
  const meInside = () => !!me && inBounds(me);
  const origin = () => (me ? (meInside() ? me : HOME) : null);

  // 一覧シートが地図に重なる割合（CSS の --sheet-peek / --sheet-half と対応）
  // peek: 初期表示。half: 現在地取得後で、近くの店舗を多く見せる
  const SHEET_RATIO = { peek: 0.42, half: 0.6 };
  let baseSheet = "peek"; // 全画面を閉じたときに戻る高さ

  // 検索バー・分類バー・一覧シートに隠れない範囲を地図の表示領域にする
  const mapPadding = () => {
    const bars = document.body.classList.contains("has-mid") ? 40 : 0;
    return isDesktop()
      ? { top: 64 + bars, bottom: 20, left: 20, right: 20 }
      : { top: 116 + bars, bottom: Math.round(innerHeight * SHEET_RATIO[baseSheet]), left: 0, right: 0 };
  };
  const map = new maplibregl.Map({
    container: "map",
    style: "assets/map/liberty-ja.json",
    center: toLngLat(HOME),
    zoom: START_ZOOM,
    minZoom: 12,
    maxZoom: 18,
    maxBounds: BOUNDS,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.setPadding(mapPadding());
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  addEventListener("resize", () => map.setPadding(mapPadding()));

  const mapReady = new Promise((ok) => map.on("load", ok));
  const popup = new maplibregl.Popup({ closeButton: false, offset: [0, -30], maxWidth: "280px" });
  let meMarker = null;

  // ピン画像を canvas で作る（外部画像の読み込みなし）
  function pinImage(color, size) {
    const r = devicePixelRatio || 1;
    const c = document.createElement("canvas");
    c.width = c.height = size * r;
    const g = c.getContext("2d");
    g.scale((size * r) / 24, (size * r) / 24);
    g.shadowColor = "rgba(0,0,0,.3)";
    g.shadowBlur = 1.5;
    g.shadowOffsetY = 0.8;
    g.fillStyle = color;
    g.fill(new Path2D("M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"));
    g.shadowColor = "transparent";
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(12, 10, 2.5, 0, Math.PI * 2);
    g.fill();
    return { image: g.getImageData(0, 0, c.width, c.height), pixelRatio: r };
  }

  mapReady.then(() => {
    const black = pinImage("#1c1c1e", 30);
    const orange = pinImage("#ec6a3c", 40);
    map.addImage("pin", black.image, { pixelRatio: black.pixelRatio });
    map.addImage("pin-active", orange.image, { pixelRatio: orange.pixelRatio });
    map.addSource("shops", { type: "geojson", data: geojson(), cluster: true, clusterRadius: 45, clusterMaxZoom: 15 });
    map.addLayer({
      id: "clusters", type: "circle", source: "shops", filter: ["has", "point_count"],
      paint: {
        "circle-color": "#1c1c1e",
        "circle-radius": ["step", ["get", "point_count"], 17, 10, 20, 100, 24],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fff",
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "shops", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true },
      paint: { "text-color": "#fff" },
    });
    map.addLayer({
      id: "pins", type: "symbol", source: "shops", filter: ["!", ["has", "point_count"]],
      layout: { "icon-image": "pin", "icon-anchor": "bottom", "icon-allow-overlap": true },
    });
    map.addLayer({
      id: "pin-active", type: "symbol", source: "shops", filter: ["==", ["get", "id"], -1],
      layout: { "icon-image": "pin-active", "icon-anchor": "bottom", "icon-allow-overlap": true },
    });

    map.on("click", "clusters", async (e) => {
      const f = e.features[0];
      const zoom = await map.getSource("shops").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom });
    });
    map.on("click", "pins", (e) => select(e.features[0].properties.id, { fromMap: true }));
    for (const layer of ["clusters", "pins"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
  });

  function geojson() {
    return {
      type: "FeatureCollection",
      features: visible
        .filter((s) => s.latlng)
        .map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: toLngLat(s.latlng) }, properties: { id: s.id } })),
    };
  }

  // ---------- filtering ----------
  const matches = (s, f) =>
    (f.deleted || !s.deleted) &&
    f.tickets.every((t) => s[t]) &&
    (!f.bigs.length || f.bigs.includes(s.big)) &&
    (!f.mids.length || f.mids.includes(s.mid)) &&
    (!f.areas.length || f.areas.includes(s.area)) &&
    (!f.assoc || s.assoc === f.assoc);
  // 検索語に一致するか（検索していなければ常に true。一致度は scoreShops で付ける）
  const hit = (s) => !search || s.score > 0;

  // ---------- fuzzy search ----------
  // 表記ゆれを吸収するため、店舗データと検索語の両方を同じ規則で揃えてから比べる
  const SMALL_KANA = { ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け" };
  const KANJI_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const fold = (str) =>
    String(str)
      .normalize("NFKC") // 全角英数→半角、半角カナ→全角
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
      .replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, (c) => SMALL_KANA[c]) // 小さい文字→大きい文字
      .replace(/([一-龠])[けが]([一-龠])/g, "$1$2") // 市ヶ谷・市が谷→市谷
      .replace(/([一二三四五六七八九])丁目/g, (_, k) => KANJI_NUM[k] + "丁目") // 三丁目→3丁目
      .replace(/(\d+)(丁目|番地|番|号)/g, "$1") // 3丁目5番→35（住所のハイフンも下で消す）
      .replace(/[\s・･\-‐‑–—―−~〜'’"“”.,、。()（）\[\]［］「」&/!?:]/g, ""); // 空白・記号は無視

  // 言い換え：検索語がどれかに一致したら、同じグループの語でもヒットさせる
  const SYNONYMS = [
    ["カフェ", "喫茶", "喫茶店", "コーヒー", "珈琲", "cafe", "coffee"],
    ["床屋", "散髪", "理髪", "理容", "ヘアカット", "barber"],
    ["美容院", "美容室", "ヘアサロン", "美容"],
    ["マッサージ", "整体", "あんま", "鍼灸", "はり", "リラクゼーション", "エステ"],
    ["薬局", "薬屋", "ドラッグ", "ドラッグストア"],
    ["本屋", "書店"],
    ["文房具", "文具"],
    ["居酒屋", "飲み屋", "酒場", "バー", "bar", "スナック", "パブ"],
    ["パン屋", "パン", "ベーカリー", "bakery", "サンドイッチ"],
    ["ラーメン", "拉麺"],
    ["中華", "中国料理", "餃子"],
    ["焼肉", "焼き肉"],
    ["そば", "蕎麦"],
    ["寿司", "すし", "鮨"],
    ["イタリアン", "イタリア料理", "パスタ", "ピザ"],
    ["フレンチ", "フランス料理"],
    ["カレー", "インド料理", "エスニック"],
    ["和食", "日本料理", "定食", "食堂"],
    ["ランチ", "ご飯", "ごはん", "食事", "飲食"],
    ["ファミマ", "ファミリーマート"],
    ["スタバ", "スターバックス"],
    ["セブイレ", "セブンイレブン"],
    ["服", "洋服", "衣料", "婦人服", "紳士服", "ファッション"],
    ["メガネ", "眼鏡", "コンタクト"],
    ["靴", "シューズ", "バッグ", "鞄"],
    ["花屋", "生花", "フラワー", "植木"],
    ["酒屋", "酒店", "リカー"],
    ["お米", "米屋", "米穀"],
    ["クリーニング", "洗濯"],
    ["銭湯", "風呂", "サウナ"],
    ["電気屋", "家電"],
    ["雑貨", "日用品", "日用雑貨"],
    ["百貨店", "デパート", "商業施設"],
    ["おもちゃ", "玩具", "ゲーム"],
    ["ホテル", "旅館", "宿"],
  ].map((g) => g.map(fold));
  const expand = (token) => [token, ...SYNONYMS.filter((g) => g.includes(token)).flat()];

  function parseQuery(raw) {
    const tokens = raw.split(/\s+/).map(fold).filter(Boolean).map(expand);
    return tokens.length ? { raw: raw.trim(), tokens, fuzzy: false } : null;
  }

  // 一致度：語ごとに、店名で一致=3、業種・分類=2、住所・商店会・エリア=1 を足す。1語でも一致しなければ0
  function score(s, tokens) {
    let total = 0;
    for (const alts of tokens) {
      const hit = (field) => alts.some((t) => s.f[field].includes(t));
      const pt = hit("name") ? 3 : hit("cat") ? 2 : hit("place") ? 1 : 0;
      if (!pt) return 0;
      total += pt;
    }
    if (s.f.name.startsWith(tokens[0][0])) total += 1; // 店名の先頭から一致するものを上に
    return total;
  }

  // 一致する店舗がないとき（打ち間違い・うろ覚え）用：検索語の2文字ずつの組が店名・業種にどれだけ含まれるか
  const bigrams = (str) => {
    const t = str.replace(/ー/g, "");
    return t.length < 2 ? [t] : [...Array(t.length - 1)].map((_, i) => t.slice(i, i + 2));
  };
  function similarity(s, q) {
    const grams = bigrams(q);
    const target = (s.f.name + s.f.cat).replace(/ー/g, "");
    return grams.filter((g) => target.includes(g)).length / grams.length;
  }

  const distance = (a, b) => {
    const R = 6371e3, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

  function refresh({ fit = false } = {}) {
    const o = origin();
    shops.forEach((s) => (s.dist = o && s.latlng ? distance(o, s.latlng) : Infinity));
    scoreShops();
    visible = shops.filter((s) => matches(s, applied) && hit(s));
    if (search) visible.sort((a, b) => b.score - a.score || a.dist - b.dist);
    else if (o) visible.sort((a, b) => a.dist - b.dist);
    shown = PAGE;
    renderList();
    renderMarkers(fit);
    renderCategoryBar(); // 先に描く（詳細設定ボタンの件数バッジは renderSummary で付ける）
    renderSummary();
  }

  // 全店舗に検索語との一致度を付ける。全店舗の中に一致する店舗が1件もなければ（打ち間違いなど）、似た店舗を候補にする
  // 絞り込みで0件になった場合は似た店舗を出さない（条件に合わないだけなので）
  function scoreShops() {
    if (!search) return;
    shops.forEach((s) => (s.score = score(s, search.tokens)));
    search.fuzzy = !shops.some((s) => s.score > 0 && !s.deleted);
    if (!search.fuzzy) return;
    // 2文字の組の6割以上が含まれる店舗だけを候補にする（短い検索語ほど厳しくなる）
    const q = fold(search.raw);
    shops.forEach((s) => {
      const v = q.length >= 2 ? similarity(s, q) : 0;
      s.score = v >= 0.6 ? v : 0;
    });
  }

  function renderSummary() {
    const order = search ? "・一致度順" : !me ? "" : meInside() ? "・近い順" : "・牛込保健センターに近い順";
    $("result-count").textContent = `${visible.length.toLocaleString()}件${order}`;
    const base = search ? NONE() : DEFAULT();
    const tags = [
      ...applied.tickets.map((t) => TICKETS.find((x) => x.key === t).label + "が使える"),
      ...(applied.mids.length ? applied.mids : applied.bigs),
      ...applied.areas,
      applied.assoc,
      applied.deleted ? "重複掲載を含む" : "",
    ].filter(Boolean);
    const note = !search ? ""
      : !visible.length ? (tags.length ? "検索語と条件に一致する店舗はありません" : `「${search.raw}」に一致する店舗はありません`)
      : search.fuzzy ? "完全に一致する店舗がないため、似た店舗を表示しています"
      : "全店舗から検索中";
    $("active-filters").innerHTML =
      (note ? `<span class="note">${esc(note)}</span>` : "") + tags.map((t) => `<span>${esc(t)}</span>`).join("");
    // 詳細設定のバッジ：初期状態（検索中は絞り込みなし）から変えた条件の数
    const changed =
      applied.bigs.length + applied.mids.length + applied.areas.length + (applied.assoc ? 1 : 0) + (applied.deleted ? 1 : 0) +
      (applied.tickets.join() !== base.tickets.join() ? 1 : 0);
    for (const id of ["filter-count", "more-count"]) {
      if (!$(id)) continue;
      $(id).hidden = !changed;
      $(id).textContent = changed;
    }
  }

  function cardHtml(s) {
    const c = s.category;
    return `<li class="card${s.id === activeId ? " active" : ""}" data-id="${s.id}" tabindex="0">
      <div class="thumb" style="--c:${c.color}">${icon(c.icon)}</div>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-name">${esc(s.name)}</h3>
          ${meInside() && isFinite(s.dist) ?`<span class="dist">${fmtDist(s.dist)}</span>` : ""}
        </div>
        <p class="meta">${esc(s.industry)}・${esc(s.assoc)}</p>
        <p class="addr"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none">${PIN_ICON}</svg>${esc(s.address.replace(/^東京都/, ""))}</p>
        <div class="tickets">
          ${s.support ? '<span class="tag support">応援券</span>' : ""}
          ${s.common ? '<span class="tag common">共通券</span>' : ""}
          ${s.deleted ? '<span class="tag dup">重複掲載</span>' : ""}
        </div>
      </div>
    </li>`;
  }

  function renderList() {
    const list = $("list");
    if (!visible.length) {
      list.innerHTML = '<li class="empty">条件に合う店舗がありません</li>';
      return;
    }
    const rest = visible.length - shown;
    list.innerHTML =
      visible.slice(0, shown).map(cardHtml).join("") +
      (rest > 0 ? `<li><button class="more" type="button">さらに表示（残り${rest.toLocaleString()}件）</button></li>` : "");
  }

  function renderMarkers(fit) {
    mapReady.then(() => {
      map.getSource("shops").setData(geojson());
      const pts = visible.filter((s) => s.latlng);
      if (!fit || !pts.length) return;
      popup.remove();
      const b = new maplibregl.LngLatBounds();
      pts.forEach((s) => b.extend(toLngLat(s.latlng)));
      map.fitBounds(b, { padding: 40, maxZoom: DETAIL_ZOOM, duration: 0 });
    });
  }

  function popupHtml(s) {
    const gmap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + " " + s.address)}`;
    return `<p class="pop-name">${esc(s.name)}</p>
      <p class="pop-meta">${esc(s.industry)}</p>
      <p class="pop-meta">${esc(s.address)}</p>
      <div class="tickets">
        ${s.support ? '<span class="tag support">応援券</span>' : ""}
        ${s.common ? '<span class="tag common">共通券</span>' : ""}
      </div>
      <div class="pop-links">
        ${s.tel ? `<a href="tel:${esc(s.tel)}">電話する</a>` : ""}
        <a href="${gmap}" target="_blank" rel="noopener">Googleマップ</a>
        ${/^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Webサイト</a>` : ""}
      </div>`;
  }

  function select(id, { fromMap = false } = {}) {
    activeId = id;
    document.querySelectorAll(".card.active").forEach((el) => el.classList.remove("active"));
    const s = shops.find((x) => x.id === id);
    mapReady.then(() => map.setFilter("pin-active", ["==", ["get", "id"], id]));

    if (fromMap) {
      const idx = visible.indexOf(s);
      if (idx >= shown) {
        shown = Math.ceil((idx + 1) / PAGE) * PAGE;
        renderList();
      }
      const card = document.querySelector(`.card[data-id="${id}"]`);
      if (card) {
        card.classList.add("active");
        card.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else {
      document.querySelector(`.card[data-id="${id}"]`)?.classList.add("active");
      if (!s.latlng) return;
      if (!isDesktop()) setSheet("peek");
      // 途中のズームのタイルを読まないよう、アニメーションなしで移動する
      // ポップアップが検索バーに隠れないよう、ピンを表示領域の少し下に置く
      map.easeTo({ center: toLngLat(s.latlng), zoom: Math.max(map.getZoom(), DETAIL_ZOOM), offset: [0, 70], duration: 0 });
    }
    if (s.latlng) popup.setLngLat(toLngLat(s.latlng)).setHTML(popupHtml(s)).addTo(map);
  }

  // ---------- bottom sheet ----------
  function setSheet(state) {
    document.body.dataset.sheet = state;
    $("sheet-toggle").setAttribute("aria-expanded", state === "full");
    showControls();
    if (state === "full") $("toast").hidden = true; // 一覧の上に重ならないよう閉じる
    if (state !== "full" && state !== baseSheet) {
      baseSheet = state;
      map.setPadding(mapPadding());
    }
  }
  $("sheet-toggle").addEventListener("click", () => {
    if (dragged) return (dragged = false); // ドラッグ直後のクリックは無視
    if (!isDesktop()) setSheet(document.body.dataset.sheet === "full" ? baseSheet : "full");
  });
  $("show-map").addEventListener("click", () => setSheet(baseSheet));

  // 持ち手を上下にドラッグ・フリックしてシートの高さを変える（指を離すと近い高さに吸着）
  const sheetHeight = (state) => (state === "full" ? $("sheet").offsetHeight : innerHeight * SHEET_RATIO[state]);
  let drag = null;
  let dragged = false;
  $("sheet-toggle").addEventListener("pointerdown", (e) => {
    if (isDesktop() || !e.isPrimary) return;
    const h = sheetHeight(document.body.dataset.sheet);
    drag = { startY: e.clientY, startH: h, h, y: e.clientY, t: e.timeStamp, v: 0 };
    dragged = false;
    $("sheet-toggle").setPointerCapture(e.pointerId);
  });
  $("sheet-toggle").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (!dragged && Math.abs(dy) < 6) return; // 小さな動きはタップとして扱う
    dragged = true;
    drag.v = (drag.y - e.clientY) / Math.max(e.timeStamp - drag.t, 1); // 上向きが正（px/ms）
    drag.y = e.clientY;
    drag.t = e.timeStamp;
    const full = sheetHeight("full");
    drag.h = Math.min(full, Math.max(sheetHeight("peek") * 0.7, drag.startH - dy));
    const sheet = $("sheet");
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${full - drag.h}px)`;
  });
  function endDrag() {
    if (!drag) return;
    const { h, v } = drag;
    drag = null;
    if (!dragged) return;
    const sheet = $("sheet");
    sheet.style.transition = sheet.style.transform = "";
    // 指を離したときの勢いを加味して、最も近い高さを選ぶ
    const target = h + v * 200;
    const next = ["peek", "half", "full"].reduce((a, b) => (Math.abs(sheetHeight(b) - target) < Math.abs(sheetHeight(a) - target) ? b : a));
    setSheet(next);
  }
  $("sheet-toggle").addEventListener("pointerup", endDrag);
  $("sheet-toggle").addEventListener("pointercancel", endDrag);

  // スマホでは一覧を下にスクロールしている間、分類バーと現在地ボタンを隠して一覧を見やすくする
  // 上にスクロールする・先頭に戻る・地図に触れると再表示する
  let lastScroll = 0;
  function showControls() {
    document.body.classList.remove("controls-hidden");
    lastScroll = $("list").scrollTop;
  }
  $("list").addEventListener("scroll", () => {
    if (isDesktop()) return;
    const top = $("list").scrollTop;
    if (Math.abs(top - lastScroll) < 8) return; // 指の小さな揺れは無視
    document.body.classList.toggle("controls-hidden", top > lastScroll && top > 24);
    lastScroll = top;
  }, { passive: true });
  map.getCanvasContainer().addEventListener("pointerdown", showControls);

  $("list").addEventListener("click", (e) => {
    if (e.target.closest(".more")) {
      shown += PAGE;
      renderList();
      return;
    }
    const card = e.target.closest(".card");
    if (card) select(Number(card.dataset.id));
  });
  $("list").addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select(Number(card.dataset.id));
    }
  });

  // ---------- search ----------
  let timer;
  $("q").addEventListener("input", (e) => {
    $("clear-q").hidden = !e.target.value.trim();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = parseQuery(e.target.value);
      if (next && !search) applied = NONE(); // 検索を始めた：絞り込みをすべて外して全店舗を対象にする
      if (!next && search) applied = DEFAULT(); // 検索語が空になった：初期状態に戻す
      search = next;
      $("list").scrollTop = 0;
      refreshKeepingView();
    }, 200);
  });
  // 検索をやめて、絞り込みも初期状態に戻す
  function resetSearch() {
    clearTimeout(timer);
    $("q").value = "";
    $("clear-q").hidden = true;
    search = null;
    applied = DEFAULT();
  }
  $("clear-q").addEventListener("click", () => {
    resetSearch();
    refreshKeepingView();
    $("q").focus();
  });
  $("q").addEventListener("focus", () => !isDesktop() && setSheet("full"));

  // ---------- floating category bar ----------
  // 地図上で1タップで分類を切り替える（単一選択。もう一度押すと解除）。詳細な複数選択は絞り込み画面で行う
  const without = (f, ...keys) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, []])) });
  function countBy(field, filter) {
    const n = {};
    for (const s of shops) if (matches(s, filter) && hit(s)) n[s[field]] = (n[s[field]] || 0) + 1;
    return n;
  }
  const pill = (attrs, label, on, count, iconKey) =>
    `<button type="button" class="pill${on ? " on" : ""}" ${attrs} aria-pressed="${on}"${count ? "" : " data-empty"}>` +
    (iconKey ? icon(iconKey) : "") + `<span>${esc(label)}</span><small>${count.toLocaleString()}</small></button>`;

  function renderCategoryBar() {
    // 件数は検索中なら検索結果の中での件数
    const bigCounts = countBy("big", without(applied, "bigs", "mids"));
    const bigs = applied.bigs;
    $("cat-big").innerHTML =
      CATEGORIES.map((c) => pill(`data-big="${esc(c.key)}" style="--c:${c.color}"`, c.key, bigs.includes(c.key), bigCounts[c.key] || 0, c.icon)).join("") +
      `<button type="button" class="pill pill-more" data-more>${icon("filter")}<span>詳細設定</span><span id="more-count" class="pill-badge" hidden></span></button>`;
    const only = bigs.length === 1 ? categoryOf(bigs[0]) : null;
    const showMid = !!only && only.mids.length > 1;
    $("cat-mid").hidden = !showMid;
    if (document.body.classList.contains("has-mid") !== showMid) {
      document.body.classList.toggle("has-mid", showMid);
      map.setPadding(mapPadding());
    }
    if (showMid) {
      const midCounts = countBy("mid", without(applied, "mids"));
      const total = only.mids.reduce((n, m) => n + (midCounts[m] || 0), 0);
      $("cat-mid").innerHTML =
        pill('data-mid=""', "すべて", !applied.mids.length, total) +
        only.mids.map((m) => pill(`data-mid="${esc(m)}"`, m, applied.mids.includes(m), midCounts[m] || 0)).join("");
    }
  }

  // 表示中の範囲に該当店舗がなければ、該当店舗が収まるように地図を動かす
  function refreshKeepingView() {
    refresh();
    mapReady.then(() => {
      const b = map.getBounds();
      const inView = visible.some((s) => s.latlng && b.contains(toLngLat(s.latlng)));
      if (!inView) renderMarkers(true);
    });
  }

  $("cat-big").addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b) return;
    if ("more" in b.dataset) return openFilter();
    const key = b.dataset.big;
    const same = applied.bigs.length === 1 && applied.bigs[0] === key;
    applied = { ...applied, bigs: same ? [] : [key], mids: [] };
    popup.remove();
    refreshKeepingView();
    if (!same) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  $("cat-mid").addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b) return;
    const m = b.dataset.mid;
    const same = applied.mids.length === 1 && applied.mids[0] === m;
    applied = { ...applied, mids: !m || same ? [] : [m] };
    popup.remove();
    refreshKeepingView();
  });

  // ---------- filter sheet ----------
  const chip = (value, label, on) => `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;

  function renderFilter() {
    $("f-ticket").innerHTML = TICKETS.map((t) => chip(t.key, t.label, draft.tickets.includes(t.key))).join("");
    $("f-big").innerHTML = CATEGORIES.map((c) => chip(c.key, c.key, draft.bigs.includes(c.key))).join("");
    const mids = CATEGORIES.filter((c) => draft.bigs.includes(c.key) && c.mids.length > 1).flatMap((c) => c.mids);
    draft.mids = draft.mids.filter((m) => mids.includes(m));
    $("f-mid-wrap").hidden = !mids.length;
    $("f-mid").innerHTML = mids.map((m) => chip(m, m, draft.mids.includes(m))).join("");
    $("f-area").innerHTML = AREAS.map((a) => chip(a, a, draft.areas.includes(a))).join("");
    const assocs = [...new Set(shops.filter((s) => !draft.areas.length || draft.areas.includes(s.area)).map((s) => s.assoc))];
    if (draft.assoc && !assocs.includes(draft.assoc)) draft.assoc = "";
    $("f-assoc").innerHTML =
      '<option value="">すべての商店会</option>' +
      assocs.map((a) => `<option value="${esc(a)}"${a === draft.assoc ? " selected" : ""}>${esc(a)}</option>`).join("");
    $("f-deleted").checked = draft.deleted;
    // 検索中は検索結果の中での件数。リセットを押した後は検索をやめるので、検索なしの件数
    const n = shops.filter((s) => matches(s, draft) && (resetPending || hit(s))).length;
    $("apply").textContent = `結果を表示（${n.toLocaleString()}件）`;
    $("apply").disabled = n === 0;
  }

  function bindChips(id, field) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const v = b.dataset.value;
      draft[field] = draft[field].includes(v) ? draft[field].filter((x) => x !== v) : [...draft[field], v];
      renderFilter();
    });
  }
  bindChips("f-ticket", "tickets");
  bindChips("f-big", "bigs");
  bindChips("f-mid", "mids");
  bindChips("f-area", "areas");
  $("f-assoc").addEventListener("change", (e) => {
    draft.assoc = e.target.value;
    renderFilter();
  });
  $("f-deleted").addEventListener("change", (e) => {
    draft.deleted = e.target.checked;
    renderFilter();
  });

  let resetPending = false; // 絞り込み画面でリセットを押した（適用すると検索もやめる）
  function openFilter() {
    draft = structuredClone(applied);
    resetPending = false;
    renderFilter();
    $("filter").hidden = $("filter-backdrop").hidden = false;
    $("apply").focus();
  }
  function closeFilter() {
    $("filter").hidden = $("filter-backdrop").hidden = true;
    $("open-filter").focus();
  }
  $("open-filter").addEventListener("click", openFilter);
  $("filter-backdrop").addEventListener("click", closeFilter);
  document.addEventListener("keydown", (e) => e.key === "Escape" && !$("filter").hidden && closeFilter());
  $("reset").addEventListener("click", () => {
    draft = DEFAULT();
    resetPending = !!search;
    renderFilter();
  });
  $("apply").addEventListener("click", () => {
    if (resetPending) resetSearch();
    applied = structuredClone(draft); // 検索中なら検索結果にかけ合わせる
    closeFilter();
    refresh({ fit: true });
  });

  // ---------- current location ----------
  // reset=true（ボタン操作）のときは選択状態を解除し、現在地を起点に地図と一覧を描き直す
  function showMe(pos, { reset }) {
    me = [pos.coords.latitude, pos.coords.longitude];
    const inside = meInside();
    $("locate").classList.toggle("on", inside);
    if (meMarker) meMarker.setLngLat(toLngLat(me));
    else {
      const el = document.createElement("div");
      el.className = "me";
      el.innerHTML =
        '<span class="me-label">現在地</span>' +
        '<svg class="me-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 23s8-6.8 8-13a8 8 0 0 0-16 0c0 6.2 8 13 8 13Z" fill="#2f80ed" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="10" r="3.4" fill="#fff"/></svg>';
      // ピンの先端が現在地を指すよう下端を基準にする（DOM のマーカーなので店舗のピンより手前に出る）
      meMarker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(toLngLat(me)).addTo(map);
    }
    if (reset) {
      popup.remove();
      activeId = null;
      mapReady.then(() => map.setFilter("pin-active", ["==", ["get", "id"], -1]));
      // 近い順の一覧が主役になるので、シートを広げて店舗情報を多く見せる（地図は現在地周辺だけ）
      if (!isDesktop()) setSheet("half");
    }
    const zoom = reset ? START_ZOOM : Math.max(map.getZoom(), START_ZOOM);
    map.jumpTo({ center: toLngLat(inside ? me : HOME), zoom });
    refresh();
    $("list").scrollTop = 0;
    if (!inside) toast("現在地が新宿区外のため、牛込保健センターに近い順に表示しています");
    else if (reset) toast("現在地から近い順に表示しています");
  }

  function setLocating(busy) {
    $("locate").setAttribute("aria-busy", busy);
    $("locate-label").textContent = busy ? "現在地を取得中…" : "現在地から探す";
  }

  function locate({ silent = false } = {}) {
    if (!navigator.geolocation) return silent || toast("この端末では現在地を取得できません");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        showMe(pos, { reset: !silent });
      },
      (err) => {
        setLocating(false);
        if (!silent) toast(err.code === 1 ? "位置情報の利用が許可されていません。ブラウザの設定をご確認ください" : "現在地を取得できませんでした");
      },
      // 起動時は速さ優先で5分以内の位置を再利用。ボタン操作時は30秒以内の位置まで
      { enableHighAccuracy: false, maximumAge: silent ? 300000 : 30000, timeout: 10000 }
    );
  }
  $("locate").addEventListener("click", () => locate());

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 4000);
  }
  $("toast").addEventListener("click", () => ($("toast").hidden = true));

  // 地図以外の場所をピンチしてページ全体が拡大され、画面が崩れるのを防ぐ
  // （iOS Safari は viewport の maximum-scale を無視するため。地図のピンチ操作には影響しない）
  for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

  // ---------- boot ----------
  // 店舗データと現在地は並行して取りにいく（地図は牛込保健センターを起点にすぐ表示）
  locate({ silent: true });
  fetch("data/shops.json")
    .then((r) => r.json())
    .then((data) => {
      shops = data.map((s) => ({ ...s, name: tidy(s.name), industry: tidy(s.industry), address: tidy(s.address), category: categoryOf(s.big), f: {
        name: fold(s.name),
        cat: fold([s.industry, s.big, s.mid].join(" ")),
        place: fold([s.address.replace(/^東京都新宿区/, ""), s.assoc, s.area].join(" ")),
      } }));
      refresh();
    })
    .catch(() => {
      $("list").innerHTML = '<li class="empty">店舗データを読み込めませんでした</li>';
    });
})();
