(() => {
  "use strict";

  // ---------- master data ----------
  const ICONS = {
    food: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 2-2 6 0 8v10"/>',
    grocery: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    fashion: '<path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z"/>',
    beauty: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z"/>',
    shop: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    service: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  };
  const GENRES = [
    { key: "food", label: "飲食", color: "#ec6a3c", industries: ["居酒屋・ダイニングバー", "和食・大衆食堂", "喫茶店・カフェ", "中華料理・韓国料理", "洋食・レストラン", "フレンチ・イタリアン", "その他飲食店", "寿司", "焼肉・鉄板焼", "そば・うどん", "バー・スナック・パブ", "カレー・エスニック料理", "ラーメン"] },
    { key: "grocery", label: "食品・スーパー", color: "#3a9d5d", industries: ["食料品販売", "スーパーマーケット", "コンビニエンスストア", "酒店", "パン・サンドイッチ販売", "米穀店"] },
    { key: "fashion", label: "ファッション", color: "#8a5cd0", industries: ["婦人服販売", "衣料品・寝具販売", "靴・バッグ販売", "紳士服販売", "時計販売", "眼鏡・コンタクトレンズ販売"] },
    { key: "beauty", label: "美容・健康", color: "#d6487e", industries: ["ドラッグストア", "理容業・美容業", "エステ・リラクゼーション", "鍼灸・あん摩マッサージ", "整体・ボディケア", "化粧品販売", "銭湯・サウナ"] },
    { key: "shop", label: "ショッピング", color: "#2f7fd6", industries: ["その他小売店", "百貨店・商業施設", "生花・植木販売", "家電販売", "日用雑貨販売", "文具店", "スポーツ用品店", "書店", "ゲーム・おもちゃ・娯楽用品", "カメラ・写真用品販売"] },
    { key: "service", label: "暮らし・サービス", color: "#6b7280", industries: ["その他サービス業", "クリーニング店", "ホテル・旅館", "カルチャー教室", "その他の業種"] },
  ];
  const genreOf = (industry) => GENRES.find((g) => g.industries.includes(industry)) || GENRES[GENRES.length - 1];
  const TICKETS = [
    { key: "support", label: "応援券" },
    { key: "common", label: "共通券" },
  ];
  const AREAS = ["四谷", "新宿", "淀橋A", "淀橋B", "戸塚", "早稲田", "神楽坂"];
  const DEFAULT = () => ({ tickets: ["support"], genres: [], areas: [], assoc: "", deleted: false });
  const PAGE = 60;

  // ---------- state ----------
  let shops = [];
  let applied = DEFAULT();
  let draft = DEFAULT();
  let query = "";
  let me = null; // [lat, lng]
  let visible = [];
  let shown = PAGE;
  let activeId = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isDesktop = () => matchMedia("(min-width: 900px)").matches;
  const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
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

  const mapPadding = () => (isDesktop() ? { top: 20, bottom: 20, left: 20, right: 20 } : { top: 70, bottom: Math.round(innerHeight * 0.42), left: 0, right: 0 });
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
    (!f.genres.length || f.genres.includes(s.genre.key)) &&
    (!f.areas.length || f.areas.includes(s.area)) &&
    (!f.assoc || s.assoc === f.assoc) &&
    (!query || s.text.includes(query));

  const distance = (a, b) => {
    const R = 6371e3, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

  function refresh({ fit = false } = {}) {
    visible = shops.filter((s) => matches(s, applied));
    if (me) {
      visible.forEach((s) => (s.dist = s.latlng ? distance(me, s.latlng) : Infinity));
      visible.sort((a, b) => a.dist - b.dist);
    }
    shown = PAGE;
    renderList();
    renderMarkers(fit);
    renderSummary();
  }

  function renderSummary() {
    $("result-count").textContent = `${visible.length.toLocaleString()}件${me ? "・近い順" : ""}`;
    const d = DEFAULT();
    const tags = [
      ...applied.tickets.map((t) => TICKETS.find((x) => x.key === t).label + "が使える"),
      ...applied.genres.map((g) => GENRES.find((x) => x.key === g).label),
      ...applied.areas,
      applied.assoc,
      applied.deleted ? "重複掲載を含む" : "",
    ].filter(Boolean);
    $("active-filters").innerHTML = tags.map((t) => `<span>${esc(t)}</span>`).join("");
    const changed =
      applied.genres.length + applied.areas.length + (applied.assoc ? 1 : 0) + (applied.deleted ? 1 : 0) +
      (applied.tickets.join() !== d.tickets.join() ? 1 : 0);
    $("filter-count").hidden = !changed;
    $("filter-count").textContent = changed;
  }

  function cardHtml(s) {
    const g = s.genre;
    return `<li class="card${s.id === activeId ? " active" : ""}" data-id="${s.id}" tabindex="0">
      <div class="thumb" style="--c:${g.color}">${icon(g.key)}</div>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-name">${esc(s.name)}</h3>
          ${me && isFinite(s.dist) ? `<span class="dist">${fmtDist(s.dist)}</span>` : ""}
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
      map.easeTo({ center: toLngLat(s.latlng), zoom: Math.max(map.getZoom(), DETAIL_ZOOM), offset: [0, 90], duration: 0 });
    }
    if (s.latlng) popup.setLngLat(toLngLat(s.latlng)).setHTML(popupHtml(s)).addTo(map);
  }

  // ---------- bottom sheet ----------
  function setSheet(state) {
    $("sheet").dataset.state = state;
    $("sheet-toggle").setAttribute("aria-expanded", state === "full");
  }
  $("sheet-toggle").addEventListener("click", () => {
    if (!isDesktop()) setSheet($("sheet").dataset.state === "full" ? "peek" : "full");
  });

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
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = norm(e.target.value);
      refresh();
    }, 200);
  });
  $("q").addEventListener("focus", () => !isDesktop() && setSheet("full"));

  // ---------- filter sheet ----------
  const chip = (value, label, on) => `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;

  function renderFilter() {
    $("f-ticket").innerHTML = TICKETS.map((t) => chip(t.key, t.label, draft.tickets.includes(t.key))).join("");
    $("f-genre").innerHTML = GENRES.map((g) => chip(g.key, g.label, draft.genres.includes(g.key))).join("");
    $("f-area").innerHTML = AREAS.map((a) => chip(a, a, draft.areas.includes(a))).join("");
    const assocs = [...new Set(shops.filter((s) => !draft.areas.length || draft.areas.includes(s.area)).map((s) => s.assoc))];
    if (draft.assoc && !assocs.includes(draft.assoc)) draft.assoc = "";
    $("f-assoc").innerHTML =
      '<option value="">すべての商店会</option>' +
      assocs.map((a) => `<option value="${esc(a)}"${a === draft.assoc ? " selected" : ""}>${esc(a)}</option>`).join("");
    $("f-deleted").checked = draft.deleted;
    const n = shops.filter((s) => matches(s, draft)).length;
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
  bindChips("f-genre", "genres");
  bindChips("f-area", "areas");
  $("f-assoc").addEventListener("change", (e) => {
    draft.assoc = e.target.value;
    renderFilter();
  });
  $("f-deleted").addEventListener("change", (e) => {
    draft.deleted = e.target.checked;
    renderFilter();
  });

  function openFilter() {
    draft = structuredClone(applied);
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
    renderFilter();
  });
  $("apply").addEventListener("click", () => {
    applied = structuredClone(draft);
    closeFilter();
    refresh({ fit: true });
  });

  // ---------- current location ----------
  // reset=true（ボタン操作）のときは選択状態を解除し、現在地を起点に地図と一覧を描き直す
  function showMe(pos, { reset }) {
    me = [pos.coords.latitude, pos.coords.longitude];
    $("locate").classList.add("on");
    if (meMarker) meMarker.setLngLat(toLngLat(me));
    else {
      const el = document.createElement("div");
      el.className = "me";
      meMarker = new maplibregl.Marker({ element: el }).setLngLat(toLngLat(me)).addTo(map);
    }
    if (reset) {
      popup.remove();
      activeId = null;
      mapReady.then(() => map.setFilter("pin-active", ["==", ["get", "id"], -1]));
      if (!isDesktop()) setSheet("peek");
    }
    const inside = inBounds(me);
    const zoom = reset ? START_ZOOM : Math.max(map.getZoom(), START_ZOOM);
    map.jumpTo({ center: toLngLat(inside ? me : HOME), zoom });
    refresh();
    $("list").scrollTop = 0;
    if (!inside) toast("現在地が新宿区外のため、牛込保健センター周辺を表示しています");
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

  // ---------- boot ----------
  // 店舗データと現在地は並行して取りにいく（地図は牛込保健センターを起点にすぐ表示）
  locate({ silent: true });
  fetch("data/shops.json")
    .then((r) => r.json())
    .then((data) => {
      shops = data.map((s) => ({ ...s, genre: genreOf(s.industry), text: norm([s.name, s.industry, s.address, s.assoc, s.area].join(" ")) }));
      refresh();
    })
    .catch(() => {
      $("list").innerHTML = '<li class="empty">店舗データを読み込めませんでした</li>';
    });
})();
