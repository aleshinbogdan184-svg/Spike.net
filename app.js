/* =========================================================
   Spike.net — compact video feed
   Чистый vanilla JS, данные в localStorage
   ========================================================= */

const STORAGE_KEY = "spike.items.v4";
const LIKED_KEY = "spike.liked.v4";
const LEGACY_KEYS = ["predlozhka.items.v2", "spike.items.v3"];

const TYPES = {
  youtube: { label: "YouTube", icon: "▶" },
  twitch:  { label: "Twitch", icon: "▣" },
  film:    { label: "Spike Кино",   icon: "🎬" },
  series:  { label: "Сериал",  icon: "📺" },
  game:    { label: "Steam",    icon: "🎮" },
  music:   { label: "Музыка",  icon: "🎵" },
  other:   { label: "Другое",  icon: "✦" },
};

/* Переливающиеся градиенты-заглушки (иридесцентные) */
const GRADS = [
  "linear-gradient(135deg,#7c5cff,#22d3ee)",
  "linear-gradient(135deg,#f472b6,#fbbf24)",
  "linear-gradient(135deg,#34d399,#22d3ee)",
  "linear-gradient(135deg,#fb7185,#7c5cff)",
  "linear-gradient(135deg,#fbbf24,#f472b6)",
  "linear-gradient(135deg,#22d3ee,#7c5cff)",
  "linear-gradient(135deg,#a78bfa,#34d399)",
  "linear-gradient(135deg,#38bdf8,#f472b6)",
];

/* ---------------- state ---------------- */

let items = [];
let liked = new Set();
let activeType = "all";
let activeWatch = "all";
let searchQuery = "";
let sortMode = "likes";
let editingId = null;
let formTags = [];
let formYtId = "";
let viewId = null;

/* ---------------- helpers ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const escapeHTML = (str = "") =>
  String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "только что";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

function fmtNum(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(".0", "") + "K";
  return String(n);
}

function normalizeUrl(url) {
  if (!url) return "";
  url = String(url).trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { return new URL(url).href; } catch { return ""; }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function gradFor(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return GRADS[Math.abs(h) % GRADS.length];
}

/* human title from a URL slug (/app/123/Hollow_Knight_Silksong/) */
function slugTitle(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const raw = [...parts].reverse().find((p) => /[a-zA-Z]{3,}/.test(p) && !/^\d+$/.test(p));
    if (!raw) return "";
    return decodeURIComponent(raw)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch { return ""; }
}

/* ---------------- source detection / thumbnails ---------------- */

function ytIdFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12);
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") return (u.searchParams.get("v") || "").slice(0, 11);
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* ignore */ }
  return "";
}

/* Steam app id → можно сразу отдать обложку */
function steamAppId(url) {
  try {
    const m = new URL(url).pathname.match(/\/app\/(\d+)/);
    if (m) return m[1];
  } catch { /* ignore */ }
  const m = String(url || "").match(/\/app\/(\d+)/);
  return m ? m[1] : "";
}

/* Twitch логин канала → превью стрима */
function twitchLogin(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "www.twitch.tv" && u.hostname !== "twitch.tv") return "";
    const seg = u.pathname.split("/").filter(Boolean);
    if (!seg.length) return "";
    if (seg.length !== 1) return "";
    if (["videos", "clip", "directory", "downloads"].includes(seg[0])) return "";
    return seg[0].replace(/[^\w]/g, "");
  } catch { return ""; }
}

