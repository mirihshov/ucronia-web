// Movimiento y comportamiento del sitio: revelado al hacer scroll, contadores, parallax, cabecera, menú móvil,
// carrusel de titulares de la portada, vista previa rotativa de artículos y manifiesto (frase y principios ligados al scroll).
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let bound = false, ready = false, ticking = false;

function setupReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in),[data-split]:not(.in)');
  if (reduce() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}

function setupCounters() {
  document.querySelectorAll<HTMLElement>('[data-count]:not([data-counted])').forEach((el) => {
    const target = Number(el.dataset.count);
    el.dataset.counted = '1';
    if (!Number.isFinite(target) || reduce()) return;
    el.textContent = '0';
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    io.observe(el);
  });
}

function onScroll() {
  ticking = false;
  const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
  const header = document.querySelector<HTMLElement>('.site-header');
  header?.classList.toggle('scrolled', y > 24);
  if (header) document.documentElement.style.setProperty('--hh', `${header.offsetHeight}px`); // altura de la cabecera: el manifiesto se ancla justo debajo
  header?.style.setProperty('--p', h > 0 ? String(Math.min(1, y / h)) : '0');
  const hero = document.querySelector<HTMLElement>('.hero-image');
  if (hero && !reduce() && y < innerHeight * 1.2) hero.style.setProperty('--py', `${(y * 0.12).toFixed(1)}px`);
  updateManifesto();
}


/* ── Portada: titulares rotativos con su foto (flechas a los costados, rotación automática) ── */
function setupHero() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (!root || root.dataset.ready) return;
  const imgs = [...root.querySelectorAll<HTMLElement>('.hero-img')];
  const txt = [...root.querySelectorAll<HTMLElement>('.hero-slide')];
  const n = txt.length;
  if (n < 2) return;
  root.dataset.ready = '1';
  const every = Number(root.dataset.interval) || 7000;
  let i = 0, elapsed = 0, hover = false, focus = false, away = false;

  const show = (to: number) => {
    i = (to + n) % n; elapsed = 0;
    [imgs, txt].forEach((list) => list.forEach((e, k) => {
      e.classList.toggle('on', k === i);
      if (k === i) e.removeAttribute('aria-hidden'); else e.setAttribute('aria-hidden', 'true');
    }));
  };
  imgs.forEach((e, k) => { if (k) e.setAttribute('aria-hidden', 'true'); });
  txt.forEach((e, k) => { if (k) e.setAttribute('aria-hidden', 'true'); });

  root.querySelector('[data-hero-prev]')?.addEventListener('click', () => show(i - 1));
  root.querySelector('[data-hero-next]')?.addEventListener('click', () => show(i + 1));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { show(i + 1); e.preventDefault(); }
  });
  // Deslizar con el dedo sobre la foto.
  const fig = root.querySelector<HTMLElement>('.hero-image');
  let x0 = 0, y0 = 0;
  fig?.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  fig?.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) show(i + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // Rotación automática: cuenta solo el tiempo en que nada la detiene (ratón encima, foco de teclado, fuera de pantalla, pestaña oculta).
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  root.addEventListener('pointerleave', () => { hover = false; });
  root.addEventListener('focusin', () => { focus = true; });
  root.addEventListener('focusout', () => { focus = false; });
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { away = !es[0].isIntersecting; }, { threshold: 0.25 }).observe(root);
  if (reduce()) return; // con «reducir movimiento» solo cambia con las flechas o el dedo
  const STEP = 100;
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); return; }
    if (hover || focus || away || document.hidden) return;
    elapsed += STEP;
    if (elapsed >= every) show(i + 1);
  }, STEP);
}

