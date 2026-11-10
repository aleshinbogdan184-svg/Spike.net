/* Первый запуск Spike: короткий интерактивный трейлер без внешнего видеофайла. */
(() => {
  const KEY = 'spike.welcome.seen.v1';
  const modal = document.querySelector('#welcome-trailer');
  if (!modal) return;
  const scenes = [...modal.querySelectorAll('.trailer-scene')];
  const finish = modal.querySelector('.trailer-finish');
  const dots = [...modal.querySelectorAll('.trailer-progress i')];
  const skip = modal.querySelector('#trailer-skip');
  const start = modal.querySelector('#trailer-start');
  const again = modal.querySelector('#trailer-again');
  let timer;
  let index = 0;

  function close() {
    clearTimeout(timer);
    modal.classList.add('is-closing');
    localStorage.setItem(KEY, '1');
    setTimeout(() => { modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('trailer-open'); }, 380);
  }
  function show(n) {
    index = n;
    scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === n));
    finish.classList.toggle('is-active', n >= scenes.length);
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === n));
    if (n < scenes.length) timer = setTimeout(() => show(n + 1), 3500);
    else timer = setTimeout(close, 7000);
  }
  function open() {
    clearTimeout(timer);
    modal.hidden = false; modal.classList.remove('is-closing'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('trailer-open');
    show(0);
  }
  skip.addEventListener('click', close);
  start.addEventListener('click', close);
  again.addEventListener('click', () => show(0));
  modal.addEventListener('click', e => { if (e.target === modal || e.target.classList.contains('trailer-backdrop')) close(); });
  document.addEventListener('keydown', e => { if (!modal.hidden && e.key === 'Escape') close(); });
  if (!localStorage.getItem(KEY)) setTimeout(open, 420);
  window.showSpikeTrailer = open;
})();