function steamThumb(appId) {
  return appId ? `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg` : "";
}
function twitchThumb(login) {
  return login ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg` : "";
}
function youtubeThumb(id) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}
function youtubeThumbHD(id) {
  return id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : "";
}

/* Лучшая обложка для карточки ("" → рисуем иридесцентную заглушку) */
function thumbUrl(it) {
  if (it.poster) return it.poster;
  if (it.ytId) return youtubeThumb(it.ytId);
  const steam = detectSource(it.url).type === "game" ? steamAppId(it.url) : "";
  if (steam) return steamThumb(steam);
  const tw = twitchLogin(it.url);
  if (tw) return twitchThumb(tw);
  if (it.cover) return it.cover;
  return "";
}

function fallbackThumb(it) {
  if (it.ytId) return youtubeThumb(it.ytId);
  return "";
}

function detectSource(url) {
  const host = hostOf(url);
  const is = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (is("youtube.com") || is("youtu.be")) return { type: "youtube", source: "YouTube", ytId: ytIdFromUrl(url) };
  if (is("twitch.tv") || is("clips.twitch.tv")) return { type: "twitch", source: "Twitch", ytId: "" };
  if (is("steampowered.com") || is("steamcommunity.com")) return { type: "game", source: "Steam", ytId: "" };
  if (["music.yandex.ru", "music.yandex.com", "music.yandex.by", "music.yandex.kz"].some(is)) return { type: "music", source: "Яндекс Музыка", ytId: "" };
  if (is("spotify.com") || is("spotify.link")) return { type: "music", source: "Spotify", ytId: "" };
  if (is("soundcloud.com") || is("on.soundcloud.com")) return { type: "music", source: "SoundCloud", ytId: "" };
  if (is("kinopoisk.ru")) return { type: "film", source: "Кинопоиск", ytId: "" };
  return { type: "other", source: host, ytId: "" };
}

/* ---------------- storage ---------------- */

function load() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        const legacy = localStorage.getItem(k);
        if (legacy) { raw = legacy; break; }
      }
    }
    items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];
  } catch { items = []; }

  try {
    const raw = localStorage.getItem(LIKED_KEY);
    liked = new Set(raw ? JSON.parse(raw) : []);
  } catch { liked = new Set(); }

  items = items.filter(Boolean).map((it) => ({
    id: it.id || uid(),
    title: String(it.title || "Без названия"),
    type: TYPES[it.type] ? it.type : "other",
    url: it.url || "",
    year: it.year || "",
    desc: it.desc || "",
    tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
    source: it.source || hostOf(it.url || ""),
    ytId: it.ytId || ytIdFromUrl(it.url || ""),
    poster: it.poster || "",
    cover: it.cover || "",
    likes: Number.isFinite(it.likes) ? it.likes : 0,
    views: Number.isFinite(it.views) ? it.views : 0,
    watched: Boolean(it.watched),
    comments: Array.isArray(it.comments) ? it.comments : [],
    createdAt: Number.isFinite(it.createdAt) ? it.createdAt : Date.now(),
  }));

  if (!localStorage.getItem(STORAGE_KEY)) {
    const demoTitles = new Set(["Hollow Knight: Silksong — геймплей", "Как работает рекомендательная система YouTube", "Глубокое погружение в Kenshi", "Топ-10 малоизвестных инди-игр"]);
    items = items.filter((it) => detectSource(it.url).type !== "other" && !demoTitles.has(it.title)).map((it) => ({
      ...it, type: detectSource(it.url).type, source: detectSource(it.url).source,
      likes: 0, views: 0, watched: false, comments: [],
    }));
    save();
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function saveLiked() {
  try { localStorage.setItem(LIKED_KEY, JSON.stringify([...liked])); } catch {}
}

function seed() {
  const now = Date.now();
  const H = 36e5;
  items = [
    { id: uid(), title: "Dune: Part Three — официальный трейлер", type: "film", source: "IMDb", year: "2026",
      url: "https://www.imdb.com/title/tt15239678/", likes: 51, views: 184, watched: false,
      tags: ["фантастика", "эпик"], desc: "Завершение трилогии Вильнёва. Пол ведёт войну против Великих Домов.",
      createdAt: now - 26 * H },
    { id: uid(), title: "Hollow Knight: Silksong — геймплей", type: "game", source: "Steam", year: "2025",
      url: "https://store.steampowered.com/app/1030300/", likes: 47, views: 271, watched: true,
      tags: ["метроидвания", "инди"], desc: "Официальное продолжение Hollow Knight: боссы, локации, механики.",
      createdAt: now - 50 * H },
    { id: uid(), title: "Как работает рекомендательная система YouTube", type: "youtube", source: "YouTube", year: "2024",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", likes: 36, views: 524, watched: true,
      tags: ["технологии", "алгоритмы"], desc: "Разбор алгоритмов рекомендаций: почему лента затягивает.",
      createdAt: now - 80 * H },
    { id: uid(), title: "Blade Runner 2099 — тизер сериала", type: "series", source: "IMDb", year: "S01",
      url: "https://www.imdb.com/", likes: 22, views: 166, watched: false,
      tags: ["киберпанк", "sci-fi"], desc: "Продолжение вселенной «Бегущего по лезвию».",
      createdAt: now - 32 * H },
    { id: uid(), title: "Глубокое погружение в Kenshi", type: "game", source: "Steam", year: "2018",
      url: "https://store.steampowered.com/app/233860/", likes: 14, views: 98, watched: false,
      tags: ["песочница", "выживание", "рпг"], desc: "Хардкорная песочница без сюжета — отличный кандидат для летсплея.",
      createdAt: now - 120 * H },
    { id: uid(), title: "Blinding Lights — The Weeknd", type: "music", source: "Spotify", year: "2020",
      url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b", likes: 8, views: 44, watched: true,
      tags: ["поп", "синти"], desc: "Один из самых прослушиваемых треков десятилетия.",
      createdAt: now - 160 * H },
    { id: uid(), title: "Что нового на Netflix в 2026", type: "series", source: "Netflix", year: "2026",
      url: "https://www.netflix.com/", likes: 6, views: 29, watched: false,
      tags: ["стриминг", "обзор"], desc: "Подборка главных премьер года.",
      createdAt: now - 180 * H },
    { id: uid(), title: "Топ-10 малоизвестных инди-игр", type: "game", source: "Steam", year: "2024",
      url: "https://store.steampowered.com/", likes: 4, views: 19, watched: false,
      tags: ["инди", "подборка"], desc: "Недооценённые инди, в которые стоит поиграть.",
      createdAt: now - 240 * H },
  ];
  save();
}

/* ---------------- derived ---------------- */

function filtered() {
  const q = searchQuery.trim().toLowerCase();
  const list = items.filter((it) => {
    if (activeType !== "all" && it.type !== activeType) return false;
    if (activeWatch === "watched" && !it.watched) return false;
    if (activeWatch === "unwatched" && it.watched) return false;
    if (q) {
      const hay = [it.title, it.desc, it.year, it.source, ...it.tags].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const cmp = {
    likes: (a, b) => b.likes - a.likes || b.views - a.views,
    views: (a, b) => b.views - a.views || b.likes - a.likes,
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
  }[sortMode] || ((a, b) => b.likes - a.likes);
  return [...list].sort(cmp);
}

function categoryRows() {
  const map = new Map();
  items.forEach((it) => {
    if (!map.has(it.type)) {
      map.set(it.type, { type: it.type, count: 0, likes: 0, views: 0, watched: 0, top: null });
    }
    const row = map.get(it.type);
    row.count++;
    row.likes += it.likes;
    row.views += it.views;
    if (it.watched) row.watched++;
    if (!row.top || it.views > row.top.views) row.top = it;
  });
  return [...map.values()].sort((a, b) => b.views - a.views);
}

function totalViews() {
  return items.reduce((sum, it) => sum + it.views, 0);
}

/* ---------------- toast ---------------- */

let toastTimer;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2100);
}

/* ---------------- thumbnails (render helpers) ---------------- */

/* Иридесцентная заглушка с иконкой и буквой — «превью» для любого видео */
function fallbackHTML(it) {
  const meta = TYPES[it.type] || TYPES.other;
  const letter = escapeHTML((it.title || "?").trim().charAt(0).toUpperCase() || "?");
  return `<span class="poster-fb" style="background:${gradFor(it.title)}">
      <span class="poster-fb-icon">${meta.icon}</span>
      <span class="poster-fb-letter">${letter}</span>
    </span>`;
}

/* Разметка обложки: img c graceful-fallback на градиент */
function thumbHTML(it) {
  const src = thumbUrl(it);
  const fb = fallbackThumb(it);
  const grad = gradFor(it.title);
  if (!src) return `<div class="thumb-img-wrap" style="background:${grad}">${fallbackHTML(it)}</div>`;
  const onerr = fb
    ? `onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb='';this.onerror=null;}"`
    : `onerror="this.remove()"`;
  const dataFb = fb ? ` data-fb="${escapeHTML(fb)}"` : "";
  return `<div class="thumb-img-wrap" style="background:${grad}">
      <img class="thumb-img" src="${escapeHTML(src)}"${dataFb} alt="" loading="lazy" referrerpolicy="no-referrer" ${onerr}>
      ${fallbackHTML(it)}
    </div>`;
}

