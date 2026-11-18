// Vista previa del EPUB como lector de libro: en escritorio un libro abierto (dos páginas), en móvil una página a
// pantalla completa. El texto se pagina con columnas CSS; se pasa de página con botones, teclas, tap o deslizando.
// Todo el texto se inserta con textContent (nunca HTML).
import { geometry, clamp, keepPosition, pageLabel, type Geometry } from '../lib/reader-math';

type Block = { t: 'h' | 'p'; x: string };
type Data = { blocks: Block[]; words: number };
type Active = {
  dlg: HTMLDialogElement; view: HTMLElement; pages: HTMLElement; book: HTMLElement;
  bar: HTMLElement; label: HTMLElement; fl: HTMLElement; fr: HTMLElement;
  prev: HTMLButtonElement; next: HTMLButtonElement; ro: ResizeObserver;
  i: number; g: Geometry;
};

const SIZES = [15, 17, 19, 21];
const cache = new Map<string, Data>();
const wide = matchMedia('(min-width: 980px) and (min-height: 520px)'); // mismo criterio que el CSS
let active: Active | null = null;
let fs = 1; // índice en SIZES
try { const v = Number(localStorage.getItem('ucronia-lector-letra')); if (v >= 0 && v < SIZES.length && Number.isInteger(v)) fs = v; } catch { /* sin almacenamiento */ }

const el = (tag: string, text = '', cls = '') => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

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

const q = <T extends HTMLElement>(dlg: HTMLElement, sel: string) => dlg.querySelector<T>(sel)!;

/** Mensaje mientras carga o si falla; sin paginación. */
function idle(dlg: HTMLDialogElement, msg: string) {
  q(dlg, '[data-pages]').replaceChildren(el('p', msg, 'pv-msg'));
  q(dlg, '[data-label]').textContent = '';
  q(dlg, '[data-folio-l]').textContent = q(dlg, '[data-folio-r]').textContent = '';
  q(dlg, '[data-bar]').style.width = '0';
  for (const b of dlg.querySelectorAll<HTMLButtonElement>('[data-prev],[data-next]')) b.disabled = true;
}

function go(i: number, animate: boolean) {
  const a = active;
  if (!a) return;
  a.i = clamp(i, a.g.spreads);
  a.pages.classList.toggle('no-anim', !animate);
  a.pages.style.transform = `translate3d(${-a.i * a.g.step}px,0,0)`;
  const p = pageLabel(a.i, a.g);
  a.label.textContent = p.text;
  a.fl.textContent = String(p.first);
  a.fr.textContent = p.last > p.first ? String(p.last) : '';
  a.bar.style.width = `${((a.i + 1) / a.g.spreads) * 100}%`;
  a.prev.disabled = a.i === 0;
  a.next.disabled = a.i >= a.g.spreads - 1;
}

/** Recalcula páginas: tamaño de la vista, columnas y posición (se conserva la lectura al cambiar letra o ventana). */
function layout(keep: boolean) {
  const a = active;
  if (!a) return;
  const W = a.view.clientWidth, H = a.view.clientHeight;
  if (W < 80 || H < 80) return;
  const n: 1 | 2 = wide.matches ? 2 : 1;
  const gap = n === 2 ? 80 : 40;
  a.dlg.style.setProperty('--fs', `${SIZES[fs]}px`);
  a.dlg.style.setProperty('--ph', `${H}px`);
  Object.assign(a.pages.style, { width: `${W}px`, height: `${H}px`, columnCount: String(n), columnGap: `${gap}px` });
  const old = a.g.spreads, oldI = a.i;
  a.g = geometry(W, a.pages.scrollWidth, n); // lee scrollWidth: fuerza el reparto en columnas
  a.book.classList.toggle('two', n === 2);
  go(keep ? keepPosition(oldI, old, a.g.spreads) : 0, false);
  q(a.dlg, '[data-fs="-1"]').toggleAttribute('disabled', fs === 0);
  q(a.dlg, '[data-fs="1"]').toggleAttribute('disabled', fs === SIZES.length - 1);
}

function mount(dlg: HTMLDialogElement, d: Data) {
  const title = dlg.dataset.title ?? '', author = dlg.dataset.author ?? '', dl = dlg.dataset.dl ?? '#';
  const cover = el('div', '', 'pv-page pv-title');
  cover.append(el('small', 'Vista previa'), el('h2', title), el('p', author, 'pv-by'), el('em', 'Solo el comienzo del libro'));
  const end = el('div', '', 'pv-page pv-end');
  const dlLink = el('a', 'Descargar EPUB ↓', 'more-button') as HTMLAnchorElement;
  dlLink.href = dl; dlLink.rel = 'nofollow'; dlLink.tabIndex = -1; dlLink.setAttribute('data-astro-reload', '');
  end.append(el('small', 'Fin de la vista previa'), el('h3', 'Sigue leyendo'), el('p', 'Descarga el EPUB completo, gratis y sin registro.'), dlLink);

  const pages = q(dlg, '[data-pages]');
  pages.replaceChildren(cover, ...d.blocks.map((b) => el(b.t === 'h' ? 'h3' : 'p', b.x)), end);
  const a: Active = {
    dlg, pages, view: q(dlg, '[data-view]'), book: q(dlg, '.book'), bar: q(dlg, '[data-bar]'), label: q(dlg, '[data-label]'),
    fl: q(dlg, '[data-folio-l]'), fr: q(dlg, '[data-folio-r]'), prev: q<HTMLButtonElement>(dlg, '[data-prev]'), next: q<HTMLButtonElement>(dlg, '[data-next]'),
    ro: new ResizeObserver(() => layout(true)), i: 0, g: { n: 1, gap: 40, step: 0, cols: 1, spreads: 1 },
  };
  active = a;
  a.ro.observe(a.view); // también avisa al empezar: primer reparto
  requestAnimationFrame(() => active === a && layout(false));
  document.fonts?.ready.then(() => active === a && layout(true));
  a.view.focus({ preventScroll: true });
}

function unmount() {
  const a = active;
  if (!a) return;
  a.ro.disconnect();
  a.pages.replaceChildren();
  a.pages.style.transform = '';
  active = null;
}

// ---- Eventos: un solo juego de oyentes en el documento (sirve también tras navegar con ClientRouter) ----
document.addEventListener('click', async (e) => {
  const t = e.target as Element | null;
  const dlg = document.getElementById('preview-dialog') as HTMLDialogElement | null;
  if (!t || !dlg) return;
  if (t === dlg || t.closest('[data-preview-close]')) { dlg.close(); return; } // fondo o ✕
  if (active && dlg.open) {
    if (t.closest('[data-prev]')) { go(active.i - 1, true); return; }
    if (t.closest('[data-next]')) { go(active.i + 1, true); return; }
    const f = t.closest<HTMLElement>('[data-fs]');
    if (f) {
      fs = Math.max(0, Math.min(SIZES.length - 1, fs + Number(f.dataset.fs)));
      try { localStorage.setItem('ucronia-lector-letra', String(fs)); } catch { /* sin almacenamiento */ }
      layout(true);
      return;
    }
  }
  const btn = t.closest<HTMLElement>('[data-preview]');
  if (!btn?.dataset.url) return;
  idle(dlg, 'Cargando vista previa…');
  if (!dlg.open) dlg.showModal();
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