/* ── Artículos: vista previa de 2 en 2 (1 en móvil) que rota sola; flechas, dedo y teclado ── */
function setupArticles() {
  const root = document.querySelector<HTMLElement>('[data-articles]');
  const track = root?.querySelector<HTMLElement>('[data-art-track]');
  const slides = track ? [...track.querySelectorAll<HTMLElement>('.art-slide')] : [];
  if (!root || !track || root.dataset.ready || slides.length < 2) return;
  root.dataset.ready = '1';
  const every = Number(root.dataset.interval) || 8000;
  const cur = root.querySelector<HTMLElement>('[data-art-cur]'), bar = root.querySelector<HTMLElement>('[data-art-bar]');
  const pad = (n: number) => String(n).padStart(2, '0');
  const per = () => Math.max(1, Math.round(track.clientWidth / Math.max(1, slides[0].offsetWidth)));
  const last = () => Math.max(0, slides.length - per());
  let i = 0, elapsed = 0, hover = false, focus = false, away = false, settle = 0;

  const sync = () => {
    const p = per();
    root.classList.toggle('static', last() === 0);
    if (cur) cur.textContent = p > 1 ? `${pad(i + 1)}–${pad(Math.min(slides.length, i + p))}` : pad(i + 1);
    slides.forEach((e, k) => e.classList.toggle('on', k >= i && k < i + p));
  };
  const show = (to: number, smooth = true) => {
    const m = last();
    i = to > m ? 0 : to < 0 ? m : to; elapsed = 0;
    track.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: smooth && !reduce() ? 'smooth' : 'auto' });
    sync();
  };

  root.querySelector('[data-art-prev]')?.addEventListener('click', () => show(i - 1));
  root.querySelector('[data-art-next]')?.addEventListener('click', () => show(i + 1));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { show(i + 1); e.preventDefault(); }
  });
  // Al deslizar con el dedo (o la rueda) el carrusel se ajusta solo: se lee dónde quedó cuando termina de moverse.
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = window.setTimeout(() => {
      const w = slides[1].offsetLeft - slides[0].offsetLeft || slides[0].offsetWidth;
      const k = Math.min(last(), Math.max(0, Math.round(track.scrollLeft / Math.max(1, w))));
      if (k !== i) { i = k; sync(); }
      elapsed = 0;
    }, 120);
  }, { passive: true });
  addEventListener('resize', () => show(Math.min(i, last()), false), { passive: true });

  // Rotación automática de una en una (con envoltura): se detiene con el ratón encima, el foco, fuera de pantalla o pestaña oculta.
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  root.addEventListener('pointerleave', () => { hover = false; });
  root.addEventListener('focusin', () => { focus = true; });
  root.addEventListener('focusout', () => { focus = false; });
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { away = !es[0].isIntersecting; }, { threshold: 0.3 }).observe(root);
  sync();
  if (reduce()) return; // con «reducir movimiento» solo cambia con las flechas o el dedo
  const STEP = 100;
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); return; }
    if (last() === 0 || hover || focus || away || document.hidden) return;
    elapsed += STEP;
    bar?.style.setProperty('--ap', Math.min(1, elapsed / every).toFixed(3));
    if (elapsed >= every) { show(i + 1); bar?.style.setProperty('--ap', '0'); }
  }, STEP);
}

/* ── Manifiesto: frase que se ilumina, principio activo y marca de agua con parallax ── */
function updateManifesto() {
  const m = document.querySelector<HTMLElement>('.manifesto');
  if (!m) return;
  const vh = innerHeight, r = m.getBoundingClientRect();
  if (r.bottom < -vh * 0.2 || r.top > vh * 1.2) return;
  m.style.setProperty('--mp', Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height))).toFixed(4));
  const q = m.querySelector<HTMLElement>('[data-scrub]');
  if (q) {
    const words = q.querySelectorAll<HTMLElement>('.sw');
    const k = reduce() ? 1 : Math.min(1, Math.max(0, (vh * 0.92 - q.getBoundingClientRect().top) / (vh * 0.45)));
    const lit = Math.round(k * words.length);
    words.forEach((w, j) => w.classList.toggle('lit', j < lit));
  }
  const list = m.querySelector<HTMLElement>('.principles');
  if (list) {
    const items = [...list.querySelectorAll<HTMLElement>('li')];
    const mid = vh * 0.5;
    const lr = list.getBoundingClientRect();
    let best = 0, bd = Infinity;
    items.forEach((li, j) => { const b = li.getBoundingClientRect(); const d = Math.abs(b.top + b.height / 2 - mid); if (d < bd) { bd = d; best = j; } });
    // al final de la lista (o de la página) el último principio no llega nunca al centro: se activa igualmente
    if (lr.bottom < vh * 0.8 || scrollY + vh >= document.documentElement.scrollHeight - 4) best = items.length - 1;
    list.classList.add('spy');
    items.forEach((li, j) => li.classList.toggle('is-active', j === best));
    list.style.setProperty('--rp', Math.min(1, Math.max(0, (mid - lr.top) / Math.max(1, lr.height - vh * 0.3))).toFixed(4));
    const c = m.querySelector<HTMLElement>('[data-m-cur]');
    if (c) c.textContent = String(best + 1).padStart(2, '0');
  }
}

function closeMenu() {
  document.documentElement.classList.remove('menu-open');
  document.querySelector('.main-nav')?.classList.remove('open');
  document.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
}

function bindOnce() {
  if (bound) return;
  bound = true;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.menu-button')) {
      const open = document.querySelector('.main-nav')!.classList.toggle('open');
      document.documentElement.classList.toggle('menu-open', open);
      document.querySelector('.menu-button')!.setAttribute('aria-expanded', String(open));
    } else if (t.closest('.main-nav a')) closeMenu();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  addEventListener('resize', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);
}

function init() {
  ready = true;
  bindOnce(); closeMenu(); setupReveal(); setupCounters(); setupHero(); setupArticles(); onScroll();
}
document.addEventListener('astro:page-load', init);
setTimeout(() => { if (!ready) init(); });
