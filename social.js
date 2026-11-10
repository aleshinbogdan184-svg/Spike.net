/* Посты и подписки: права проверяются Supabase RLS. */
let socialFilter = 'all';
let socialRows = [];
let followRows = [];
let socialProfiles = new Map();
let socialLikes = [], socialReposts = [];
let socialHashtag = '';
function renderPostText(text) {
  return String(text || '').split(/(#[\p{L}\p{N}_]{1,40})/gu).map(part => /^#[\p{L}\p{N}_]{1,40}$/u.test(part) ? `<button type="button" class="social-hashtag" data-hashtag="${escapeHTML(part.slice(1))}">${escapeHTML(part)}</button>` : escapeHTML(part)).join('');
}

function socialAvatar(profile) {
  const url = avatarUrl(profile?.avatar_path);
  return `<span class="social-avatar">${url ? `<img src="${escapeHTML(url)}" alt="" onerror="this.hidden=true">` : '✦'}</span>`;
}

async function loadSocial() {
  const status = $('#social-status');
  status.textContent = 'Загрузка…';
  try {
    const [posts, follows, profiles, likes, reposts] = await Promise.all([
      sharedRequest('/spike_social_posts?select=*&order=created_at.desc&limit=100'),
      sharedRequest('/spike_follows?select=follower_id,followed_id&limit=10000'),
      sharedRequest('/spike_profiles?select=user_id,nickname,avatar_path&limit=10000'),
      sharedRequest('/spike_social_likes?select=post_id,user_id&limit=10000').catch(() => []),
      sharedRequest('/spike_social_reposts?select=post_id,user_id&limit=10000').catch(() => []),
    ]);
    socialRows = posts; followRows = follows; socialProfiles = new Map(profiles.map(profile => [profile.user_id, profile]));
    socialLikes = likes; socialReposts = reposts;
    renderSocial();
  } catch (error) { console.error('Посты недоступны:', error); status.textContent = 'Посты пока недоступны: проверь настройки базы.'; }
}

function renderSocial() {
  const status = $('#social-status'), grid = $('#social-grid');
  if (socialFilter === 'following' && !currentUser) { status.textContent = 'Войди, чтобы видеть посты подписок.'; grid.innerHTML = ''; return; }
  const following = new Set(followRows.filter(row => row.follower_id === currentUser?.id).map(row => row.followed_id));
  const rows = socialRows.filter(row => (socialFilter === 'all' || following.has(row.author_id)) && (!socialHashtag || (String(row.title || '') + ' ' + String(row.body || '')).match(/#[\p{L}\p{N}_]{1,40}/gu)?.some(tag => tag.slice(1).toLocaleLowerCase() === socialHashtag.toLocaleLowerCase())));
  status.textContent = rows.length ? '' : socialFilter === 'all' ? 'Пока нет постов — создай первый!' : 'Здесь появятся посты авторов, на которых ты подписан.';
  const tagStatus = $('#social-tag-status');
  if (tagStatus) { tagStatus.hidden = !socialHashtag; tagStatus.querySelector('span').textContent = socialHashtag ? `#${socialHashtag}` : ''; }
  const labels = { meme: 'Мем', mod: 'Мод', topic: 'Обсуждение', other: 'Другое' };
  grid.innerHTML = rows.map(row => {
    const profile = socialProfiles.get(row.author_id);
    const image = /^https?:\/\//i.test(row.image_url) ? row.image_url : '';
    const owner = currentUser && (currentUser.id === row.author_id || SPIKE_DEVELOPERS.has(currentUser.id));
    const isFollowing = following.has(row.author_id);
    const likes = socialLikes.filter(x => x.post_id === row.id), reposts = socialReposts.filter(x => x.post_id === row.id);
    return `<article class="social-card"><button class="social-cover-button" type="button" data-social-open="${escapeHTML(row.id)}" aria-label="Открыть пост">${image ? `<img class="social-image" src="${escapeHTML(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : '<span class="social-placeholder">✦</span>'}</button><div class="social-body"><div class="social-meta"><button class="profile-link" type="button" data-user-profile="${escapeHTML(row.author_id)}">${socialAvatar(profile)} ${escapeHTML(profile?.nickname || 'Пользователь')}</button><span>${escapeHTML(labels[row.category] || 'Пост')}</span></div><button class="social-title-link" type="button" data-social-open="${escapeHTML(row.id)}">${escapeHTML(row.title)}</button><p>${escapeHTML(row.body)}</p><div class="social-actions"><button class="btn btn-ghost ${likes.some(x => x.user_id === currentUser?.id) ? 'liked' : ''}" type="button" data-social-like="${escapeHTML(row.id)}" aria-label="Нравится: ${likes.length}"><svg class="pixel-icon cactus-icon" aria-hidden="true"><use href="pixel-icons.svg#cactus"></use></svg> ${likes.length}</button><button class="btn btn-ghost social-comment-count" type="button" data-social-open="${escapeHTML(row.id)}" aria-label="Открыть комментарии"><svg class="pixel-icon" aria-hidden="true"><use href="pixel-icons.svg#comment"></use></svg> Открыть</button><button class="btn btn-ghost" type="button" data-social-repost="${escapeHTML(row.id)}">↻ ${reposts.length}</button>${currentUser && currentUser.id !== row.author_id ? `<button class="btn btn-ghost" type="button" data-follow="${escapeHTML(row.author_id)}">${isFollowing ? '✓' : '＋'}</button>` : ''}${owner ? `<button class="btn btn-ghost btn-danger" type="button" data-social-delete="${escapeHTML(row.id)}">Удалить</button>` : ''}<small>${timeAgo(new Date(row.created_at).getTime())}</small></div></div></article>`;
  }).join('');
}

async function openSocialPost(id) {
  const row = socialRows.find(post => post.id === id); if (!row) return;
  const container = $('#social-view-body'), profile = socialProfiles.get(row.author_id);
  $('#social-view-modal').hidden = false;
  container.innerHTML = `<div class="social-post-layout"><div class="social-post-main"><div class="social-post-author"><button class="social-author-link" type="button" data-user-profile="${escapeHTML(row.author_id)}">${socialAvatar(profile)}<span><strong>${escapeHTML(profile?.nickname || 'Пользователь')}</strong><small>${timeAgo(new Date(row.created_at).getTime())}</small></span></button></div><h2 class="social-post-title">${escapeHTML(row.title)}</h2>${row.body ? `<p class="social-view-text">${escapeHTML(row.body)}</p>` : ''}${/^https?:\/\//i.test(row.image_url) ? `<img class="social-view-image" src="${escapeHTML(row.image_url)}" alt="Изображение публикации" referrerpolicy="no-referrer">` : ''}</div><section class="social-discussion"><h3>Комментарии <span id="social-comment-count"></span></h3><form id="social-comment-form" class="social-comment-compose">${socialAvatar(currentProfile)}<input class="input" name="body" maxlength="500" required aria-label="Написать комментарий" placeholder="Написать комментарий"><button class="btn btn-primary" type="submit">Отправить</button></form><p class="field-hint">Для комментария нужен вход и профиль.</p><div id="social-comments" aria-live="polite">Загрузка…</div></section></div>`;
  const postText = container.querySelector('.social-view-text'); if (postText) postText.innerHTML = renderPostText(row.body);
  const actions = document.createElement('div'); actions.className = 'social-detail-actions';
  const copy = document.createElement('button'); copy.className = 'btn btn-ghost'; copy.type = 'button'; copy.textContent = '↗ Копировать ссылку';
  copy.addEventListener('click', async () => { const url = new URL(location.href); url.hash = `social=${encodeURIComponent(id)}`; try { await navigator.clipboard.writeText(url.href); toast('Ссылка скопирована'); } catch { window.prompt('Скопируй ссылку:', url.href); } }); actions.appendChild(copy);
  if (/^https?:\/\//i.test(row.image_url || '')) { const download = document.createElement('button'); download.className = 'btn btn-ghost'; download.type = 'button'; download.textContent = '↓ Скачать изображение'; download.addEventListener('click', async () => { download.disabled = true; try { const response = await fetch(row.image_url); if (!response.ok) throw new Error('download'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('not an image'); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `spike-${id}.${({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif' })[blob.type] || 'img'}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { toast('Не удалось скачать изображение: источник запретил доступ', true); } finally { download.disabled = false; } }); actions.appendChild(download); }
  container.querySelector('.social-post-main').appendChild(actions);
  container.addEventListener('click', e => { const tag = e.target.closest('[data-hashtag]'); if (!tag) return; socialHashtag = tag.dataset.hashtag; socialFilter = 'all'; $('#social-view-modal').hidden = true; $('#tabs [data-tab="social"]').click(); loadSocial(); });
  let replyTo = null, commentLikes = [], repliesReady = true;
  const replyHint = document.createElement('button'); replyHint.type = 'button'; replyHint.className = 'comment-reply-hint'; replyHint.hidden = true; replyHint.addEventListener('click', () => { replyTo = null; replyHint.hidden = true; });
  $('#social-comment-form').before(replyHint);
  async function loadComments() {
    const target = $('#social-comments');
    try {
      let rows;
      try { rows = await sharedRequest(`/spike_social_comments?post_id=eq.${encodeURIComponent(id)}&select=id,user_id,body,created_at,parent_id&order=created_at.asc&limit=200`); repliesReady = true; }
      catch { rows = await sharedRequest(`/spike_social_comments?post_id=eq.${encodeURIComponent(id)}&select=id,user_id,body,created_at&order=created_at.asc&limit=200`); repliesReady = false; }
      const likesResult = await sharedRequest('/spike_social_comment_likes?select=comment_id,user_id&limit=10000').catch(() => null);
      commentLikes = likesResult || [];
      if (!target.isConnected) return;
      $('#social-comment-count').textContent = rows.length ? `· ${rows.length}` : '';
      const commentHTML = c => { const commenter = socialProfiles.get(c.user_id) || (currentUser?.id === c.user_id ? currentProfile : null), name = commenter?.nickname || 'Пользователь', likes = commentLikes.filter(l => l.comment_id === c.id), mine = likes.some(l => l.user_id === currentUser?.id); return `<article class="social-comment ${c.parent_id ? 'social-comment-reply' : ''}"><button class="social-comment-avatar" type="button" data-user-profile="${escapeHTML(c.user_id)}" aria-label="Профиль ${escapeHTML(name)}">${socialAvatar(commenter)}</button><div class="social-comment-content"><div class="social-comment-meta"><button class="profile-link" type="button" data-user-profile="${escapeHTML(c.user_id)}">${escapeHTML(name)}</button><time>${timeAgo(new Date(c.created_at).getTime())}</time></div><p>${renderCommentText(c.body)}</p><div class="comment-actions">${likesResult ? `<button class="card-foot-btn comment-like ${mine ? 'liked' : ''}" type="button" data-social-comment-like="${escapeHTML(c.id)}">${mine ? '♥' : '♡'} ${likes.length}</button>` : ''}${repliesReady && !c.parent_id ? `<button class="card-foot-btn" type="button" data-social-reply="${escapeHTML(c.id)}" data-reply-name="${escapeHTML(name)}">Ответить</button>` : ''}${currentUser?.id === c.user_id ? `<button class="card-foot-btn comment-delete" type="button" data-social-comment-delete="${escapeHTML(c.id)}">Удалить</button>` : ''}</div></div></article>`; };
      target.innerHTML = rows.length ? rows.filter(c => !c.parent_id).map(c => { const replies = rows.filter(r => r.parent_id === c.id); return commentHTML(c) + (replies.length ? `<details class="social-replies"><summary>Показать ответы · ${replies.length}</summary>${replies.map(commentHTML).join('')}</details>` : ''); }).join('') : '<p class="social-comments-empty">Пока нет комментариев. Начни обсуждение!</p>';
    } catch { if (target.isConnected) target.textContent = 'Не удалось загрузить комментарии.'; }
  }
  $('#social-comments').addEventListener('click', async e => {
    const reply = e.target.closest('[data-social-reply]');
    if (reply) { replyTo = reply.dataset.socialReply; replyHint.textContent = `Ответ для ${reply.dataset.replyName} · отменить ×`; replyHint.hidden = false; $('#social-comment-form').elements.body.focus(); return; }
    const like = e.target.closest('[data-social-comment-like]');
    if (like) { if (!currentUser || !authClient) { toast('Войди, чтобы оценить комментарий', true); return; } like.disabled = true; const commentId = like.dataset.socialCommentLike, mine = commentLikes.some(l => l.comment_id === commentId && l.user_id === currentUser.id); try { const q = authClient.from('spike_social_comment_likes'), result = mine ? await q.delete().eq('comment_id', commentId).eq('user_id', currentUser.id) : await q.insert({comment_id:commentId,user_id:currentUser.id}); if (result.error) throw result.error; await loadComments(); } catch { like.disabled = false; toast('Не удалось сохранить оценку', true); } return; }
    const button = e.target.closest('[data-social-comment-delete]');
    if (!button || !currentUser || !authClient || !confirm('Удалить свой комментарий?')) return;
    button.disabled = true;
    try {
      const { data, error } = await authClient.from('spike_social_comments').delete().eq('id', button.dataset.socialCommentDelete).eq('user_id', currentUser.id).select('id');
      if (error || !data?.length) throw error || new Error('Удаление не разрешено');
      await loadComments(); toast('Комментарий удалён');
    } catch { button.disabled = false; toast('Не удалось удалить комментарий', true); }
  });
  addEmojiPicker($('#social-comment-form'), $('#social-comment-form').elements.body);
  $('#social-comment-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser || !authClient || !currentProfile) { toast('Войди и создай профиль, чтобы комментировать', true); return; }
    const input = e.currentTarget.elements.body, text = input.value.trim(); if (!text) return;
    const button = e.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    const payload = { post_id: id, user_id: currentUser.id, body: text }; if (replyTo) payload.parent_id = replyTo;
    const { error } = await authClient.from('spike_social_comments').insert(payload);
    button.disabled = false; if (error) { toast('Не удалось отправить комментарий', true); return; }
    input.value = ''; replyTo = null; replyHint.hidden = true; await loadComments();
  });
  loadComments();
}

async function addSocialProfilePosts(userId, container) {
  try {
    const [rows, repostRows, likeRows, streakRows] = await Promise.all([
      sharedRequest(`/spike_social_posts?author_id=eq.${encodeURIComponent(userId)}&select=id,title,body,image_url,created_at&order=created_at.desc&limit=50`),
      sharedRequest(`/spike_social_reposts?user_id=eq.${encodeURIComponent(userId)}&select=post_id,created_at&order=created_at.desc&limit=50`).catch(() => []),
      sharedRequest(`/spike_social_likes?user_id=eq.${encodeURIComponent(userId)}&select=post_id,created_at&order=created_at.desc&limit=50`).catch(() => []),
      sharedRequest(`/spike_streaks?user_id=eq.${encodeURIComponent(userId)}&select=streak,last_day`).catch(() => [])
    ]);
    if (!container.isConnected) return;
    const streak = streakRows[0];
    if (streak) {
      const today = new Date().toISOString().slice(0,10), yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
      if (streak.last_day === today || streak.last_day === yesterday) { const badge = document.createElement('p'); badge.className = 'streak-badge'; badge.textContent = `${streak.streak >= 100 ? '🔥👑' : streak.streak >= 50 ? '🔥💎' : streak.streak >= 10 ? '🔥⭐' : '🔥'} ${streak.streak} дн. подряд`; container.prepend(badge); }
    }
    const section = document.createElement('section'); section.className = 'public-profile-section';
    const ids = repostRows.map(row => row.post_id);
    const repostPosts = ids.length ? await sharedRequest(`/spike_social_posts?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,title&limit=50`) : [];
    const likeIds = likeRows.map(row => row.post_id);
    const likedPosts = likeIds.length ? await sharedRequest(`/spike_social_posts?id=in.(${likeIds.map(encodeURIComponent).join(',')})&select=id,title&limit=50`) : [];
    if (!container.isConnected) return;
    section.innerHTML = `<strong>Посты автора</strong>${rows.length ? rows.map(row => `<button class="btn btn-ghost profile-social-post" type="button" data-profile-social="${escapeHTML(row.id)}">${escapeHTML(row.title)}</button>`).join('') : '<p>Постов пока нет.</p>'}<strong>Репосты</strong>${repostPosts.length ? repostPosts.map(row => `<button class="btn btn-ghost profile-social-post" type="button" data-profile-social="${escapeHTML(row.id)}">↻ ${escapeHTML(row.title)}</button>`).join('') : '<p>Репостов пока нет.</p>'}<strong>Понравившиеся посты</strong>${likedPosts.length ? likedPosts.map(row => `<button class="btn btn-ghost profile-social-post" type="button" data-profile-social="${escapeHTML(row.id)}">♥ ${escapeHTML(row.title)}</button>`).join('') : '<p>Лайков пока нет.</p>'}`;
    container.appendChild(section);
    section.addEventListener('click', async e => { const button = e.target.closest('[data-profile-social]'); if (!button) return; await loadSocial(); $('#public-profile-modal').hidden = true; openSocialPost(button.dataset.profileSocial); });
  } catch { /* Профиль остаётся доступен, даже если посты недоступны. */ }
}

document.addEventListener('DOMContentLoaded', () => {
  const updates = $('#view-updates .release-card ul');
  if (updates) { const item = document.createElement('li'); item.innerHTML = '<strong>Профили и посты:</strong> обновлённый профиль со вкладками публикаций, репостов и лайков; публичный огонёк ежедневных визитов, который меняется на 10, 50 и 100 днях; комментарии, лайки, репосты и подписки.'; updates.appendChild(item); }
  const sidebar = $('.layout-sidebar');
  const sideButton = document.createElement('button'); sideButton.type = 'button'; sideButton.innerHTML = '▤ <span>Лента</span>';
  sideButton.addEventListener('click', () => { $('#tabs [data-tab="social"]').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  sidebar.insertBefore(sideButton, sidebar.querySelector('[data-layout-tab="feed"]'));
  const videos = sidebar.querySelector('[data-layout-tab="feed"] span'); if (videos) videos.textContent = 'Видео';
  $('#tabs [data-tab="social"]').addEventListener('click', loadSocial);
  const tagStatus = document.createElement('div'); tagStatus.id = 'social-tag-status'; tagStatus.className = 'social-tag-status'; tagStatus.hidden = true; tagStatus.innerHTML = 'Тег: <span></span> <button type="button">Сбросить ×</button>'; $('#social-status').before(tagStatus);
  tagStatus.querySelector('button').addEventListener('click', () => { socialHashtag = ''; renderSocial(); });
  const socialHash = location.hash.match(/^#social=([0-9a-f-]{36})$/i);
  if (socialHash) { $('#tabs [data-tab="social"]').click(); loadSocial().then(() => { openSocialPost(socialHash[1]); }); }
  else { $('#tabs [data-tab="social"]').click(); }
  document.querySelectorAll('[data-social-filter]').forEach(button => button.addEventListener('click', () => { socialFilter = button.dataset.socialFilter; document.querySelectorAll('[data-social-filter]').forEach(b => b.classList.toggle('active', b === button)); renderSocial(); }));
  $('#social-create').addEventListener('click', () => { if (!currentUser) { toast('Войди, чтобы создать пост', true); return; } if (!currentProfile) { toast('Сначала создай профиль', true); return; } $('#social-form').reset(); $('#social-error').textContent = ''; $('#social-modal').hidden = false; });
  $('#social-close').addEventListener('click', () => { $('#social-modal').hidden = true; });
  $('#social-view-close').addEventListener('click', () => { $('#social-view-modal').hidden = true; });
  $('#social-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!currentUser || !authClient) return;
    const title = $('#social-title-input').value.trim(), body = $('#social-body').value.trim(), image = $('#social-image').value.trim(), file = $('#social-file').files[0];
    if (!title || (image && !/^https?:\/\//i.test(image))) { $('#social-error').textContent = 'Укажи заголовок и корректную ссылку на картинку.'; return; }
    if (file && (file.size > 3145728 || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))) { $('#social-error').textContent = 'Выбери PNG, JPEG, WebP или GIF размером до 3 МБ.'; return; }
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
    const reaction = e.target.closest('[data-social-like], [data-social-repost]');
    if (reaction) {
      if (!currentUser || !authClient) { toast('Войди, чтобы оценивать и делать репосты', true); return; }
      const repost = reaction.hasAttribute('data-social-repost'); const id = repost ? reaction.dataset.socialRepost : reaction.dataset.socialLike;
      const collection = repost ? socialReposts : socialLikes, table = repost ? 'spike_social_reposts' : 'spike_social_likes';
      const exists = collection.some(x => x.post_id === id && x.user_id === currentUser.id); reaction.disabled = true;
      const query = authClient.from(table); const result = exists ? await query.delete().eq('post_id', id).eq('user_id', currentUser.id) : await query.insert({ post_id: id, user_id: currentUser.id });
      if (result.error) { reaction.disabled = false; toast('Не удалось сохранить действие', true); } else await loadSocial(); return;
    }
    const open = e.target.closest('[data-social-open]');
    if (open) { openSocialPost(open.dataset.socialOpen); return; }
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

let ownProfileTab = 'posts';
let ownProfileData = null;
async function loadOwnProfile() {
  if (!currentUser || !authClient) return;
  const id = currentUser.id, content = $('#own-profile-content'), stats = $('#own-profile-stats');
  content.textContent = 'Загрузка…';
  try {
    const [posts, reposts, likes, following, followers, streak] = await Promise.all([
      authClient.from('spike_social_posts').select('id,title,body,image_url,category').eq('author_id', id).order('created_at', { ascending: false }).limit(100),
      authClient.from('spike_social_reposts').select('post_id').eq('user_id', id).limit(100),
      authClient.from('spike_social_likes').select('post_id').eq('user_id', id).limit(100),
      authClient.from('spike_follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
      authClient.from('spike_follows').select('*', { count: 'exact', head: true }).eq('followed_id', id),
      authClient.from('spike_streaks').select('streak,last_day').eq('user_id', id).maybeSingle(),
    ]);
    if (currentUser?.id !== id || $('#profile-modal').hidden) return;
    ownProfileData = { posts, reposts, likes };
    const days = !streak.error && streak.data ? streak.data.streak : null;
    stats.textContent = `${following.error ? '—' : following.count || 0} подписок · ${followers.error ? '—' : followers.count || 0} подписчиков · ${posts.error ? '—' : posts.data.length} постов${days === null ? '' : ` · ${days >= 100 ? '🔥👑' : days >= 50 ? '🔥💎' : days >= 10 ? '🔥⭐' : '🔥'} ${days} дн.`}`;
    renderOwnProfile();
  } catch { if (content.isConnected) content.textContent = 'Не удалось загрузить профиль.'; }
}

async function renderOwnProfile() {
  const content = $('#own-profile-content'); if (!ownProfileData || !content) return;
  if (ownProfileTab === 'saved') {
    if (!bookmarkReady) { content.textContent = 'Сохранённые находки недоступны. Проверь настройки Supabase.'; return; }
    const saved = items.filter(item => bookmarkIds.has(String(item.id)));
    content.innerHTML = saved.length ? saved.map(item => `<button type="button" class="profile-post-tile" data-own-link="${escapeHTML(item.id)}">${item.poster ? `<img src="${escapeHTML(item.poster)}" alt="" loading="lazy">` : '<span class="profile-tile-placeholder">✦</span>'}<span class="profile-tile-title">${escapeHTML(item.title)}</span></button>`).join('') : '<p>Сохранённых находок пока нет. Нажми ☆ на карточке в ленте.</p>';
    return;
  }
  const data = ownProfileData[ownProfileTab];
  if (data.error) { content.textContent = 'Раздел временно недоступен.'; return; }
  let posts = data.data;
  if (ownProfileTab !== 'posts') {
    const ids = posts.map(row => row.post_id);
    if (!ids.length) { content.textContent = 'Пока пусто.'; return; }
    const result = await authClient.from('spike_social_posts').select('id,title,body,image_url,category').in('id', ids).limit(100);
    if (ownProfileData[ownProfileTab] !== data || !content.isConnected) return;
    if (result.error) { content.textContent = 'Не удалось загрузить посты.'; return; }
    posts = result.data;
  }
  content.innerHTML = posts.length ? posts.map(row => `<button type="button" class="profile-post-tile" data-own-social="${escapeHTML(row.id)}">${/^https?:\/\//i.test(row.image_url || '') ? `<img src="${escapeHTML(row.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="profile-tile-placeholder">✦</span>'}<span class="profile-tile-title">${escapeHTML(row.title)}</span></button>`).join('') : '<p>Пока пусто.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-own-tab]').forEach(button => button.addEventListener('click', () => { ownProfileTab = button.dataset.ownTab; document.querySelectorAll('[data-own-tab]').forEach(b => b.classList.toggle('active', b === button)); renderOwnProfile(); }));
  $('#own-profile-content').addEventListener('click', async e => {
    const link = e.target.closest('[data-own-link]');
    if (link) { $('#profile-modal').hidden = true; openView(link.dataset.ownLink); return; }
    const post = e.target.closest('[data-own-social]');
    if (post) { await loadSocial(); $('#profile-modal').hidden = true; openSocialPost(post.dataset.ownSocial); }
  });
});