function thumbStyle(it) {
  // оставлено для совместимости: возвращает background, если картинки нет
  return thumbUrl(it) ? "" : `background:${gradFor(it.title)};`;
}

function typePill(type) {
  const t = TYPES[type] || TYPES.other;
  return `<span class="type-pill type-${type}">${t.icon} ${escapeHTML(t.label)}</span>`;
}

function cardHTML(it, index) {
  const isLiked = liked.has(it.id);
  return `
    <article class="video-card" data-id="${it.id}" style="animation-delay:${clamp(index, 0, 12) * 30}ms">
      <button class="thumb" data-watch="${escapeHTML(it.id)}" type="button" aria-label="Открыть ${escapeHTML(it.title)} на сайте ${escapeHTML(it.source || 'источника')}">
        ${thumbHTML(it)}
        <div class="overlay"></div>
        <div class="badges">
          ${it.watched ? `<span class="watched-badge">✔ просмотрено</span>` : ""}
        </div>
        <span class="views-badge">👁 ${fmtNum(it.views)}</span>
      </button>
      <div class="video-card-body">
        <div class="card-top">
          ${typePill(it.type)}
          <span class="source-pill">${escapeHTML(it.source || "ссылка")}</span>
        </div>
        <h3 class="card-title">${escapeHTML(it.title)}</h3>
        <div class="card-meta">
          ${it.year ? `<span>${escapeHTML(it.year)}</span>` : ""}
          <span>👁 ${fmtNum(it.views)}</span>
          <span>${timeAgo(it.createdAt)}</span>
        </div>
        ${it.tags.length ? `<div class="card-tags">${it.tags.slice(0, 4).map((t) => `<span class="card-tag">#${escapeHTML(t)}</span>`).join("")}</div>` : ""}
        <div class="video-card-foot">
          <button class="card-foot-btn bookmark-btn" data-bookmark="${escapeHTML(it.id)}" type="button" title="Сохранить в закладки">☆</button>
          <button class="card-foot-btn like-btn ${isLiked ? "liked" : ""}" data-like="${it.id}" type="button" title="Лайк">
            <span class="pixel-heart" aria-hidden="true">♥</span><span>${it.likes}</span>
          </button>
          <button class="card-foot-btn" data-open="${it.id}" type="button" title="Комментарии">💬 ${(it.comments || []).length}</button>
          <button class="card-foot-btn watch-btn" data-watch="${it.id}" type="button" title="${it.watched ? "Смотреть ещё раз" : "Смотреть"}">
            ▶ ${it.watched ? "Ещё" : "Смотреть"}
          </button>
          <button class="card-foot-btn ${it.watched ? "watched" : ""}" data-watched="${it.id}" type="button" title="Просмотрено / не просмотрено">
            ${it.watched ? "✔" : "○"}
          </button>
          <div class="card-actions">
            <button class="icon-btn" data-open="${it.id}" type="button" title="Подробнее">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            </button>
            <button class="icon-btn danger" data-del="${it.id}" type="button" title="Удалить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </article>`;
}

