/* Общая лента Supabase. Публичный ключ не предоставляет прав администратора. */
const SPIKE_API = 'https://ktrlwkrxmewylkxhzeqk.supabase.co/rest/v1';
const SPIKE_KEY = 'sb_publishable_F-a4xfh09Www8dOSIn2cZQ_DuauYkie';
let sharedReady = false;
const originalOpenView = openView;

async function sharedRequest(path, options = {}) {
  const response = await fetch(SPIKE_API + path, {
    ...options,
    headers: { apikey: SPIKE_KEY, Authorization: `Bearer ${SPIKE_KEY}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`Ошибка базы: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function refreshShared() {
  try {
    const [posts, comments] = await Promise.all([
      sharedRequest('/spike_posts?select=*&order=created_at.desc&limit=200'),
      sharedRequest('/spike_comments?select=post_id,body,created_at&order=created_at.asc&limit=2000'),
    ]);
    items = posts.map(post => {
      const source = detectSource(post.url);
      return { id: post.id, title: post.title, url: post.url, type: source.type, source: source.source,
        ytId: source.ytId, desc: post.description, poster: post.poster, year: '', tags: [], cover: '',
        likes: 0, views: 0, watched: false, createdAt: new Date(post.created_at).getTime(),
        comments: comments.filter(c => c.post_id === post.id).map(c => ({ text: c.body })) };
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
  replacement.addEventListener('submit', async e => {
    e.preventDefault();
    const input = replacement.elements.comment;
    const body = input.value.trim();
    if (!body || !sharedReady) return;
    const button = replacement.querySelector('button');
    button.disabled = true;
    try {
      await sharedRequest('/spike_comments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ post_id: id, body }) });
      await refreshShared(); openView(id); toast('Комментарий добавлен');
    } catch { button.disabled = false; toast('Не удалось отправить комментарий', true); }
  });
};

toggleLike = function () { toast('Общие лайки пока не подключены', true); };
removeItem = function () { toast('Удаление доступно только владельцу базы', true); };
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
  style.textContent = '.like-btn, .views-badge, [data-watched], #stat-views, #stat-views + .stat-label, .card-meta span:nth-child(2) { display:none !important; }';
  document.head.appendChild(style);
  refreshShared();
});
