/* Общая лента Supabase. Публичный ключ не предоставляет прав администратора. */
const SPIKE_API = 'https://ktrlwkrxmewylkxhzeqk.supabase.co/rest/v1';
const SPIKE_KEY = 'sb_publishable_F-a4xfh09Www8dOSIn2cZQ_DuauYkie';
let sharedReady = false;
const originalOpenView = openView;
let authClient = null;
const SPIKE_OWNER = '4120e992-bcb9-45e4-9822-609948510d9c';
let isOwner = false;

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
      sharedRequest('/spike_comments?select=post_id,body,author_name,created_at&order=created_at.asc&limit=2000'),
    ]);
    items = posts.map(post => {
      const source = detectSource(post.url);
      return { id: post.id, title: post.title, url: post.url, type: source.type, source: source.source,
        ytId: source.ytId, desc: post.description, poster: post.poster, year: '', tags: [], cover: '',
        likes: 0, views: 0, watched: false, createdAt: new Date(post.created_at).getTime(),
        comments: comments.filter(c => c.post_id === post.id).map(c => ({ text: c.body, author: c.author_name || 'Гость' })) };
    });
    sharedReady = true;
    document.querySelector('#connection-status').textContent = 'Общая лента: публикации и комментарии видны всем. Лайки и просмотры пока не подключены.';
    renderAll();
  } catch (error) {
    sharedReady = false;
    items = [];
    document.querySelector('#connection-status').textContent = 'Нет подключения к общей ленте. Проверьте настройку базы и подключение к интернету.';
    renderAll();
  }
}

submitForm = async function (e) {
  e.preventDefault();
  if (!sharedReady) { toast('Нет подключения к общей ленте', true); return; }
  const title = $('#f-title').value.trim();
  const url = normalizeUrl($('#f-url').value);
  const poster = $('#f-poster').value.trim();
  if (!title || !url || detectSource(url).type === 'other') { toast('Укажи название и ссылку поддерживаемого сервиса', true); return; }
  if (poster && !/^https?:\/\//i.test(poster)) { toast('Ссылка на обложку должна начинаться с https://', true); return; }
  try {
    await sharedRequest('/spike_posts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ title, url, poster, description: $('#f-desc').value.trim() }) });
    closeAdd(); await refreshShared(); toast('Добавлено в общую ленту');
  } catch { toast('Не удалось добавить публикацию', true); }
};

openView = function (id) {
  originalOpenView(id);
  const form = $('#comment-form');
  if (!form) return;
  const replacement = form.cloneNode(true);
  form.replaceWith(replacement);
  const nickname = document.createElement('input');
  nickname.className = 'input comment-nickname'; nickname.name = 'nickname';
  nickname.maxLength = 30; nickname.placeholder = 'Твой ник'; nickname.required = true;
  nickname.value = localStorage.getItem('spike.nickname') || '';
  replacement.prepend(nickname);
  replacement.addEventListener('submit', async e => {
    e.preventDefault();
    const input = replacement.elements.comment;
    const body = input.value.trim();
    const author = nickname.value.trim();
    if (!body || !author || !sharedReady) return;
    const button = replacement.querySelector('button');
    button.disabled = true;
    try {
      await sharedRequest('/spike_comments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ post_id: id, body, author_name: author }) });
      localStorage.setItem('spike.nickname', author);
      await refreshShared(); openView(id); toast('Комментарий добавлен');
    } catch (error) {
      button.disabled = false;
      toast(error.status === 403 || error.status === 401 ? 'Нет разрешения сохранить комментарий' : 'Не удалось отправить комментарий. Проверь соединение.', true);
      console.error('Ошибка сохранения комментария:', error);
    }
  });
};

toggleLike = function () { toast('Общие лайки пока не подключены', true); };
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
  $('#view-edit').hidden = true;
  $('#view-delete').hidden = true;
  const style = document.createElement('style');
  style.textContent = '[data-like], .like-btn, .views-badge, [data-watched], #stat-views, #stat-views + .stat-label, .card-meta span:nth-child(2) { display:none !important; }';
  document.head.appendChild(style);
  refreshShared();
});

document.addEventListener('DOMContentLoaded', () => {
  const categoryNav = $('#chips-type');
  $('#sidebar-categories').appendChild(categoryNav);
  categoryNav.querySelector('[data-type="all"]').hidden = true;
  const icons = {
    youtube: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="6" width="36" height="28" rx="8" fill="currentColor"/><path d="M17 13v14l11-7z" fill="#fff"/></svg>',
    game: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="currentColor"/><circle cx="26" cy="14" r="6" fill="none" stroke="white" stroke-width="3"/><path d="M3 23l12 5a5 5 0 0 0 8-4l7-6M12 28l5 2" fill="none" stroke="white" stroke-width="3"/></svg>',
    music: '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#ffd329" d="M20 1l2.6 12L30 3l-3 12 12-5-9 9 10 3-12 2 7 11-11-7-4 12-3-12-11 7 7-11-12-2 11-3L4 10l12 5L12 3l7 10z"/></svg>',
    film: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#111"/><path fill="#ff7200" d="M8 5h6v13L23 5h8L19 19l18-9-14 12 16 2-16 2 14 9-18-6 12 9h-8l-9-12v12H8z"/></svg>'
  };
  categoryNav.querySelectorAll('[data-type]').forEach(button => {
    const icon = button.querySelector('.category-icon');
    if (icons[button.dataset.type]) icon.innerHTML = icons[button.dataset.type];
    button.addEventListener('click', () => { switchTab('feed'); $('#sidebar-categories').hidden = true; $('#category-toggle').setAttribute('aria-expanded', 'false'); });
  });
  $('#category-toggle').addEventListener('click', () => {
    const menu = $('#sidebar-categories'); menu.hidden = !menu.hidden;
    $('#category-toggle').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.logo-menu')) { $('#sidebar-categories').hidden = true; $('#category-toggle').setAttribute('aria-expanded', 'false'); } });
  if (!window.supabase) { $('#auth-button').disabled = true; return; }
  authClient = window.supabase.createClient(SPIKE_API.replace('/rest/v1', ''), SPIKE_KEY);
  const button = $('#auth-button');
  const modal = $('#auth-modal');
  const message = $('#auth-message');
  let user = null;
  authClient.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    isOwner = user?.id === SPIKE_OWNER;
    button.textContent = user ? 'Выйти' : 'Войти';
    $('#view-delete').hidden = !isOwner;
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
    const { error } = await authClient.auth.signUp({ email, password, options: { emailRedirectTo: 'https://aleshinbogdan184-svg.github.io/Spike.net/' } });
    message.textContent = error ? 'Не удалось зарегистрироваться. Попробуй позже.' : 'Если потребуется, подтверди почту по ссылке в письме, затем войди.';
    if (!error) $('#auth-password').value = '';
  });
});