function trendsHTML() {
  const top = [...items].sort((a, b) => b.likes - a.likes || b.views - a.views).slice(0, 12);
  if (!top.length) {
    return `<div class="empty-inner" style="grid-column:1/-1;"><p>Пока нет видео — добавь ссылку</p></div>`;
  }
  return top.map((it, i) => `
    <article class="trend-item" data-open="${it.id}" style="animation-delay:${i * 30}ms">
      <span class="trend-rank ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}">${i + 1}</span>
      <div class="trend-thumb">
        ${thumbHTML(it)}
        <div class="overlay"></div>
      </div>
      <div class="trend-body">
        <h3 class="trend-name">${escapeHTML(it.title)}</h3>
        <div class="trend-sub">
          ${typePill(it.type)}
          <span>${escapeHTML(it.year || "—")}</span>
          <span class="sep">·</span>
          <span>${escapeHTML(it.source || "ссылка")}</span>
        </div>
      </div>
      <div class="trend-stats">
        <span class="trend-likes">❤ ${it.likes}</span>
        <span class="trend-views">👁 ${fmtNum(it.views)}</span>
      </div>
    </article>`).join("");
}

function categoriesHTML() {
  const rows = categoryRows();
  if (!rows.length) {
    return `<div class="empty-inner" style="grid-column:1/-1;"><p>Категорий пока нет</p></div>`;
  }
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  const colors = {
    youtube: "#ff5b6e", film: "#a78bfa", series: "#22d3ee",
    game: "#34d399", music: "#f472b6", other: "#cbd5e1",
  };
  return rows.map((r) => {
    const meta = TYPES[r.type] || TYPES.other;
    const topSrc = r.top ? thumbUrl(r.top) : "";
    const topInner = r.top
      ? (topSrc
          ? `<img class="thumb-img" src="${escapeHTML(topSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${fallbackHTML(r.top)}`
          : fallbackHTML(r.top))
      : "";
    return `
      <article class="cat-card">
        <div class="cat-head">
          <span class="cat-icon" style="background:${colors[r.type] || "#cbd5e1"}">${meta.icon}</span>
          <div class="cat-info">
            <h3 class="cat-name">${escapeHTML(meta.label)}</h3>
            <span class="cat-count">${r.count} ${plural(r.count, ["видео", "видео", "видео"])} · ${r.watched} просмотрено</span>
          </div>
        </div>
        <div class="cat-body">
          <div class="cat-stat-row">
            <span class="cat-stat-val">${fmtNum(r.views)}</span>
            <span class="cat-stat-lbl">просмотров</span>
            <span class="cat-stat-val" style="margin-left:auto;font-size:14px;-webkit-text-fill-color:var(--red);color:var(--red)">❤ ${r.likes}</span>
          </div>
          <div class="cat-bar"><div class="cat-bar-inner" style="width:${(r.views / maxViews * 100).toFixed(1)}%"></div></div>
          ${r.top ? `
          <div class="cat-top">
            <span class="cat-top-thumb" style="background:${gradFor(r.top.title)}">${topInner}</span>
            <span class="cat-top-info">
              <span class="cat-top-name">${escapeHTML(r.top.title)}</span>
              <span class="cat-top-meta">👁 ${fmtNum(r.top.views)} · ❤ ${r.top.likes}</span>
            </span>
          </div>` : ""}
        </div>
      </article>`;
  }).join("");
}

