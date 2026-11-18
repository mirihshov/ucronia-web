// Vista previa del EPUB como lector de libro: en escritorio un libro abierto (dos páginas), en móvil una página a
// pantalla completa. El texto se pagina con columnas CSS y se dibuja con el formato del EPUB (cursivas, títulos,
// alineación, imágenes…). Todo se construye con createElement/textContent: nunca se inserta HTML.
import { geometry, clamp, keepPosition, pageLabel, GAP_ONE, GAP_TWO, type Geometry } from '../lib/reader-math';

type Run = { x: string; f?: number };
type Block = {
  t: 'p' | 'h' | 'li' | 'hr' | 'img'; r?: Run[]; n?: number; a?: 'c' | 'r' | 'j' | 'l'; q?: 1; i?: 0 | 1; g?: 1;
  m?: string; s?: string; alt?: string; c?: 1; pb?: 1;
};
type Data = { blocks: Block[]; words: number };
type Active = {
  dlg: HTMLDialogElement; stage: HTMLElement; view: HTMLElement; pages: HTMLElement; book: HTMLElement; label: HTMLElement;
  prev: HTMLButtonElement; next: HTMLButtonElement; ro: ResizeObserver; raf: number; i: number; g: Geometry;
};

const SIZES = [14, 16, 18, 20];
const EASE = 'cubic-bezier(.2,.7,.2,1)'; // la misma curva del resto del sitio
const mobile = matchMedia('(max-width: 640px)'); // mismo criterio que el CSS: pantalla completa
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const cache = new Map<string, Data>();
let active: Active | null = null;
let fs = 1; // índice en SIZES
try { const v = Number(localStorage.getItem('ucronia-lector-letra')); if (Number.isInteger(v) && v >= 0 && v < SIZES.length) fs = v; } catch { /* sin almacenamiento */ }

const el = (tag: string, text = '', cls = '') => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;

async function load(url: string): Promise<Data> {
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as Data;
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('vacío');
  cache.set(url, data);
  return data;
}

// ---- Dibujo de los bloques del EPUB ----
const F_I = 1, F_B = 2, F_SC = 4, F_SUP = 8, F_SUB = 16;
const ALIGN = new Set(['c', 'r', 'j', 'l']);

function runNodes(runs: Run[]): Node[] {
  const out: Node[] = [];
  for (const r of runs) {
    if (typeof r.x !== 'string') continue;
    if (r.x === '\n') { out.push(document.createElement('br')); continue; }
    let n: Node = document.createTextNode(r.x);
    const f = r.f ?? 0;
    const wrap = (tag: string, cls = '') => { const w = el(tag, '', cls); w.append(n); n = w; };
    if (f & F_SC) wrap('span', 'sc');
    if (f & F_B) wrap('strong');
    if (f & F_I) wrap('em');
    if (f & F_SUP) wrap('sup'); else if (f & F_SUB) wrap('sub');
    out.push(n);
  }
  return out;
}

function blockNode(b: Block): HTMLElement | null {
  const cls = (...c: (string | false | 0 | undefined)[]) => c.filter(Boolean).join(' ');
  const al = b.a && ALIGN.has(b.a) ? `a-${b.a}` : '';
  if (b.t === 'hr') return el('p', '· · ·', 'pv-hr');
  if (b.t === 'img') {
    if (!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(b.s ?? '')) return null;
    const f = el('figure', '', cls('pv-fig', b.c && 'pv-cover', b.pb && 'pb'));
    const im = document.createElement('img');
    im.src = b.s!; im.alt = b.alt ?? ''; im.decoding = 'async';
    f.append(im);
    return f;
  }
  if (!b.r?.length) return null;
  if (b.t === 'h') {
    const lv = Math.min(6, Math.max(1, Number(b.n) || 2));
    const h = el('h3', '', cls('pv-h', `lv${lv}`, al, b.pb && 'pb'));
    h.append(...runNodes(b.r));
    return h;
  }
  if (b.t === 'li') {
    const p = el('p', '', cls('li', b.g && 'tight', b.q && 'q', b.pb && 'pb'));
    const body = el('span');
    body.append(...runNodes(b.r));
    p.append(el('span', b.m ?? '•', 'mk'), body);
    return p;
  }
  const p = el('p', '', cls(al, b.i === 1 && 'ind', b.g && 'tight', b.q && 'q', b.pb && 'pb'));
  p.append(...runNodes(b.r));
  return p;
}

