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
  const winterCountdown = document.querySelector('#winter-countdown');
  if (winterCountdown) {
    const updateWinterCountdown = () => { const left = new Date('2026-11-20T00:00:00+03:00').getTime() - Date.now(); if (left <= 0) { winterCountdown.textContent = '20 ноября · следи за новостями'; return; } const days = Math.floor(left / 86400000), hours = Math.floor(left / 3600000) % 24; winterCountdown.textContent = `До 20 ноября: ${days} дн. ${hours} ч.`; };
    updateWinterCountdown(); setInterval(updateWinterCountdown, 60000);
  }
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
