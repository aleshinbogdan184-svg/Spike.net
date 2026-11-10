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
    const guide = modal.querySelector('.guide-frame');
    if (guide) guide.remove();
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
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = document.createElement('iframe'); frame.className = 'guide-frame'; frame.title = 'Путеводитель по Spike'; frame.src = 'guide-3d.html'; modal.appendChild(frame);
    }
    show(0);
  }
  skip.addEventListener('click', close);
  start.addEventListener('click', close);
  again.addEventListener('click', () => show(0));
  prev.addEventListener('click', () => show(Math.max(0, index - 1)));
  next.addEventListener('click', () => show(Math.min(scenes.length, index + 1)));
  document.querySelector('.add-link-trigger-hero')?.addEventListener('click', () => document.querySelector('.add-link-trigger')?.click());
  const backgroundPresets = { ocean: ['#17345d', '#56304f'], crimson: ['#641c30', '#301321'], violet: ['#402d6b', '#542b55'], forest: ['#164e49', '#273d32'], graphite: ['#303a4a', '#252530'] };
  const backgroundKey = 'spike.background.v1';
  const applyBackground = value => {
    const isCustom = /^#[0-9a-f]{6}$/i.test(value);
    const colors = isCustom ? [value, value] : backgroundPresets[value] || backgroundPresets.ocean;
    document.documentElement.style.setProperty('--background-one', colors[0]);
    document.documentElement.style.setProperty('--background-two', colors[1]);
    document.querySelectorAll('[data-background]').forEach(button => button.setAttribute('aria-pressed', String(!isCustom && button.dataset.background === value)));
    if (isCustom) document.querySelector('#background-custom').value = value;
  };
  let savedBackground = 'ocean';
  try { savedBackground = localStorage.getItem(backgroundKey) || 'ocean'; } catch {}
  applyBackground(savedBackground);
  const setBackground = value => { applyBackground(value); try { localStorage.setItem(backgroundKey, value); } catch {} };
  document.querySelectorAll('[data-background]').forEach(button => button.addEventListener('click', () => setBackground(button.dataset.background)));
  document.querySelector('#background-custom')?.addEventListener('input', e => setBackground(e.target.value));
  document.querySelector('[data-layout-tab="bookmarks"]')?.remove();
  const sidebarEvents = document.createElement('button');
  sidebarEvents.type = 'button'; sidebarEvents.innerHTML = '✧ <span>Ивенты</span>';
  sidebarEvents.addEventListener('click', () => { document.querySelector('#tabs [data-tab="events"]').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.querySelector('.layout-sidebar')?.insertBefore(sidebarEvents, document.querySelector('[data-layout-tab="updates"]'));
  modal.addEventListener('click', e => { if (e.target === modal || e.target.classList.contains('trailer-backdrop')) close(); });
  document.addEventListener('keydown', e => { if (!modal.hidden && e.key === 'Escape') close(); });
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!readSeen()) setTimeout(open, prefersReduced ? 80 : 420);
  window.showSpikeTrailer = open;
})();