// ---- Tamaño del libro: se calcula, nunca depende del texto (así no se desborda ni tapa los botones) ----
function fit(dlg: HTMLElement, stage: HTMLElement): 1 | 2 | undefined {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (sw < 50 || sh < 50) return undefined;
  let n: 1 | 2 = 1, W = sw, H = sh, bw = '100%';
  if (!mobile.matches) {
    const maxW = sw - 16, maxH = Math.min(sh - 16, 640); // 16 px: la sombra del libro
    const w2 = Math.min(maxW, Math.round(maxH * 1.6), 960);
    if (w2 - 88 >= 640) { n = 2; W = w2; H = Math.min(maxH, Math.round(w2 / 1.6)); } // libro abierto solo si cada página queda cómoda
    else { W = Math.min(maxW, 520); H = maxH; }
    bw = `${W}px`;
  }
  const book = q(dlg, '.book');
  book.style.width = `${W}px`;
  book.style.height = `${H}px`;
  dlg.style.setProperty('--bw', bw); // la barra y el pie miden lo mismo que el libro
  return n;
}

/** Mensaje mientras carga o si falla; sin paginación. */
function idle(dlg: HTMLDialogElement, msg: string) {
  q(dlg, '[data-pages]').replaceChildren(el('p', msg, 'pv-msg'));
  q(dlg, '[data-label]').textContent = '';
  for (const b of dlg.querySelectorAll<HTMLButtonElement>('[data-prev],[data-next]')) b.disabled = true;
}

/** Los bloques visibles de la página actual suben y aparecen uno tras otro, como el resto del sitio. */
function reveal(a: Active, dir: number) {
  if (reduced()) return;
  const vr = a.view.getBoundingClientRect();
  let k = 0;
  for (const c of Array.from(a.pages.children) as HTMLElement[]) {
    const r = c.getBoundingClientRect();
    if (r.right < vr.left + 6 || r.left > vr.right - 6 || r.bottom < vr.top || r.top > vr.bottom) continue;
    c.animate(
      [{ opacity: 0, transform: `translate(${dir * 16}px, 12px)` }, { opacity: 1, transform: 'none' }],
      { duration: 760, delay: Math.min(k, 14) * 38, easing: EASE, fill: 'backwards' },
    );
    k++;
  }
}

function go(i: number, animate: boolean) {
  const a = active;
  if (!a) return;
  const before = a.i;
  a.i = clamp(i, a.g.spreads);
  a.pages.style.transform = `translate3d(${-a.i * a.g.step}px,0,0)`;
  a.label.textContent = pageLabel(a.i, a.g).text;
  a.prev.disabled = a.i === 0;
  a.next.disabled = a.i >= a.g.spreads - 1;
  if (animate && a.i !== before) reveal(a, a.i > before ? 1 : -1);
}

/** Recalcula tamaño del libro, columnas y posición (se conserva la lectura al cambiar letra o ventana). */
function layout(keep: boolean) {
  const a = active;
  if (!a) return;
  const n = fit(a.dlg, a.stage);
  if (!n) return;
  const W = a.view.clientWidth, H = a.view.clientHeight;
  if (W < 80 || H < 80) return;
  const gap = n === 2 ? GAP_TWO : GAP_ONE;
  a.dlg.style.setProperty('--fs', `${SIZES[fs]}px`);
  a.dlg.style.setProperty('--ph', `${H}px`);
  Object.assign(a.pages.style, { width: `${W}px`, height: `${H}px`, columnCount: String(n), columnGap: `${gap}px` });
  const old = a.g.spreads, oldI = a.i;
  a.g = geometry(W, a.pages.scrollWidth, n); // lee scrollWidth: fuerza el reparto en columnas
  a.book.classList.toggle('two', n === 2);
  go(keep ? keepPosition(oldI, old, a.g.spreads) : 0, false);
}

const schedule = () => { // varios avisos seguidos (ventana, imágenes que cargan) = un solo reparto
  const a = active;
  if (a && !a.raf) a.raf = requestAnimationFrame(() => { a.raf = 0; layout(true); });
};

