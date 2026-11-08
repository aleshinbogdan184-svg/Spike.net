/* Общая лента Supabase. Публичный ключ не предоставляет прав администратора. */
const SPIKE_API = 'https://ktrlwkrxmewylkxhzeqk.supabase.co/rest/v1';
const SPIKE_KEY = 'sb_publishable_F-a4xfh09Www8dOSIn2cZQ_DuauYkie';
let sharedReady = false;
const originalOpenView = openView;
let authClient = null;
const SPIKE_OWNER = '4120e992-bcb9-45e4-9822-609948510d9c';
const SPIKE_DEVELOPERS = new Set([SPIKE_OWNER, 'eba02036-3e58-43ac-aa82-ac0a66afba6a']);
let isOwner = false;
let currentUser = null;
let currentProfile = null;
let hypeKing = null;
let bookmarkIds = new Set();
let bookmarkReady = false;
const avatarUrl = path => path ? `${SPIKE_API.replace('/rest/v1', '')}/storage/v1/object/public/spike-avatars/${encodeURIComponent(path.split('/')[0])}/avatar` : '';
let reactionsReady = false;
let commentLikesReady = false;
let commentLikes = [];
const viewedThisSession = new Set();

async function sharedRequest(path, options = {}) {
  const response = await fetch(SPIKE_API + path, {
    ...options,
    headers: { apikey: SPIKE_KEY, Authorization: `Bearer ${SPIKE_KEY}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(detail.message || `Ошибка базы: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function refreshShared() {
  try {
    const [posts, comments] = await Promise.all([
      sharedRequest('/spike_posts?select=*&order=created_at.desc&limit=200'),
      sharedRequest('/spike_comments?select=id,parent_id,post_id,body,author_name,user_id,created_at&order=created_at.asc&limit=2000'),
    ]);
    const profiles = await sharedRequest('/spike_profiles?select=user_id,nickname,avatar_path&limit=10000');
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    let likes = [], views = [];
    try { commentLikes = await sharedRequest('/spike_comment_likes?select=comment_id,user_id&limit=10000'); commentLikesReady = true; }
    catch { commentLikes = []; commentLikesReady = false; }
    try {
      [likes, views] = await Promise.all([sharedRequest('/spike_likes?select=post_id,user_id,created_at&limit=10000'), sharedRequest('/spike_views?select=post_id&limit=10000')]);
      reactionsReady = true;
    } catch { reactionsReady = false; }
    liked = new Set(likes.filter(like => like.user_id === currentUser?.id).map(like => like.post_id));
    const likeCounts = new Map(), weeklyCounts = new Map(), viewCounts = new Map(), commentsByPost = new Map();
    likes.forEach(like => likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1));
    likes.forEach(like => { if (like.created_at && new Date(like.created_at).getTime() >= Date.now() - 7 * 86400000) weeklyCounts.set(like.post_id, (weeklyCounts.get(like.post_id) || 0) + 1); });
    views.forEach(view => viewCounts.set(view.post_id, (viewCounts.get(view.post_id) || 0) + 1));
    comments.forEach(c => { if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []); const p = profileMap.get(c.user_id); commentsByPost.get(c.post_id).push({ id: c.id, parentId: c.parent_id, text: c.body, userId: c.user_id, author: p?.nickname || c.author_name || 'Гость', avatar: avatarUrl(p?.avatar_path), developer: !!c.user_id && SPIKE_DEVELOPERS.has(c.user_id) }); });
    items = posts.map(post => {
      const source = detectSource(post.url);
      return { id: post.id, title: post.title, url: post.url, type: source.type, source: source.source,
        ytId: source.ytId, desc: post.description, poster: post.poster, year: '', tags: [], cover: '', authorId: post.user_id || null, author: profileMap.get(post.user_id)?.nickname || '',
        likes: likeCounts.get(post.id) || 0, weeklyLikes: weeklyCounts.get(post.id) || 0, views: viewCounts.get(post.id) || 0, watched: false, createdAt: new Date(post.created_at).getTime(),
        comments: commentsByPost.get(post.id) || [] };
    });
    sharedReady = true;
    document.querySelector('#connection-status').textContent = reactionsReady ? 'Общая лента: лайки и просмотры учитываются для вошедших пользователей.' : 'Общая лента работает. Лайки и просмотры ещё не настроены.';
    document.body.classList.toggle('reactions-unavailable', !reactionsReady);
    renderAll();
    renderExtras();
    loadHypeKing();
    const match = location.hash.match(/^#post=([0-9a-f-]{36})$/i);
    if (match && items.some(item => item.id === match[1]) && viewId !== match[1]) { history.replaceState(null, '', location.pathname + location.search); openView(match[1]); }
  } catch (error) {
    sharedReady = false;
    items = [];
    document.querySelector('#connection-status').textContent = 'Нет подключения к общей ленте. Проверьте настройку базы и подключение к интернету.';
    renderAll();
  }
}

async function loadHypeKing() {
  const box = $('#hype-king'); if (!box) return;
  try {
    const rows = await sharedRequest('/rpc/spike_hype_king', { method: 'POST', body: '{}' });
    hypeKing = rows[0] || null;
    box.hidden = !hypeKing;
    if (hypeKing) box.innerHTML = `👑 <span>Король трендов на сегодня</span> <button class="profile-link" type="button" data-user-profile="${escapeHTML(hypeKing.user_id)}">${escapeHTML(hypeKing.nickname)}</button> <small>· ${hypeKing.votes} лайков за вчера</small>`;
  } catch { hypeKing = null; box.hidden = true; }
}


function myAchievements() {
  const comments = items.flatMap(item => item.comments).filter(comment => comment.userId === currentUser?.id);
  const make = (name, description, value, target, available = true) => ({ name, description, value, target, available, done: available && value >= target });
  return [
    make('Первый комментарий', 'Оставь комментарий', comments.length, 1),
    make('Общительный', 'Оставь 10 комментариев', comments.length, 10),
    make('Первая закладка', 'Сохрани публикацию', bookmarkIds.size, 1, bookmarkReady),
    make('Знакомство', 'Создай профиль', currentProfile ? 1 : 0, 1),
    make('Своя аватарка', 'Добавь аватар', currentProfile?.avatar_path ? 1 : 0, 1),
    make('Голос сообщества', 'Оставь 3 комментария', comments.length, 3),
    make('Мастер общения', 'Оставь 25 комментариев', comments.length, 25),
    make('Коллекционер', 'Сохрани 5 публикаций', bookmarkIds.size, 5, bookmarkReady),
    make('Хранитель находок', 'Сохрани 10 публикаций', bookmarkIds.size, 10, bookmarkReady),
    make('Первый лайк', 'Поставь лайк', liked.size, 1, reactionsReady),
    make('Ценитель', 'Поставь 5 лайков', liked.size, 5, reactionsReady),
    make('Щедрое сердце', 'Поставь 10 лайков', liked.size, 10, reactionsReady),
    make('В диалоге', 'Ответь на комментарий', comments.filter(comment => comment.parentId).length, 1),
  ];
}

function renderExtras() {
  const grid = $('#bookmarks-grid'), message = $('#bookmarks-message');
  if (!grid || !message) return;
  const list = items.filter(item => bookmarkIds.has(item.id));
  message.hidden = !!currentUser && bookmarkReady && list.length > 0;
  message.textContent = !currentUser ? 'Войди, чтобы сохранять закладки.' : !bookmarkReady ? 'Закладки ещё не настроены или недоступны.' : 'Пока нет закладок. Нажми ☆ на карточке.';
  grid.innerHTML = list.map((item, i) => cardHTML(item, i)).join('');
  document.querySelectorAll('[data-bookmark]').forEach(button => {
    const saved = bookmarkIds.has(button.dataset.bookmark);
    button.textContent = saved ? '★' : '☆'; button.title = saved ? 'Убрать из закладок' : 'Сохранить в закладки';
  });
  const achievements = $('#achievements-grid');
  if (!currentUser) { achievements.innerHTML = '<p>Войди, чтобы увидеть достижения.</p>'; return; }
  achievements.innerHTML = myAchievements().map(b => `<div class="cat-card achievement"><span>${b.done ? '🏆' : '🔒'}</span><h3>${escapeHTML(b.name)}</h3><p>${escapeHTML(b.description)}</p><small>${!b.available ? 'Данные недоступны' : b.done ? 'Открыто' : `${Math.min(b.value, b.target)} / ${b.target}`}</small></div>`).join('');
}

async function loadBookmarks() {
  bookmarkIds = new Set(); bookmarkReady = false;
  if (currentUser && authClient) {
    const { data, error } = await authClient.from('spike_bookmarks').select('post_id');
    if (!error) { bookmarkReady = true; bookmarkIds = new Set(data.map(row => row.post_id)); }
  }
  renderExtras();
}

async function postHeaders() {
  if (!currentUser || !authClient) return { Prefer: 'return=minimal' };
  const { data: { session } } = await authClient.auth.getSession();
  if (!session) throw new Error('Сессия истекла');
  return { Prefer: 'return=minimal', Authorization: `Bearer ${session.access_token}` };
}

addFromLink = async function () {
  const input = $('#link-input');
  const raw = input.value.trim();
  if (!raw) { toast('Вставь ссылку', true); input.focus(); return; }
  if (!sharedReady) { toast('Нет подключения к общей ленте', true); return; }
  const url = normalizeUrl(raw), source = detectSource(url);
  if (!url || source.type === 'other') { toast('Поддерживаются YouTube, Twitch, Steam, Spotify, SoundCloud, Яндекс Музыка и Кинопоиск', true); return; }
  const button = $('#btn-add-link');
  if (button.disabled) return;
  button.disabled = true;
  try {
    let title = '';
    if (source.ytId) {
      const meta = await Promise.race([youtubeMeta(source.ytId), new Promise(resolve => setTimeout(() => resolve({}), 2500))]);
      title = meta.title || '';
    }
    if (!title && source.type === 'game') title = slugTitle(url);
    if (!title) title = ({ youtube: 'Видео YouTube', twitch: 'Клип или трансляция Twitch', game: 'Игра Steam', music: `Музыка · ${source.source}`, film: 'Кино · Кинопоиск' })[source.type] || 'Публикация';
    await sharedRequest('/spike_posts', { method: 'POST', headers: await postHeaders(), body: JSON.stringify({ title: title.slice(0, 140), url, poster: '', description: '' }) });
    if (input.value.trim() === raw) input.value = '';
    await refreshShared();
    const sourceChip = $(`#chips-type [data-type="${source.type}"]`);
    if (sourceChip) sourceChip.click(); else { switchTab('feed'); renderFeed(); }
    toast(`Добавлено: ${source.source}`);
  } catch (error) { console.error('Ошибка добавления:', error); toast('Не удалось добавить ссылку. Проверь настройки базы и подключение.', true); }
  finally { button.disabled = false; }
};

submitForm = async function (e) {
  e.preventDefault();
  if (!sharedReady) { toast('Нет подключения к общей ленте', true); return; }
  const title = $('#f-title').value.trim();
  const url = normalizeUrl($('#f-url').value);
  const poster = $('#f-poster').value.trim();
  if (!title || !url || detectSource(url).type === 'other') { toast('Укажи название и ссылку поддерживаемого сервиса', true); return; }
  if (poster && !/^https?:\/\//i.test(poster)) { toast('Ссылка на обложку должна начинаться с https://', true); return; }
  try {
    await sharedRequest('/spike_posts', { method: 'POST', headers: await postHeaders(), body: JSON.stringify({ title, url, poster, description: $('#f-desc').value.trim() }) });
    closeAdd(); await refreshShared(); toast('Добавлено в общую ленту');
  } catch { toast('Не удалось добавить публикацию', true); }
};

openView = function (id) {
  originalOpenView(id);
  if (commentLikesReady) {
    $('#view-body').querySelectorAll('[data-comment-id]').forEach(element => {
      const commentId = element.dataset.commentId;
      const count = commentLikes.filter(like => like.comment_id === commentId).length;
      const mine = commentLikes.some(like => like.comment_id === commentId && like.user_id === currentUser?.id);
      const button = document.createElement('button'); button.type = 'button'; button.className = `card-foot-btn comment-like ${mine ? 'liked' : ''}`;
      button.textContent = `${mine ? '♥' : '♡'} ${count}`; button.setAttribute('aria-label', `Лайки комментария: ${count}`);
      element.appendChild(button);
      button.addEventListener('click', async () => {
        if (!currentUser || !authClient) { toast('Войди, чтобы лайкнуть комментарий', true); return; }
        button.disabled = true;
        const query = authClient.from('spike_comment_likes');
        const { error } = mine ? await query.delete().eq('comment_id', commentId).eq('user_id', currentUser.id) : await query.insert({ comment_id: commentId, user_id: currentUser.id });
        if (error) { button.disabled = false; toast('Не удалось изменить лайк комментария', true); return; }
        await refreshShared(); if (viewId === id) openView(id);
      });
    });
  }
  const viewKey = currentUser && `${currentUser.id}:${id}`;
  if (reactionsReady && viewKey && authClient && !viewedThisSession.has(viewKey)) {
    viewedThisSession.add(viewKey);
    authClient.from('spike_views').upsert({ post_id: id, user_id: currentUser.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true }).then(({ error }) => { if (error) viewedThisSession.delete(viewKey); else refreshShared(); });
  }
  const form = $('#comment-form');
  if (!form) return;
  let replyTo = null;
  const replyHint = document.createElement('p'); replyHint.className = 'field-hint'; form.before(replyHint);
  $('#view-body').querySelectorAll('[data-reply]').forEach(button => button.addEventListener('click', () => { replyTo = button.dataset.reply; replyHint.textContent = `Ответ для ${button.dataset.author} — нажми здесь, чтобы отменить`; replacement.elements.comment.focus(); }));
  replyHint.addEventListener('click', () => { replyTo = null; replyHint.textContent = ''; });
  const report = document.createElement('button'); report.className = 'view-action'; report.type = 'button'; report.textContent = '⚑ Пожаловаться';
  $('.view-actions', $('#view-body')).appendChild(report);
  report.addEventListener('click', () => openReportForm(id));
  const share = document.createElement('button'); share.className = 'view-action'; share.type = 'button'; share.textContent = '↗ Поделиться';
  $('.view-actions', $('#view-body')).appendChild(share);
  share.addEventListener('click', async () => {
    const url = new URL(location.href); url.hash = `post=${encodeURIComponent(id)}`;
    try {
      if (navigator.share) await navigator.share({ title: items.find(item => item.id === id)?.title || 'Spike', url: url.href });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url.href); toast('Ссылка скопирована'); }
      else window.prompt('Скопируй ссылку:', url.href);
    } catch (error) { if (error.name !== 'AbortError') window.prompt('Скопируй ссылку:', url.href); }
  });
  const replacement = form.cloneNode(true);
  form.replaceWith(replacement);
  const nickname = document.createElement('input');
  nickname.className = 'input comment-nickname'; nickname.name = 'nickname';
  nickname.maxLength = 30; nickname.placeholder = 'Твой ник'; nickname.required = true;
  nickname.value = localStorage.getItem('spike.nickname') || '';
  if (currentUser) { nickname.value = currentProfile?.nickname || ''; nickname.readOnly = true; nickname.placeholder = 'Сначала создай профиль'; nickname.required = false; }
  replacement.prepend(nickname);
  replacement.addEventListener('submit', async e => {
    e.preventDefault();
    const input = replacement.elements.comment;
    const body = input.value.trim();
    const author = nickname.value.trim();
    if (currentUser && !currentProfile) { toast('Сначала создай профиль', true); $('#profile-modal').hidden = false; return; }
    if (!body || !author || !sharedReady) return;
    const button = replacement.querySelector('button');
    button.disabled = true;
    try {
      const session = currentUser ? (await authClient.auth.getSession()).data.session : null;
      if (currentUser && !session) throw new Error('Сессия истекла');
      await sharedRequest('/spike_comments', { method: 'POST', headers: { Prefer: 'return=minimal', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ post_id: id, body, author_name: author, parent_id: replyTo }) });
      localStorage.setItem('spike.nickname', author);
      await refreshShared(); openView(id); toast('Комментарий добавлен');
    } catch (error) {
      button.disabled = false;
      toast(error.status === 403 || error.status === 401 ? 'Нет разрешения сохранить комментарий' : 'Не удалось отправить комментарий. Проверь соединение.', true);
      console.error('Ошибка сохранения комментария:', error);
    }
  });
};

toggleLike = async function (id) {
  if (!reactionsReady) { toast('Лайки ещё не настроены в базе', true); return; }
  if (!currentUser || !authClient) { toast('Войди, чтобы поставить лайк', true); return; }
  const query = authClient.from('spike_likes');
  const result = liked.has(id) ? await query.delete().eq('post_id', id).eq('user_id', currentUser.id) : await query.insert({ post_id: id, user_id: currentUser.id });
  if (result.error) { toast('Не удалось изменить лайк', true); return; }
  await refreshShared();
  if (viewId === id) openView(id);
};
removeItem = async function (id) {
  if (!isOwner || !authClient) { toast('Удаление доступно владельцу после входа', true); return; }
  const item = items.find(it => it.id === id);
  if (!item || !confirm(`Удалить «${item.title}» и все комментарии к публикации?`)) return;
  try {
    const { data, error } = await authClient.from('spike_posts').delete().eq('id', id).select('id');
    if (error || !data || data.length !== 1) throw error || new Error('Удаление не разрешено');
    if (viewId === id) closeView();
    await refreshShared(); toast('Публикация удалена');
  } catch (error) { console.error('Ошибка удаления:', error); toast('Не удалось удалить. Проверь настройки владельца.', true); }
};
openEdit = function () { toast('Редактирование общей ленты пока недоступно', true); };
watchItem = function (id) {
  const item = items.find(it => it.id === id);
  if (item && item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
};

document.addEventListener('DOMContentLoaded', () => {
  $('#btn-moderate').hidden = true;
  const desktopLayout = matchMedia('(min-width: 761px)');
  const topbar = $('.topbar'), sidebar = $('.layout-sidebar');
  const logoMenu = $('.logo-menu'), accountControls = $('.topbar-right'), tabs = $('#tabs');
  const moveNavigation = () => {
    if (desktopLayout.matches) {
      sidebar.prepend(logoMenu);
      sidebar.appendChild(accountControls);
    } else {
      topbar.insertBefore(logoMenu, tabs);
      topbar.appendChild(accountControls);
    }
  };
  moveNavigation();
  desktopLayout.addEventListener('change', moveNavigation);
  document.querySelectorAll('[data-layout-tab]').forEach(button => button.addEventListener('click', () => { const tab = $(`#tabs [data-tab="${button.dataset.layoutTab}"]`); if (tab) tab.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  $('#side-add').addEventListener('click', () => { $('#tabs [data-tab="feed"]').click(); $('#link-input').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#side-random').addEventListener('click', () => { $('#tabs [data-tab="feed"]').click(); $('#random-post').click(); });
  $('#view-edit').hidden = true;
  $('#view-delete').hidden = true;
  const style = document.createElement('style');
  style.textContent = '[data-watched] { display:none !important; }';
  document.head.appendChild(style);
  refreshShared();
  $('#report-new-button').addEventListener('click', () => openReportForm());
  $('#report-form-close').addEventListener('click', () => { $('#report-form-modal').hidden = true; });
  $('#report-form').addEventListener('submit', async e => {
    e.preventDefault();
    const post = $('#report-post').value, reason = $('#report-reason').value.trim(), message = $('#report-form-message');
    if (!post || reason.length < 3 || reason.length > 500) { message.textContent = 'Выбери публикацию и укажи причину от 3 до 500 символов.'; return; }
    const button = e.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    try { await sharedRequest('/spike_reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ post_id: post, reason }) }); $('#report-form-modal').hidden = true; toast('Жалоба отправлена'); }
    catch { message.textContent = 'Не удалось отправить жалобу. Проверь подключение и настройку базы.'; }
    finally { button.disabled = false; }
  });
  $('#random-post').addEventListener('click', () => {
    const available = filtered();
    if (!available.length) { toast('В этой подборке пока нет публикаций', true); return; }
    const sorted = [...available].sort((a, b) => b.likes - a.likes);
    const popular = sorted.filter(item => item.likes > 0).slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    const pool = popular.length ? popular : available;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const button = $('#random-post'); button.disabled = true; button.classList.add('random-spin');
    button.textContent = '✦ Ищем находку…';
    setTimeout(() => { button.disabled = false; button.classList.remove('random-spin'); button.textContent = '🎲 Случайная находка'; openView(chosen.id); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650);
  });
  document.addEventListener('click', async e => {
    const button = e.target.closest('[data-bookmark]');
    if (!button) return;
    if (!currentUser) { toast('Войди, чтобы сохранять закладки', true); return; }
    if (!bookmarkReady) { toast('Закладки пока недоступны', true); return; }
    const id = button.dataset.bookmark;
    button.disabled = true;
    const result = bookmarkIds.has(id)
      ? await authClient.from('spike_bookmarks').delete().eq('user_id', currentUser.id).eq('post_id', id)
      : await authClient.from('spike_bookmarks').insert({ user_id: currentUser.id, post_id: id });
    if (result.error) { button.disabled = false; toast('Не удалось сохранить закладку', true); return; }
    await loadBookmarks();
  });
});

function openReportForm(id = '') {
  const select = $('#report-post');
  select.innerHTML = '<option value="">Выбери публикацию</option>' + items.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`).join('');
  if (id) select.value = id;
  $('#report-reason').value = ''; $('#report-form-message').textContent = '';
  $('#report-form-modal').hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  const categoryNav = $('#chips-type');
  $('#sidebar-categories').appendChild(categoryNav);
  categoryNav.querySelector('[data-type="all"]').hidden = true;
  const icons = {
    youtube: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="6" width="36" height="28" rx="8" fill="currentColor"/><path d="M17 13v14l11-7z" fill="#fff"/></svg>',
    twitch: '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#9146ff" d="M6 3h31v23L27 36H18l-6 4v-4H6z"/><path fill="white" d="M12 7h21v17l-6 6h-7l-4 4v-4h-4z"/><path stroke="#9146ff" stroke-width="3" d="M20 12v10m7-10v10"/></svg>',
    game: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="currentColor"/><circle cx="26" cy="14" r="6" fill="none" stroke="white" stroke-width="3"/><path d="M3 23l12 5a5 5 0 0 0 8-4l7-6M12 28l5 2" fill="none" stroke="white" stroke-width="3"/></svg>',
    music: '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#ffd329" d="M20 1l2.6 12L30 3l-3 12 12-5-9 9 10 3-12 2 7 11-11-7-4 12-3-12-11 7 7-11-12-2 11-3L4 10l12 5L12 3l7 10z"/></svg>',
    film: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#111"/><path fill="#ff7200" d="M8 5h6v13L23 5h8L19 19l18-9-14 12 16 2-16 2 14 9-18-6 12 9h-8l-9-12v12H8z"/></svg>'
  };
  // Низкое разрешение и прямоугольные пиксели вместо сглаженных логотипов.
  const pixel = (content) => `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${content}</svg>`;
  icons.youtube = pixel('<path fill="#09090e" d="M2 3h12v1h1v8h-1v1H2v-1H1V4h1z"/><path fill="#fff" d="M6 5h2v1h2v1h2v2h-2v1H8v1H6z"/>');
  icons.twitch = pixel('<path fill="#09090e" d="M2 1h13v10h-2v2h-3l-3 3v-3H2z"/><path fill="#fff" d="M4 3h9v7h-2v1H8l-2 2v-2H4z"/><path fill="#09090e" d="M7 5h1v4H7zm3 0h1v4h-1z"/>');
  icons.game = pixel('<path fill="#09090e" d="M4 1h8v1h2v2h1v8h-1v2h-2v1H4v-1H2v-2H1V4h1V2h2z"/><path fill="#fff" d="M10 3h3v1h1v3h-1v1h-3V7H9V4h1zm0 1v3h3V4zM2 9h3v1h2v1h2V9h2v1h1v3h-1v1H8v-1H7v-1H5v-1H3v-1H2z"/>');
  icons.music = pixel('<path fill="#ffd32c" stroke="#09090e" stroke-width=".7" d="M7 0h2v5l3-3 1 1-2 3 5-1v2l-4 1 4 2-1 2-4-2 2 4-2 1-3-4-1 5H6l1-5-4 3-1-2 3-3-5 1V8l5-1-4-2 1-2 4 2z"/>');
  icons.film = pixel('<path fill="#08080c" d="M4 1h8v1h2v2h1v8h-1v2h-2v1H4v-1H2v-2H1V4h1V2h2z"/><path fill="#ff7900" d="M4 3h2v4h1V6h1V5h1V4h1V3h2v1h-1v1h-1v1H9v1h4v2H9v1h1v1h1v1h1v1h-2v-1H9v-1H8v-1H7V9H6v4H4z"/><path fill="#ffcc16" d="M11 11h1v1h1v1h-2z"/>');
  const themes = {
    all: ['Не просто ссылка.<br><span class="gradient-anim">Твоя находка.</span>', 'В чате она потеряется. На Spike её увидят друзья и сообщество: сохраняй интересное, обсуждай и находи новое.'],
    youtube: ['Видео <span class="gradient-anim">YouTube</span>', 'Делись любимыми видео, находи новых авторов и обсуждай интересное с друзьями.'],
    twitch: ['Клипы <span class="gradient-anim">Twitch</span>', 'Сохраняй яркие моменты со стримов и делись любимыми клипами Twitch с друзьями.'],
    game: ['Игры <span class="gradient-anim">Steam</span>', 'Предлагай игры Steam, открывай новые миры и выбирай, во что сыграть вместе.'],
    music: ['Мир <span class="gradient-anim">музыки</span>', 'Делись треками и альбомами из Spotify, SoundCloud и Яндекс Музыки.'],
    film: ['<span class="gradient-anim">Spike Кино</span>', 'Делись фильмами и сериалами с Кинопоиска, обсуждай премьеры и выбирай, что посмотреть.']
  };
  function setTheme(type) {
    const [title, description] = themes[type] || themes.all;
    document.body.dataset.theme = type;
    $('#theme-art-icon').innerHTML = icons[type] || '✦';
    $('.hero-title').innerHTML = title;
    $('.hero-sub').textContent = description;
    $('#link-input').placeholder = type === 'all' ? 'Ссылка на видео, игру, музыку или кино' : `Вставь ссылку: ${type === 'twitch' ? 'Twitch' : type === 'game' ? 'Steam' : type === 'music' ? 'Spotify, SoundCloud или Яндекс Музыка' : type === 'film' ? 'Кинопоиск' : 'YouTube'}`;
  }
  const menu = $('#sidebar-categories'), toggle = $('#category-toggle'), backdrop = $('#category-backdrop');
  function setMenu(open, restoreFocus = false) {
    menu.classList.toggle('is-open', open); menu.inert = !open;
    menu.setAttribute('aria-hidden', String(!open)); toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.logo-chevron').textContent = open ? '✕' : '☰';
    backdrop.hidden = !open;
    if (restoreFocus) toggle.focus();
  }
  categoryNav.querySelectorAll('[data-type]').forEach(button => {
    const icon = button.querySelector('.category-icon');
    if (icons[button.dataset.type]) icon.innerHTML = icons[button.dataset.type];
    button.addEventListener('click', () => { setTheme(button.dataset.type); switchTab('feed'); setMenu(false); });
  });
  $('#tabs [data-tab="feed"]').addEventListener('click', () => { categoryNav.querySelector('[data-type="all"]').click(); });
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop.addEventListener('click', () => setMenu(false, true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true); });
  if (!window.supabase) { $('#auth-button').disabled = true; return; }
  authClient = window.supabase.createClient(SPIKE_API.replace('/rest/v1', ''), SPIKE_KEY);
  const button = $('#auth-button');
  const modal = $('#auth-modal');
  const message = $('#auth-message');
  let user = null;
  authClient.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    currentUser = user;
    currentProfile = null;
    $('#profile-button').hidden = !user;
    isOwner = !!user && SPIKE_DEVELOPERS.has(user.id);
    button.textContent = 'Войти';
    button.hidden = !!user;
    $('#view-delete').hidden = !isOwner;
    $('#reports-button').hidden = !isOwner;
    setTimeout(async () => {
      if (user) {
        const { data } = await authClient.from('spike_profiles').select('*').eq('user_id', user.id).maybeSingle();
        if (currentUser?.id !== user.id) return;
        currentProfile = data;
      }
      await loadBookmarks();
      refreshShared();
    }, 0);
  });
  const profileModal = $('#profile-modal');
  async function showReports() {
    const list = $('#reports-list'); $('#reports-modal').hidden = false; list.textContent = 'Загрузка…';
    const { data, error } = await authClient.from('spike_reports').select('id,post_id,reason,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) { list.textContent = 'Не удалось загрузить жалобы. Проверь настройки доступа.'; return; }
    list.innerHTML = data.length ? data.map(row => `<div class="comment"><strong>${escapeHTML(items.find(item => item.id === row.post_id)?.title || 'Публикация')}</strong><p>${escapeHTML(row.reason)}</p><button class="btn btn-ghost" type="button" data-report-open="${escapeHTML(row.post_id)}">Открыть</button> <button class="btn btn-ghost" type="button" data-report-dismiss="${escapeHTML(row.id)}">Убрать жалобу</button></div>`).join('') : '<p>Жалоб пока нет.</p>';
  }
  $('#reports-button').addEventListener('click', showReports);
  $('#reports-close').addEventListener('click', () => { $('#reports-modal').hidden = true; });
  $('#public-profile-close').addEventListener('click', () => { $('#public-profile-modal').hidden = true; });
  document.addEventListener('click', async e => {
    const link = e.target.closest('[data-user-profile]');
    if (!link) return;
    const body = $('#public-profile-body'); $('#public-profile-modal').hidden = false; body.textContent = 'Загрузка…';
    try {
      const rows = await sharedRequest(`/spike_profiles?user_id=eq.${encodeURIComponent(link.dataset.userProfile)}&select=nickname,avatar_path`);
      const profile = rows[0];
      if (!profile) { body.textContent = 'Профиль не найден.'; return; }
      const count = items.flatMap(item => item.comments).filter(comment => comment.userId === link.dataset.userProfile).length;
      const badges = []; if (count >= 1) badges.push('🏆 Первый комментарий'); if (count >= 10) badges.push('🏆 Общительный');
      const ownPosts = items.filter(item => item.authorId === link.dataset.userProfile);
      const king = hypeKing?.user_id === link.dataset.userProfile;
      body.innerHTML = `<div class="profile-avatar-wrap">${king ? '<span class="profile-crown">👑</span>' : ''}<div class="profile-preview">${profile.avatar_path ? `<img src="${escapeHTML(avatarUrl(profile.avatar_path))}" alt="">` : '✦'}</div></div><h3>${escapeHTML(profile.nickname)} ${king ? '👑 Король трендов' : ''}</h3><strong>Достижения</strong><p>${badges.length ? badges.join(' · ') : 'Пока нет открытых достижений.'}</p><strong>Публикации</strong>${ownPosts.length ? ownPosts.map(post => `<button class="btn btn-ghost" type="button" data-profile-post="${escapeHTML(post.id)}">${escapeHTML(post.title)}</button>`).join('') : '<p>Новых публикаций пока нет. Старые карточки не были привязаны к автору.</p>'}`;
    } catch { body.textContent = 'Не удалось загрузить профиль.'; }
  });
  $('#public-profile-body').addEventListener('click', e => { const button = e.target.closest('[data-profile-post]'); if (button) { $('#public-profile-modal').hidden = true; openView(button.dataset.profilePost); } });
  $('#reports-list').addEventListener('click', async e => {
    const open = e.target.closest('[data-report-open]');
    if (open) { $('#reports-modal').hidden = true; openView(open.dataset.reportOpen); return; }
    const dismiss = e.target.closest('[data-report-dismiss]');
    if (!dismiss || !confirm('Убрать жалобу из списка? Публикация останется.')) return;
    const { error } = await authClient.from('spike_reports').delete().eq('id', dismiss.dataset.reportDismiss);
    if (error) toast('Не удалось убрать жалобу', true); else showReports();
  });
  function showProfile() {
    $('#profile-title').textContent = SPIKE_DEVELOPERS.has(currentUser?.id) ? 'Мой профиль · РАЗРАБОТЧИК' : 'Мой профиль';
    $('#profile-nickname').value = currentProfile?.nickname || '';
    $('#profile-avatar').value = '';
    $('#profile-message').textContent = '';
    const preview = $('#profile-preview'); preview.textContent = '';
    if (currentProfile?.avatar_path) { const img = document.createElement('img'); img.src = avatarUrl(currentProfile.avatar_path) + '?v=' + Date.now(); img.alt = ''; preview.appendChild(img); } else preview.textContent = '✦';
    const badges = myAchievements().filter(b => b.done).map(b => `🏆 ${b.name}`);
    $('#profile-achievements').textContent = badges.length ? badges.join(' · ') : 'Пока нет открытых достижений.';
    profileModal.hidden = false;
  }
  $('#profile-button').addEventListener('click', showProfile);
  $('#profile-close').addEventListener('click', () => { profileModal.hidden = true; });
  $('#profile-signout').addEventListener('click', async () => {
    const { error } = await authClient.auth.signOut();
    if (error) { $('#profile-message').textContent = 'Не удалось выйти. Попробуй ещё раз.'; return; }
    profileModal.hidden = true; toast('Вы вышли из аккаунта');
  });
  $('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    const nickname = $('#profile-nickname').value.trim(); const file = $('#profile-avatar').files[0]; const msg = $('#profile-message');
    if (nickname.length < 2 || nickname.length > 24) { msg.textContent = 'Ник должен содержать от 2 до 24 символов.'; return; }
    if (file && (file.size > 1048576 || !['image/png','image/jpeg','image/webp'].includes(file.type))) { msg.textContent = 'Выбери PNG, JPEG или WebP размером до 1 МБ.'; return; }
    const submit = e.currentTarget.querySelector('[type="submit"]'); submit.disabled = true; msg.textContent = 'Сохраняем…';
    try {
      let path = currentProfile?.avatar_path || null;
      if (file) { path = `${currentUser.id}/avatar`; const { error } = await authClient.storage.from('spike-avatars').upload(path, file, { upsert: true, contentType: file.type }); if (error) throw error; }
      const { data, error } = await authClient.from('spike_profiles').upsert({ user_id: currentUser.id, nickname, avatar_path: path }).select().single();
      if (error) throw error;
      currentProfile = data; profileModal.hidden = true; await refreshShared(); toast('Профиль сохранён');
    } catch (error) { console.error('Ошибка профиля:', error); msg.textContent = error.code === '23505' ? 'Этот ник уже занят.' : 'Не удалось сохранить профиль. Проверь настройки базы и формат изображения.'; }
    finally { submit.disabled = false; }
  });
  button.addEventListener('click', async () => {
    if (user) { await authClient.auth.signOut(); toast('Вы вышли'); return; }
    message.textContent = ''; modal.hidden = false; $('#auth-email').focus();
  });
  $('#auth-close').addEventListener('click', () => { modal.hidden = true; });
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); message.textContent = 'Выполняется вход…';
    const { error } = await authClient.auth.signInWithPassword({ email: $('#auth-email').value.trim(), password: $('#auth-password').value });
    if (error) { message.textContent = 'Не удалось войти. Проверь почту и пароль или подтверди почту.'; return; }
    modal.hidden = true; $('#auth-password').value = ''; toast('Вы вошли');
  });
  $('#auth-register').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim(); const password = $('#auth-password').value;
    if (!$('#auth-email').checkValidity() || password.length < 6) { message.textContent = 'Укажи почту и пароль не короче 6 символов.'; return; }
    message.textContent = 'Создаём аккаунт…';
    const { error } = await authClient.auth.signUp({ email, password, options: { emailRedirectTo: 'https://spike123net.github.io/Spike.net/' } });
    message.textContent = error ? 'Не удалось зарегистрироваться. Попробуй позже.' : 'Если потребуется, подтверди почту по ссылке в письме, затем войди.';
    if (!error) $('#auth-password').value = '';
  });
});
