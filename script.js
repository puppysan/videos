/* ============================================================
   UTILIDADES
   ============================================================ */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const esc = (s = '') => String(s).replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function nfmt(n){
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0','') + ' mil M';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0','') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0','') + ' mil';
  return String(n);
}

function timeAgo(dateStr){
  const ts = Date.parse(dateStr);
  if (isNaN(ts)) return '';
  const d = Date.now() - ts;
  const min = 6e4, hour = 36e5, day = 864e5;
  if (d < min)       return 'hace unos segundos';
  if (d < hour)      return `hace ${Math.floor(d / min)} min`;
  if (d < day)       return `hace ${Math.floor(d / hour)} h`;
  if (d < day * 30)  return `hace ${Math.floor(d / day)} d`;
  if (d < day * 365) return `hace ${Math.floor(d / (day * 30))} meses`;
  const years = Math.floor(d / (day * 365));
  return `hace ${years} año${years === 1 ? '' : 's'}`;
}

function debounce(fn, ms){
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastTimer;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ============================================================
   PARSER DE URLs DE VIDEO
   ============================================================ */
function parseVideoUrl(raw){
  let url;
  const value = String(raw || '').trim();
  if (!value) return null;

  try { url = new URL(value); }
  catch {
    try { url = new URL('https://' + value); }
    catch { return null; }
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  /* ---- YouTube ---- */
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = null;
    if (host === 'youtu.be')                      id = url.pathname.slice(1);
    else if (url.pathname === '/watch')           id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/embed/'))  id = url.pathname.split('/')[2];
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2];
    else if (url.pathname.startsWith('/live/'))   id = url.pathname.split('/')[2];
    else if (url.pathname.startsWith('/v/'))      id = url.pathname.split('/')[2];

    if (id) {
      id = id.split('&')[0].split('?')[0].split('/')[0];
      return {
        url: url.href,
        type: 'youtube',
        provider: 'YouTube',
        embed: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
        thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        thumbHD: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
      };
    }
  }

  /* ---- Vimeo ---- */
  if (/(^|\.)vimeo\.com$/.test(host)) {
    const m = url.pathname.match(/\/(\d{6,})/);
    if (m) return {
      url: url.href, type: 'vimeo', provider: 'Vimeo',
      embed: `https://player.vimeo.com/video/${m[1]}`,
      thumb: ''
    };
  }

  /* ---- Dailymotion ---- */
  if (/(^|\.)dailymotion\.com$/.test(host) || host === 'dai.ly') {
    let id = null;
    const m = url.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    if (m) id = m[1];
    else if (host === 'dai.ly') id = url.pathname.slice(1);
    if (id) return {
      url: url.href, type: 'dailymotion', provider: 'Dailymotion',
      embed: `https://www.dailymotion.com/embed/video/${id}`,
      thumb: `https://www.dailymotion.com/thumbnail/video/${id}`
    };
  }

  /* ---- Archivo directo ---- */
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(url.pathname + url.search)) {
    return { url: url.href, type: 'file', provider: 'Archivo', embed: url.href, thumb: '' };
  }

  /* ---- Genérico (iframe) ---- */
  return {
    url: url.href, type: 'embed',
    provider: host.replace(/\.(com|net|org|tv|io|es)$/, '').slice(0, 14) || 'Web',
    embed: url.href, thumb: ''
  };
}

/* ============================================================
   LEER EL CATÁLOGO DESDE EL HTML
   ============================================================ */
function loadCatalogFromHTML(){
  const nodes = $$('#videoSource .video-source');
  const videos = [];

  nodes.forEach(node => {
    const rawUrl = node.textContent.trim();
    const parsed = parseVideoUrl(rawUrl);
    if (!parsed) {
      console.warn('StreamHub: URL no reconocida →', rawUrl);
      return;
    }

    videos.push({
      id:          node.dataset.id || ('v' + videos.length),
      title:       node.dataset.title || 'Video sin título',
      author:      node.dataset.author || parsed.provider,
      category:    node.dataset.category || 'General',
      duration:    node.dataset.duration || '',
      views:       Number(node.dataset.views) || 0,
      date:        node.dataset.date || '',
      featured:    node.dataset.featured === 'true',
      description: node.dataset.description || '',
      url:         parsed.url,
      type:        parsed.type,
      provider:    parsed.provider,
      embed:       parsed.embed,
      thumb:       parsed.thumb,
      thumbHD:     parsed.thumbHD || parsed.thumb
    });
  });

  return videos;
}

/* ============================================================
   ESTADO
   ============================================================ */
const CATALOG = loadCatalogFromHTML();

const state = {
  filter: 'all',
  query: '',
  current: null
};

/* ============================================================
   HELPERS DE RENDER
   ============================================================ */