function mount(dlg: HTMLDialogElement, d: Data) {
  const nodes = d.blocks.map(blockNode).filter((n): n is HTMLElement => !!n);
  const end = el('div', '', 'pv-page pv-end');
  const dl = el('a', 'Descargar EPUB ↓', 'more-button') as HTMLAnchorElement;
  dl.href = dlg.dataset.dl ?? '#'; dl.rel = 'nofollow'; dl.tabIndex = -1; dl.setAttribute('data-astro-reload', '');
  end.append(el('small', 'Fin de la vista previa'), dl);
  const pages = q(dlg, '[data-pages]');
  pages.replaceChildren(...nodes, end);
  for (const im of pages.querySelectorAll('img')) im.addEventListener('load', schedule); // al cargar una imagen cambia el reparto

  const stage = q(dlg, '.reader-stage');
  const a: Active = {
    dlg, stage, pages, view: q(dlg, '[data-view]'), book: q(dlg, '.book'), label: q(dlg, '[data-label]'),
    prev: q<HTMLButtonElement>(dlg, '[data-prev]'), next: q<HTMLButtonElement>(dlg, '[data-next]'),
    ro: new ResizeObserver(schedule), raf: 0, i: 0, g: { n: 1, gap: GAP_ONE, step: 0, cols: 1, spreads: 1 },
  };
  active = a;
  a.ro.observe(stage);
  requestAnimationFrame(() => { if (active === a) { layout(false); reveal(a, 0); } });
  document.fonts?.ready.then(() => active === a && schedule());
  a.view.focus({ preventScroll: true });
}

function unmount() {
  const a = active;
  if (!a) return;
  a.ro.disconnect();
  cancelAnimationFrame(a.raf);
  a.pages.replaceChildren();
  a.pages.style.transform = '';
  active = null;
}

/** Cierra con la misma animación suave con la que se abre. */
function closeReader(dlg: HTMLDialogElement) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (reduced()) { dlg.close(); return; }
  dlg.classList.add('closing');
  setTimeout(() => { dlg.classList.remove('closing'); if (dlg.open) dlg.close(); }, 360);
}

// ---- Eventos: un solo juego de oyentes en el documento (sirve también tras navegar con ClientRouter) ----
document.addEventListener('click', async (e) => {
  const t = e.target as Element | null;
  const dlg = document.getElementById('preview-dialog') as HTMLDialogElement | null;
  if (!t || !dlg) return;
  if (t === dlg || t.closest('[data-preview-close]')) { closeReader(dlg); return; } // fondo o ✕
  if (active && dlg.open) {
    if (t.closest('[data-prev]')) { go(active.i - 1, true); return; }
    if (t.closest('[data-next]')) { go(active.i + 1, true); return; }
    if (t.closest('[data-fs]')) { // un solo botón «Aa»: recorre los tamaños
      fs = (fs + 1) % SIZES.length;
      try { localStorage.setItem('ucronia-lector-letra', String(fs)); } catch { /* sin almacenamiento */ }
      layout(true);
      return;
    }
  }
  const btn = t.closest<HTMLElement>('[data-preview]');
  if (!btn?.dataset.url) return;
  if (!dlg.dataset.bound) { // Esc también cierra con animación
    dlg.dataset.bound = '1';
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closeReader(dlg); });
  }
  idle(dlg, 'Cargando vista previa…');
  if (!dlg.open) dlg.showModal();
  fit(dlg, q(dlg, '.reader-stage')); // el libro tiene su tamaño desde el primer momento
  try {
    const d = await load(btn.dataset.url);
    if (!dlg.open) return; // se cerró mientras cargaba
    mount(dlg, d);
    dlg.addEventListener('close', unmount, { once: true });
  } catch {
    idle(dlg, 'No se pudo cargar la vista previa. Puedes descargar el EPUB para leer el libro completo.');
  }
});

document.addEventListener('keydown', (e) => {
  const a = active;
  if (!a || !a.dlg.open || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown') go(a.i + 1, true);
  else if (k === 'ArrowLeft' || k === 'PageUp') go(a.i - 1, true);
  else if (k === 'Home') go(0, true);
  else if (k === 'End') go(a.g.spreads - 1, true);
  else return;
  e.preventDefault();
});

// Táctil: deslizar a los lados pasa de página; un toque en el tercio izquierdo/derecho también. El ratón no (se puede seleccionar texto).
let start: { x: number; y: number; t: number } | null = null;
document.addEventListener('pointerdown', (e) => {
  start = active && e.pointerType !== 'mouse' && (e.target as Element).closest('[data-view]') ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
});
document.addEventListener('pointerup', (e) => {
  const a = active, s = start;
  start = null;
  if (!a || !s || (e.target as Element).closest('a,button')) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) go(a.i + (dx < 0 ? 1 : -1), true);
  else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - s.t < 350) {
    const r = a.view.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.33) go(a.i - 1, true); else if (x > 0.67) go(a.i + 1, true);
  }
});
// Si el foco o la selección desplazan la vista (overflow oculto), se devuelve a su sitio: la paginación manda.
document.addEventListener('scroll', (e) => {
  const v = e.target as HTMLElement | null;
  if (v && v.matches?.('[data-view]')) { v.scrollLeft = 0; v.scrollTop = 0; }
}, true);
