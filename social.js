/* Посты и подписки: права проверяются Supabase RLS. */
let socialFilter = 'all';
let socialRows = [];
let followRows = [];
let socialProfiles = new Map();

async function loadSocial() {
  const status = $('#social-status');
  status.textContent = 'Загрузка…';
  try {
    const [posts, follows, profiles] = await Promise.all([
      sharedRequest('/spike_social_posts?select=*&order=created_at.desc&limit=100'),
      sharedRequest('/spike_follows?select=follower_id,followed_id&limit=10000'),
      sharedRequest('/spike_profiles?select=user_id,nickname,avatar_path&limit=10000'),
    ]);
    socialRows = posts; followRows = follows; socialProfiles = new Map(profiles.map(profile => [profile.user_id, profile]));
    renderSocial();
  } catch (error) { console.error('Посты недоступны:', error); status.textContent = 'Посты пока недоступны: проверь настройки базы.'; }
}

function renderSocial() {
  const status = $('#social-status'), grid = $('#social-grid');
  if (socialFilter === 'following' && !currentUser) { status.textContent = 'Войди, чтобы видеть посты подписок.'; grid.innerHTML = ''; return; }
  const following = new Set(followRows.filter(row => row.follower_id === currentUser?.id).map(row => row.followed_id));
  const rows = socialRows.filter(row => socialFilter === 'all' || following.has(row.author_id));
  status.textContent = rows.length ? '' : socialFilter === 'all' ? 'Пока нет постов — создай первый!' : 'Здесь появятся посты авторов, на которых ты подписан.';
  const labels = { meme: 'Мем', mod: 'Мод', topic: 'Обсуждение', other: 'Другое' };
  grid.innerHTML = rows.map(row => {
    const profile = socialProfiles.get(row.author_id);
    const image = /^https?:\/\//i.test(row.image_url) ? row.image_url : '';
    const owner = currentUser && (currentUser.id === row.author_id || SPIKE_DEVELOPERS.has(currentUser.id));
    const isFollowing = following.has(row.author_id);
    return `<article class="social-card">${image ? `<img class="social-image" src="${escapeHTML(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : '<div class="social-placeholder">✦</div>'}<div class="social-body"><div class="social-meta"><button class="profile-link" type="button" data-user-profile="${escapeHTML(row.author_id)}">${escapeHTML(profile?.nickname || 'Пользователь')}</button><span>${escapeHTML(labels[row.category] || 'Пост')}</span></div><h2>${escapeHTML(row.title)}</h2><p>${escapeHTML(row.body)}</p><div class="social-actions">${currentUser && currentUser.id !== row.author_id ? `<button class="btn btn-ghost" type="button" data-follow="${escapeHTML(row.author_id)}">${isFollowing ? '✓ Подписан' : '＋ Подписаться'}</button>` : ''}${owner ? `<button class="btn btn-ghost btn-danger" type="button" data-social-delete="${escapeHTML(row.id)}">Удалить</button>` : ''}<small>${timeAgo(new Date(row.created_at).getTime())}</small></div></div></article>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const updates = $('#view-updates .release-card ul');
  if (updates) { const item = document.createElement('li'); item.innerHTML = '<strong>Посты и подписки:</strong> новый дизайн сообщества, загрузка изображений с устройства, подписки через профиль и лента постов авторов.'; updates.appendChild(item); }
  const sidebar = $('.layout-sidebar');
  const sideButton = document.createElement('button'); sideButton.type = 'button'; sideButton.innerHTML = '▤ <span>Посты</span>';
  sideButton.addEventListener('click', () => { $('#tabs [data-tab="social"]').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  sidebar.insertBefore(sideButton, sidebar.querySelector('[data-layout-tab="trends"]'));
  $('#tabs [data-tab="social"]').addEventListener('click', loadSocial);
  document.querySelectorAll('[data-social-filter]').forEach(button => button.addEventListener('click', () => { socialFilter = button.dataset.socialFilter; document.querySelectorAll('[data-social-filter]').forEach(b => b.classList.toggle('active', b === button)); renderSocial(); }));
  $('#social-create').addEventListener('click', () => { if (!currentUser) { toast('Войди, чтобы создать пост', true); return; } if (!currentProfile) { toast('Сначала создай профиль', true); return; } $('#social-form').reset(); $('#social-error').textContent = ''; $('#social-modal').hidden = false; });
  $('#social-close').addEventListener('click', () => { $('#social-modal').hidden = true; });
  $('#social-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!currentUser || !authClient) return;
    const title = $('#social-title-input').value.trim(), body = $('#social-body').value.trim(), image = $('#social-image').value.trim(), file = $('#social-file').files[0];
    if (!title || (image && !/^https?:\/\//i.test(image))) { $('#social-error').textContent = 'Укажи заголовок и корректную ссылку на картинку.'; return; }
    if (file && (file.size > 3145728 || !['image/png','image/jpeg','image/webp'].includes(file.type))) { $('#social-error').textContent = 'Выбери PNG, JPEG или WebP размером до 3 МБ.'; return; }
    const button = e.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    let imageUrl = image, uploadedPath = '';
    if (file) {
      uploadedPath = `${currentUser.id}/${crypto.randomUUID()}`;
      const upload = await authClient.storage.from('spike-post-images').upload(uploadedPath, file, { contentType: file.type });
      if (upload.error) { button.disabled = false; $('#social-error').textContent = 'Не удалось загрузить изображение. Проверь настройки хранилища.'; return; }
      imageUrl = authClient.storage.from('spike-post-images').getPublicUrl(uploadedPath).data.publicUrl;
    }
    const { error } = await authClient.from('spike_social_posts').insert({ author_id: currentUser.id, title, body, category: $('#social-category').value, image_url: imageUrl });
    if (error && uploadedPath) await authClient.storage.from('spike-post-images').remove([uploadedPath]);
    button.disabled = false; if (error) { $('#social-error').textContent = 'Не удалось опубликовать пост. Проверь настройки базы.'; return; }
    $('#social-modal').hidden = true; await loadSocial(); toast('Пост опубликован');
  });
  $('#social-grid').addEventListener('click', async e => {
    const follow = e.target.closest('[data-follow]');
    if (follow && currentUser && authClient) {
      follow.disabled = true; const id = follow.dataset.follow;
      const exists = followRows.some(row => row.follower_id === currentUser.id && row.followed_id === id);
      const query = authClient.from('spike_follows');
      const result = exists ? await query.delete().eq('follower_id', currentUser.id).eq('followed_id', id) : await query.insert({ follower_id: currentUser.id, followed_id: id });
      if (result.error) { follow.disabled = false; toast('Не удалось изменить подписку', true); } else await loadSocial(); return;
    }
    const del = e.target.closest('[data-social-delete]');
    if (del && currentUser && authClient && confirm('Удалить этот пост?')) {
      const { data, error } = await authClient.from('spike_social_posts').delete().eq('id', del.dataset.socialDelete).select('id');
      if (error || !data?.length) toast('Не удалось удалить пост', true); else await loadSocial();
    }
  });
});

async function addProfileFollow(userId, container) {
  const { count, error } = await authClient.from('spike_follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId);
  if (error || !container.isConnected) return;
  const line = document.createElement('span'); line.className = 'profile-follow-count'; line.textContent = `${count || 0} подписчиков`; container.appendChild(line);
  if (!currentUser || currentUser.id === userId) return;
  const { data, error: lookupError } = await authClient.from('spike_follows').select('followed_id').eq('follower_id', currentUser.id).eq('followed_id', userId).maybeSingle();
  if (lookupError || !container.isConnected) return;
  let following = !!data;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-primary'; button.textContent = following ? '✓ Подписан' : '＋ Подписаться'; container.appendChild(button);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const query = authClient.from('spike_follows');
    const result = following ? await query.delete().eq('follower_id', currentUser.id).eq('followed_id', userId) : await query.insert({ follower_id: currentUser.id, followed_id: userId });
    button.disabled = false;
    if (result.error) { toast('Не удалось изменить подписку', true); return; }
    following = !following; button.textContent = following ? '✓ Подписан' : '＋ Подписаться'; line.textContent = `${Math.max(0, (count || 0) + (following ? (data ? 0 : 1) : (data ? -1 : 0)))} подписчиков`;
  });
}