function thumbImg(v, cls = ''){
  if (v.thumb) {
    return `<img src="${esc(v.thumb)}" alt="" loading="lazy"
      ${cls ? `class="${cls}"` : ''}
      onerror="this.onerror=null;this.parentElement.innerHTML='&lt;div class=\\'thumb-ph\\'&gt;${esc(v.provider)}&lt;/div&gt;'">`;
  }
  return `<div class="thumb-ph">${esc(v.provider)}</div>`;
}

/* ============================================================
   RENDER: CHIPS DE CATEGORÍAS
   ============================================================ */
function renderChips(){
  const cats = [...new Set(CATALOG.map(v => v.category))].sort();
  const chips = $('#chips');

  chips.innerHTML =
    `<button class="chip is-active" data-cat="all">Todos</button>` +
    cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

/* ============================================================
   RENDER: HERO
   ============================================================ */
function renderHero(){
  const featured = CATALOG.find(v => v.featured) || CATALOG[0];
  const hero = $('#hero');

  if (!featured) { hero.hidden = true; return; }
  hero.hidden = false;

  hero.innerHTML = `
    <div class="hero__bg">${thumbImg(featured)}</div>
    <div class="hero__content">
      <span class="hero__tag">★ Destacado</span>
      <h1 class="hero__title">${esc(featured.title)}</h1>
      <p class="hero__desc">${esc(featured.description)}</p>
      <div class="hero__meta">
        <span>${esc(featured.author)}</span>
        <span class="hero__dot"></span>
        <span>${esc(featured.category)}</span>
        <span class="hero__dot"></span>
        <span>${nfmt(featured.views)} vistas</span>
        <span class="hero__dot"></span>
        <span>${timeAgo(featured.date)}</span>
      </div>
      <div class="hero__actions">
        <button class="btn btn--primary" data-play="${esc(featured.id)}">▶ Reproducir</button>
        <button class="btn btn--ghost" data-share="${esc(featured.id)}">🔗 Copiar link</button>
      </div>
    </div>
  `;
}

/* ============================================================
   RENDER: GRID
   ============================================================ */
function visibleVideos(){
  let list = [...CATALOG];

  if (state.filter !== 'all') {
    list = list.filter(v => v.category === state.filter);
  }
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter(v =>
      `${v.title} ${v.author} ${v.category} ${v.description}`
        .toLowerCase().includes(q));
  }
  return list;
}

function cardHTML(v){
  return `
  <article class="card" data-id="${esc(v.id)}" tabindex="0" role="button"
           aria-label="Reproducir ${esc(v.title)}">
    <div class="card__thumb">
      ${thumbImg(v)}
      <span class="card__cat">${esc(v.category)}</span>
      ${v.duration ? `<span class="card__duration">${esc(v.duration)}</span>` : ''}
      <div class="card__overlay"><span class="card__play">▶</span></div>
    </div>
    <div class="card__body">
      <div class="avatar">${esc((v.author || '?').trim().charAt(0))}</div>
      <div class="card__info">
        <h3 class="card__title">${esc(v.title)}</h3>
        <div class="card__author">${esc(v.author)}</div>
        <div class="card__stats">${nfmt(v.views)} vistas · ${timeAgo(v.date)}</div>
      </div>
    </div>
  </article>`;
}

function renderGrid(){
  const list = visibleVideos();
  const grid = $('#grid');

  $('#sectionTitle').textContent = state.filter === 'all' ? 'Todos los videos' : state.filter;
  $('#sectionCount').textContent = list.length
    ? `${list.length} video${list.length === 1 ? '' : 's'}`
    : '';

  if (!list.length) {
    grid.innerHTML = '';
    grid.hidden = true;
    $('#noResults').hidden = false;
    return;
  }

  grid.hidden = false;
  $('#noResults').hidden = true;
  grid.innerHTML = list.map(cardHTML).join('');
}

/* ============================================================
   RENDER: VISTA WATCH
   ============================================================ */