function renderAll() {
  renderStats();
  renderFeed();
  renderTrends();
  renderCategories();
  renderModList();
}

function renderStats() {
  $("#stat-total").textContent = items.length;
  $("#stat-views").textContent = fmtNum(totalViews());
}

function renderFeed() {
  const list = filtered();
  $("#feed-count").textContent = `${list.length} ${plural(list.length, ["видео", "видео", "видео"])}`;
  $("#feed-grid").innerHTML = list.map((it, i) => cardHTML(it, i)).join("");
  $("#empty").hidden = list.length > 0;
}

function renderTrends() {
  $("#trends-list").innerHTML = trendsHTML();
}

function renderCategories() {
  $("#cat-grid").innerHTML = categoriesHTML();
  $("#cats-count").textContent = `${categoryRows().length} ${plural(categoryRows().length, ["категория", "категории", "категорий"])}`;
}

function plural(n, forms) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

/* ---------------- poster enrichment ---------------- */

let enrichTimer = null;

/* Не подбираем случайную обложку по названию: она может быть от другого трека. */
async function enrichPosters() {
  return;
}

/* Попытка вытащить заголовок и обложку из Spotify-oEmbed */
async function spotifyMeta(url) {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return {};
    const data = await res.json();
    const m = /Spotify Embed:\s*(.+?)"?\s*$/.exec(data.title || "");
    return { title: (m ? m[1] : data.title || "").trim() };
  } catch { return {}; }
}

async function youtubeMeta(ytId) {
  if (!ytId) return {};
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
    if (!res.ok) return {};
    const data = await res.json();
    return { title: (data.title || "").trim() };
  } catch { return {}; }
}

/* ---------------- actions ---------------- */

function toggleLike(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  if (liked.has(id)) { it.likes = Math.max(0, it.likes - 1); liked.delete(id); }
  else { it.likes++; liked.add(id); }
  save();
  saveLiked();
  renderAll();
  if (viewId === id) openView(id);
}

function toggleWatched(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.watched = !it.watched;
  save();
  renderAll();
  if (viewId === id) openView(id);
}

function watchItem(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  if (!it.url) { openView(id); return; }
  it.views++;
  it.watched = true;
  save();
  renderAll();
  if (it.url) window.open(it.url, "_blank", "noopener");
  else openView(id);
}

function removeItem(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  if (!confirm(`Удалить «${it.title}»?`)) return;
  items = items.filter((i) => i.id !== id);
  liked.delete(id);
  save();
  saveLiked();
  if (viewId === id) closeView();
  renderAll();
  toast("Удалено");
}

/* ---------------- add / edit ---------------- */

function openAdd(prefill = {}) {
  editingId = null;
  formTags = Array.isArray(prefill.tags) ? [...prefill.tags] : [];
  formYtId = prefill.ytId || (prefill.url ? ytIdFromUrl(prefill.url) : "");

  $("#add-title").textContent = "Новая карточка";
  $("#add-submit").textContent = "Добавить";
  $("#f-title").value = prefill.title || "";
  $("#f-type").value = prefill.type || "youtube";
  $("#f-year").value = prefill.year || "";
  $("#f-url").value = prefill.url || "";
  $("#f-poster").value = prefill.poster || "";
  $("#f-desc").value = prefill.desc || "";

  renderThumbPreview();
  syncTagsInput();
  clearErrors();
  $("#modal-add-back").hidden = false;
  setTimeout(() => $("#f-title").focus(), 60);
}

function openEdit(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  editingId = id;
  formTags = [...it.tags];
  formYtId = it.ytId || "";

  $("#add-title").textContent = "Редактировать";
  $("#add-submit").textContent = "Сохранить";
  $("#f-title").value = it.title;
  $("#f-type").value = it.type;
  $("#f-year").value = it.year;
  $("#f-url").value = it.url;
  $("#f-poster").value = it.poster || "";
  $("#f-desc").value = it.desc;

  renderThumbPreview();
  syncTagsInput();
  clearErrors();
  closeView();
  $("#modal-add-back").hidden = false;
  setTimeout(() => $("#f-title").focus(), 60);
}

function renderThumbPreview() {
  const box = $("#thumb-preview");
  const title = $("#f-title").value.trim();
  const url = normalizeUrl($("#f-url").value);
  const poster = normalizeUrl($("#f-poster").value);

  formYtId = url ? ytIdFromUrl(url) : "";
  const src = poster || youtubeThumb(formYtId) || (detectSource(url).type === "game" ? steamThumb(steamAppId(url)) : "");

  if (src) {
    box.innerHTML = `<img class="thumb-img" src="${escapeHTML(src)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">${fallbackHTML({ title: title || url || "x", type: $("#f-type").value })}`;
  } else {
    box.innerHTML = fallbackHTML({ title: title || url || "x", type: $("#f-type").value });
  }
  $("#thumb-preview-field").hidden = false;
}

