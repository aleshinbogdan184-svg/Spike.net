/* Первый запуск Spike: короткий интерактивный трейлер без внешнего видеофайла. */
(() => {
  const KEY = 'spike.welcome.seen.v2';
  const readSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch {} };
  const modal = document.querySelector('#welcome-trailer');
  if (!modal) return;
  const scenes = [...modal.querySelectorAll('.trailer-scene')];
  const finish = modal.querySelector('.trailer-finish');
  const dots = [...modal.querySelectorAll('.trailer-progress i')];
  const skip = modal.querySelector('#trailer-skip');
  const start = modal.querySelector('#trailer-start');
  const again = modal.querySelector('#trailer-again');
  const prev = modal.querySelector('#trailer-prev');
  const next = modal.querySelector('#trailer-next');
  let timer;
  let index = 0;

  function close() {
    clearTimeout(timer);
    modal.classList.add('is-closing');
    markSeen();
    setTimeout(() => { modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('trailer-open'); }, 380);
  }
  function show(n) {
    clearTimeout(timer);
    index = n;
    scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === n));
    finish.classList.toggle('is-active', n >= scenes.length);
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === n));
    prev.hidden = n === 0;
    next.hidden = n >= scenes.length;
  }
  function open() {
    clearTimeout(timer);
    modal.hidden = false; modal.classList.remove('is-closing'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('trailer-open');
    show(0);
  }
  skip.addEventListener('click', close);
  start.addEventListener('click', close);
  again.addEventListener('click', () => show(0));
  prev.addEventListener('click', () => show(Math.max(0, index - 1)));
  next.addEventListener('click', () => show(Math.min(scenes.length, index + 1)));
  document.querySelector('#events-vice-run')?.addEventListener('click', () => document.querySelector('#vice-run-open')?.click());
  document.querySelector('[data-layout-tab="bookmarks"]')?.remove();
  const sidebarEvents = document.createElement('button');
  sidebarEvents.type = 'button'; sidebarEvents.innerHTML = '✧ <span>Ивенты</span>';
  sidebarEvents.addEventListener('click', () => { document.querySelector('#tabs [data-tab="events"]').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.querySelector('.layout-sidebar')?.insertBefore(sidebarEvents, document.querySelector('[data-layout-tab="updates"]'));
  const eventView = document.querySelector('#view-events');
  if (eventView) {
    const challenge = document.createElement('section');
    challenge.className = 'vice-challenge';
    challenge.innerHTML = `<div><span class="events-kicker">VICE SPIKE / ГОРОДСКОЙ ВЫЗОВ</span><h2>Чем займёмся сегодня?</h2><p>Испытай удачу: выбери случайное задание и исследуй Spike по-новому. Это задания для настроения — они не отслеживаются и не дают наград.</p><p class="challenge-result" id="challenge-result" aria-live="polite">Нажми кнопку, чтобы получить задание ✦</p><button class="btn btn-primary" id="challenge-pick" type="button">Получить задание ↗</button></div><div class="challenge-art" aria-hidden="true"><span>VICE</span><b>✦</b><small>YOUR CITY / YOUR RULES</small></div>`;
    eventView.appendChild(challenge);
    const challenges = [
      'Зайди в Vice Run и попробуй побить свой личный рекорд.',
      'Найди в ленте музыку для поездки по ночному городу и поставь лайк.',
      'Открой тренды и найди что-то, чего раньше не видел.',
      'Выбери находку и расскажи в комментарии, почему она тебе понравилась.',
      'Открой раздел постов и загляни в интересное обсуждение.',
      'Найди видео или игру с атмосферой летнего заката.',
      'Поделись с другом находкой, которая напоминает тебе Vice City.'
    ];
    let lastChallenge = -1;
    challenge.querySelector('#challenge-pick').addEventListener('click', () => {
      let next = Math.floor(Math.random() * (challenges.length - (lastChallenge >= 0 ? 1 : 0)));
      if (lastChallenge >= 0 && next >= lastChallenge) next++;
      lastChallenge = next;
      challenge.querySelector('#challenge-result').textContent = challenges[next];
      challenge.querySelector('#challenge-pick').textContent = 'Другое задание ↻';
    });
  }
  const updates = document.querySelector('#view-updates .view-intro');
  if (updates) {
    const release = document.createElement('article');
    release.className = 'release-card sunset-release';
    release.innerHTML = `<div class="release-head"><span class="release-version">НОВОЕ</span><span class="release-tag">VICE SPIKE / SUNSET</span></div><h2>Новый взгляд на Spike</h2><p>Обновили сайт в атмосфере Vice City: больше закатных оттенков, меньше визуального шума.</p><ul><li><strong>Редизайн:</strong> неоновые акценты, мягкие градиенты и более спокойный интерфейс.</li><li><strong>Посты:</strong> обновлённые карточки и более аккуратная лента сообщества.</li><li><strong>Ивенты:</strong> отдельная вкладка с Vice Spike, Vice Run и анонсом новогоднего события 20 ноября 2026 года. Подробности нового события появятся позже.</li><li><strong>Городской вызов:</strong> генератор случайных идей для знакомства с сайтом и ивентом — без начисления наград.</li><li><strong>Ознакомление:</strong> подробнее рассказали о возможностях Spike и добавили ручное переключение шагов.</li><li><strong>Закладки:</strong> убраны из интерфейса в пользу лайков. Ранее сохранённые данные не удаляются; связанные с закладками награды и оформление остаются архивными.</li></ul><div class="release-callout">✦ Заходи в раздел «Ивенты» и найди своё задание на сегодня.</div>`;
    updates.insertAdjacentElement('afterend', release);
    const note = document.createElement('li'); note.innerHTML = '<strong>Просмотр и обсуждения:</strong> новая компоновка с комментариями рядом с публикацией, изображения постов без обрезки и облегчённое оформление трендов. Сохранённые находки доступны в профиле; настройки и жалобы — в меню аватара.'; release.querySelector('ul').appendChild(note);
    const oldNote = [...release.querySelectorAll('li')].find(li => li.textContent.startsWith('Закладки:'));
    if (oldNote) oldNote.textContent = 'Сохранённые находки: нажми ☆ на карточке и открой вкладку «Сохранённые» в профиле.';
  }
  modal.addEventListener('click', e => { if (e.target === modal || e.target.classList.contains('trailer-backdrop')) close(); });
  document.addEventListener('keydown', e => { if (!modal.hidden && e.key === 'Escape') close(); });
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!readSeen()) setTimeout(open, prefersReduced ? 80 : 420);
  window.showSpikeTrailer = open;
})();