function playerHTML(v){
  if (v.type === 'file') {
    return `<video src="${esc(v.embed)}" controls playsinline preload="metadata"></video>`;
  }
  return `<iframe src="${esc(v.embed)}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function renderWatch(){
  const v = state.current;
  if (!v) return;

  $('#player').innerHTML = playerHTML(v);
  $('#watchTitle').textContent = v.title;
  $('#watchAvatar').textContent = (v.author || '?').trim().charAt(0);
  $('#watchAuthor').textContent = v.author;
  $('#watchSub').textContent =
    `${nfmt(v.views)} vistas · ${timeAgo(v.date)} · ${v.category}`;

  $('#openOriginal').href = v.url;

  $('#watchDesc').innerHTML =
    (v.description ? esc(v.description) : '<span style="color:var(--muted)">Sin descripción.</span>') +
    `<br><br><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.url)}</a>`;

  /* Relacionados: misma categoría primero, luego el resto */
  const sameCat  = CATALOG.filter(x => x.id !== v.id && x.category === v.category);
  const others   = CATALOG.filter(x => x.id !== v.id && x.category !== v.category);
  const related  = [...sameCat, ...others].slice(0, 10);

  $('#related').innerHTML = related.map(r => `
    <article class="mini" data-id="${esc(r.id)}">
      <div class="mini__thumb">
        ${thumbImg(r)}
        ${r.duration ? `<span class="mini__dur">${esc(r.duration)}</span>` : ''}
      </div>
      <div class="mini__info">
        <div class="mini__title">${esc(r.title)}</div>
        <div class="mini__sub">${esc(r.author)}</div>
        <div class="mini__sub">${nfmt(r.views)} vistas</div>
      </div>
    </article>`).join('');
}

/* ============================================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================================ */
function showHome(){
  state.current = null;
  $('#watchView').hidden = true;
  $('#homeView').hidden = false;
  document.title = 'StreamHub — Catálogo de videos';
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function openVideo(id, pushHash = true){
  const v = CATALOG.find(x => x.id === id);
  if (!v) return;

  state.current = v;
  renderWatch();

  $('#homeView').hidden = true;
  $('#watchView').hidden = false;
  document.title = `${v.title} · StreamHub`;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (pushHash) history.replaceState(null, '', '#v=' + encodeURIComponent(id));
}

/* ============================================================
   COMPARTIR
   ============================================================ */
function shareUrlFor(id){
  return location.origin + location.pathname + location.search + '#v=' + encodeURIComponent(id);
}

async function copyToClipboard(text, okMsg){
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg); }
    catch { window.prompt('Copia este link:', text); }
    ta.remove();
  }
}

function shareVideo(id){
  copyToClipboard(shareUrlFor(id), '🔗 Link copiado al portapapeles');
}

/* ============================================================
   EVENTOS
   ============================================================ */
/* --- Hero --- */
$('#hero').addEventListener('click', (e) => {
  const play  = e.target.closest('[data-play]');
  const share = e.target.closest('[data-share]');

  if (share) { e.stopPropagation(); shareVideo(share.dataset.share); return; }
  if (play)  { e.stopPropagation(); openVideo(play.dataset.play); return; }

  const featured = CATALOG.find(v => v.featured) || CATALOG[0];
  if (featured) openVideo(featured.id);
});

/* --- Grid --- */
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) openVideo(card.dataset.id);
});
$('#grid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (card) { e.preventDefault(); openVideo(card.dataset.id); }
});

/* --- Relacionados --- */
$('#related').addEventListener('click', (e) => {
  const mini = e.target.closest('.mini');
  if (mini) openVideo(mini.dataset.id);
});

/* --- Chips de categoría --- */
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  $$('#chips .chip').forEach(c => c.classList.remove('is-active'));
  chip.classList.add('is-active');

  state.filter = chip.dataset.cat;
  showHome();
  renderGrid();
});

/* --- Buscador --- */
$('#searchInput').addEventListener('input', debounce((e) => {
  state.query = e.target.value.trim();
  $('#searchClear').hidden = !state.query;
  if (!$('#watchView').hidden) showHome();
  renderGrid();
}, 220));

$('#searchForm').addEventListener('submit', (e) => e.preventDefault());

$('#searchClear').addEventListener('click', () => {
  $('#searchInput').value = '';
  state.query = '';
  $('#searchClear').hidden = true;
  renderGrid();
  $('#searchInput').focus();
});

/* --- Botón aleatorio --- */
$('#randomBtn').addEventListener('click', () => {
  const pool = visibleVideos().length ? visibleVideos() : CATALOG;
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  openVideo(pick.id);
});

/* --- Logo → home --- */
$('#logoBtn').addEventListener('click', (e) => {
  e.preventDefault();
  history.replaceState(null, '', location.pathname + location.search);
  $('#searchInput').value = '';
  state.query = '';
  $('#searchClear').hidden = true;
  showHome();
  renderGrid();
});

/* --- Volver --- */
$('#backBtn').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname + location.search);
  showHome();
});

/* --- Compartir video actual --- */
$('#shareBtn').addEventListener('click', () => {
  if (state.current) shareVideo(state.current.id);
});

/* --- Escape → volver --- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#watchView').hidden) {
    history.replaceState(null, '', location.pathname + location.search);
    showHome();
  }
});

/* --- Hash routing --- */
function handleHash(){
  const match = location.hash.match(/^#v=(.+)$/);
  if (!match) { showHome(); return; }

  const id = decodeURIComponent(match[1]);
  if (CATALOG.some(v => v.id === id)) {
    openVideo(id, false);
  } else {
    showHome();
  }
}
window.addEventListener('hashchange', handleHash);

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
(function init(){
  renderChips();
  renderHero();
  renderGrid();

  if (location.hash) handleHash();
  else showHome();

  console.log(
    `%cStreamHub%c ${CATALOG.length} videos cargados desde el HTML`,
    'background:linear-gradient(135deg,#5eead4,#818cf8);color:#0a0c12;' +
    'padding:3px 9px;border-radius:6px;font-weight:800',
    'color:#8b93ab'
  );
})();