function closeAdd() {
  $("#modal-add-back").hidden = true;
  editingId = null;
}

function clearErrors() {
  $$(".input.error, .textarea.error").forEach((el) => el.classList.remove("error"));
  $$(".field-hint.error").forEach((el) => el.classList.remove("error"));
}

function syncTagsInput() {
  const wrap = $("#f-tags");
  const input = $(".tag-text", wrap);
  $$(".tag-chip", wrap).forEach((el) => el.remove());
  formTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `#${escapeHTML(tag)} <button type="button" aria-label="Удалить тег">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      formTags = formTags.filter((t) => t !== tag);
      syncTagsInput();
    });
    wrap.insertBefore(chip, input);
  });
}

function addTag(raw) {
  const t = raw.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-").slice(0, 24);
  if (!t) return;
  if (formTags.includes(t)) return;
  if (formTags.length >= 8) { toast("Максимум 8 тегов", true); return; }
  formTags.push(t);
  syncTagsInput();
}

function submitForm(e) {
  e.preventDefault();
  clearErrors();
  const title = $("#f-title").value.trim();
  if (!title) {
    $("#f-title").classList.add("error");
    $("#f-title-hint").classList.add("error");
    $("#f-title-hint").textContent = "Название обязательно";
    $("#f-title").focus();
    return;
  }
  const url = normalizeUrl($("#f-url").value);
  const ytId = ytIdFromUrl(url) || formYtId;
  const det = url ? detectSource(url) : { type: $("#f-type").value, source: "" };
  if (!url || detectSource(url).type === "other") { toast("Укажи ссылку на YouTube, Steam, Яндекс Музыку или Кинопоиск", true); return; }
  const data = {
    title,
    type: det.type,
    url,
    year: $("#f-year").value.trim(),
    desc: $("#f-desc").value.trim(),
    tags: [...formTags],
    ytId,
    poster: normalizeUrl($("#f-poster").value),
    source: url ? (det.source || hostOf(url)) : "",
  };

  if (editingId) {
    const it = items.find((i) => i.id === editingId);
    if (it) Object.assign(it, data);
    save();
    closeAdd();
    renderAll();
    toast("Обновлено");
  } else {
    items.unshift({
      id: uid(), likes: 0, views: 0, watched: false, createdAt: Date.now(), cover: "", ...data,
    });
    save();
    closeAdd();
    renderAll();
    toast("Добавлено");
    enrichPosters();
  }
}

/* ---------------- view ---------------- */

function openView(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  viewId = id;
  const isLiked = liked.has(id);

  $("#view-body").innerHTML = `
    <div class="view-content">
      <div class="view-thumb">
        ${thumbHTML(it)}
        <div class="v-overlay"></div>
      </div>
      <div class="view-badges">
        ${typePill(it.type)}
        <span class="source-pill">${escapeHTML(it.source || "ссылка")}</span>
        <span class="count-pill">👁 ${fmtNum(it.views)}</span>
      </div>
      <h2 class="view-title">${escapeHTML(it.title)}</h2>
      ${it.desc ? `<p class="view-desc">${escapeHTML(it.desc)}</p>` : ""}
      <div class="view-meta">
        <div class="view-meta-item"><div class="view-meta-k">Год / сезон</div><div class="view-meta-v">${escapeHTML(it.year || "—")}</div></div>
        <div class="view-meta-item"><div class="view-meta-k">Лайки</div><div class="view-meta-v">❤ ${it.likes}</div></div>
        <div class="view-meta-item"><div class="view-meta-k">Просмотры</div><div class="view-meta-v">👁 ${fmtNum(it.views)}</div></div>
        <div class="view-meta-item"><div class="view-meta-k">Статус</div><div class="view-meta-v">${it.watched ? "✔ Просмотрено" : "○ Не смотрел"}</div></div>
      </div>
      ${it.tags.length ? `<div class="view-tags">${it.tags.map((t) => `<span class="card-tag">#${escapeHTML(t)}</span>`).join("")}</div>` : ""}
      <div class="view-actions">
        <button class="view-action primary" data-watch="${it.id}" type="button">▶ Смотреть</button>
        <button class="view-action ${isLiked ? "liked" : ""}" data-like="${it.id}" type="button">${isLiked ? "❤ В лайках" : "♡ Лайкнуть"} · ${it.likes}</button>
        <button class="view-action" data-watched="${it.id}" type="button">${it.watched ? "✔ Просмотрено" : "○ Отметить просмотром"}</button>
        ${it.url ? `<a class="view-action" href="${escapeHTML(it.url)}" target="_blank" rel="noopener noreferrer">↗ Источник</a>` : ""}
      </div>
      <section class="comments">
        <h3>Комментарии · ${(it.comments || []).length}</h3>
        <div class="comment-list">${(it.comments || []).map((c) => `<div class="comment ${c.parentId ? 'comment-reply' : ''}">${c.avatar ? `<img class="comment-avatar" src="${escapeHTML(c.avatar)}" alt="">` : '<span class="comment-avatar comment-avatar-fallback">✦</span>'}<strong class="comment-author ${c.developer ? 'developer-name' : ''}">${escapeHTML(c.author || 'Гость')}</strong>${c.developer ? ' <span class="developer-badge">✦ РАЗРАБОТЧИК</span>' : ''}<br>${c.parentId ? `<small>↳ Ответ: ${escapeHTML((it.comments || []).find(parent => parent.id === c.parentId)?.author || 'комментарий')}</small><br>` : ''}${escapeHTML(c.text)}${!c.parentId && c.id ? `<br><button type="button" class="card-foot-btn" data-reply="${escapeHTML(c.id)}" data-author="${escapeHTML(c.author || 'Гость')}">Ответить</button>` : ''}</div>`).join("") || '<p class="comment-empty">Пока нет комментариев. Начни обсуждение!</p>'}</div>
        <form id="comment-form" class="comment-form"><input class="input" name="comment" maxlength="500" placeholder="Написать комментарий…" required><button class="btn btn-primary" type="submit">Отправить</button></form>
      </section>
    </div>`;
  $("#comment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = e.currentTarget.elements.comment.value.trim();
    if (!text) return;
    (it.comments ||= []).push({ text, createdAt: Date.now() });
    save(); renderAll(); openView(id);
  });
  $("#modal-view-back").hidden = false;
}

function closeView() {
  $("#modal-view-back").hidden = true;
  viewId = null;
}

/* ---------------- moderation ---------------- */

function renderModList() {
  const q = ($("#mod-search")?.value || "").trim().toLowerCase();
  const sort = $("#mod-search")?.dataset.sort || "likes";
  let list = items.filter((it) =>
    !q || it.title.toLowerCase().includes(q) || it.tags.some((t) => t.includes(q)));
  const cmp = {
    likes: (a, b) => b.likes - a.likes,
    views: (a, b) => b.views - a.views,
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
  }[sort] || ((a, b) => b.likes - a.likes);
  list = [...list].sort(cmp);

  const el = $("#mod-list");
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="color:var(--muted);padding:18px 0;font-size:13px;">Пусто</div>`;
    return;
  }
  el.innerHTML = list.map((it) => `
    <div class="list-item">
      <span class="list-item-thumb" style="background:${gradFor(it.title)}">${thumbHTML(it)}</span>
      <div class="list-item-main">
        <div class="list-item-name">${escapeHTML(it.title)}</div>
        <div class="list-item-meta">${TYPES[it.type]?.label || "Другое"} · ${escapeHTML(it.year || "—")} · ${escapeHTML(it.source || "—")}</div>
        <div class="list-item-stats">
          <span class="likes">❤ ${it.likes}</span>
          <span class="views">👁 ${fmtNum(it.views)}</span>
          <span>${it.watched ? "✔" : "○"}</span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" data-open="${it.id}" type="button" title="Открыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
        </button>
        <button class="icon-btn" data-edit="${it.id}" type="button" title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button class="icon-btn danger" data-del="${it.id}" type="button" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join("");
}

/* ---------------- add from link ---------------- */

async function addFromLink() {
  const input = $("#link-input");
  const raw = input.value.trim();
  if (!raw) { toast("Вставь ссылку", true); input.focus(); return; }
  const url = normalizeUrl(raw);
  if (!url) { toast("Не похоже на ссылку", true); return; }

  const det = detectSource(url);
  if (det.type === "other") { toast("Поддерживаются YouTube, Steam, Яндекс Музыка и Кинопоиск", true); return; }
  let title = "";
  let spinner = false;

  if (det.ytId) {
    spinner = true;
    const meta = await youtubeMeta(det.ytId);
    if (meta.title) title = meta.title;
  } else if (det.source === "Spotify") {
    spinner = true;
    const meta = await spotifyMeta(url);
    if (meta.title) title = meta.title;
  }

  if (!title) title = slugTitle(url);

  input.value = "";
  openAdd({ title, url, type: det.type, ytId: det.ytId, poster: "" });
  toast(spinner && title ? "Ссылка распознана" : "Ссылка добавлена");
}

/* ---------------- events ---------------- */

function switchTab(name) {
  $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-view").forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  $(".hero").hidden = name !== "feed";
  document.body.dataset.view = name;
}

function bindEvents() {
  $$("#tabs .tab").forEach((tab) =>
    tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

  $("#btn-add-link").addEventListener("click", addFromLink);
  $("#link-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addFromLink(); }
  });
  $("#btn-add-manual").addEventListener("click", () => openAdd());

  $("#add-close").addEventListener("click", closeAdd);
  $("#add-cancel").addEventListener("click", closeAdd);
  $("#add-form").addEventListener("submit", submitForm);
  $("#f-url").addEventListener("input", renderThumbPreview);
  $("#f-title").addEventListener("input", renderThumbPreview);
  $("#f-poster").addEventListener("input", renderThumbPreview);
  $("#f-type").addEventListener("change", renderThumbPreview);

  $("#view-close").addEventListener("click", closeView);
  $("#view-edit").addEventListener("click", () => { if (viewId) openEdit(viewId); });
  $("#view-delete").addEventListener("click", () => { if (viewId) removeItem(viewId); });

  $("#btn-moderate").addEventListener("click", () => {
    renderModList();
    $("#modal-mod-back").hidden = false;
  });
  $("#mod-close").addEventListener("click", () => { $("#modal-mod-back").hidden = true; });
  $("#mod-search").addEventListener("input", renderModList);
  $$("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#mod-search").dataset.sort = btn.dataset.sort;
      $$("[data-sort]").forEach((b) => b.classList.toggle("active", b === btn));
      renderModList();
    });
  });
  $("#mod-clear").addEventListener("click", () => {
    if (!items.length) return;
    if (!confirm("Удалить все карточки? Действие необратимо.")) return;
    items = [];
    liked.clear();
    save();
    saveLiked();
    renderAll();
    toast("Всё очищено");
  });

  $$("#chips-type .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeType = chip.dataset.type;
      $$("#chips-type .chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderFeed();
    });
  });

  $$("#chips-watch .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeWatch = chip.dataset.watch;
      $$("#chips-watch .chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderFeed();
    });
  });

  $("#sort-select").addEventListener("change", (e) => { sortMode = e.target.value; renderFeed(); });
  $("#search-input").addEventListener("input", (e) => { searchQuery = e.target.value; renderFeed(); });

  const tagText = $("#f-tags .tag-text");
  tagText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagText.value);
      tagText.value = "";
    } else if ((e.key === "Backspace" || e.key === "Delete") && !tagText.value && formTags.length) {
      formTags.pop();
      syncTagsInput();
    }
  });
  tagText.addEventListener("blur", () => {
    const v = tagText.value.trim();
    if (v) { addTag(v); tagText.value = ""; }
  });

  document.addEventListener("click", (e) => {
    const likeBtn = e.target.closest("[data-like]");
    if (likeBtn) { toggleLike(likeBtn.dataset.like); return; }

    const watchBtn = e.target.closest("[data-watch]");
    if (watchBtn) { watchItem(watchBtn.dataset.watch); return; }

    const watchedBtn = e.target.closest("[data-watched]");
    if (watchedBtn) { toggleWatched(watchedBtn.dataset.watched); return; }

    const delBtn = e.target.closest("[data-del]");
    if (delBtn) { removeItem(delBtn.dataset.del); return; }

    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { openEdit(editBtn.dataset.edit); return; }

    const openBtn = e.target.closest("[data-open]");
    if (openBtn) { openView(openBtn.dataset.open); return; }
  });

  $$(".modal-back").forEach((back) => {
    back.addEventListener("mousedown", (e) => { if (e.target === back) back.hidden = true; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".modal-back").forEach((b) => (b.hidden = true));
      viewId = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      switchTab("feed");
      $("#search-input").focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      $("#link-input").focus();
    }
  });
}

/* ---------------- particles ---------------- */

function initParticles() {
  const canvas = $("#particles");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  let w, h, parts, raf;
  const COUNT = Math.min(22, Math.floor(window.innerWidth / 55));
  const palettes = ["124,92,255", "34,211,238", "244,114,182", "52,211,153"];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  function make() {
    parts = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.26,
      vy: (Math.random() - 0.5) * 0.26,
      r: Math.random() * 1.4 + 0.5,
      c: palettes[Math.floor(Math.random() * palettes.length)],
    }));
  }
  function loop() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.c},0.45)`;
      ctx.fill();
    }
    raf = requestAnimationFrame(loop);
  }

  resize(); make(); loop();
  window.addEventListener("resize", () => { resize(); make(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf); else loop();
  });
}

/* ---------------- init ---------------- */

function init() {
  load();
  bindEvents();
  renderAll();
  // Статичные фоновые звёзды заменяют постоянную перерисовку canvas.
}

document.addEventListener("DOMContentLoaded", init);
