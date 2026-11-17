// Lógica pura de la vista previa de un EPUB (sin dependencias: se prueba con tsx). Solo texto: nunca imágenes ni scripts.
export type Block = { t: 'h' | 'p'; x: string };
export type SpineItem = { id: string; paths: string[]; type: string; props: string; linear: boolean };
export type Fill = { out: Block[]; used: number };

/** Tope del fragmento: ~800 palabras como máximo y siempre una parte pequeña del libro (≤25 % del marcado). */
export const PREVIEW_MAX_CHARS = 5000;
export const PREVIEW_MIN_CHARS = 1200;

export function previewBudget(spineBytes: number): number {
  const max = Math.min(PREVIEW_MAX_CHARS, Math.max(PREVIEW_MIN_CHARS, Math.round(spineBytes * 0.04)), Math.floor(spineBytes * 0.25));
  return max >= 300 ? max : 0; // libros diminutos: sin vista previa (se mostraría casi todo)
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? '') : '';
};

export const parseContainer = (xml: string): string | null =>
  /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(xml)?.[1] ?? null;

/** Ruta de `href` relativa al directorio del OPF, normalizada (sin ./ ni ../ ni #fragmento). */
export function resolvePath(dir: string, href: string, decode: boolean): string {
  let h = href.replace(/[#?].*$/, '');
  if (decode) { try { h = decodeURIComponent(h); } catch { /* se deja tal cual */ } }
  const out: string[] = [];
  for (const s of (h.startsWith('/') ? h.slice(1) : dir + h).split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  return out.join('/');
}

/** Spine del OPF, en orden de lectura. `paths` = posibles nombres dentro del ZIP (decodificado y tal cual). */
export function parseOpf(xml: string, opfPath: string): SpineItem[] {
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const m of xml.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const id = attr(m[0], 'id'), href = attr(m[0], 'href');
    if (id && href) manifest.set(id, { href, type: attr(m[0], 'media-type'), props: attr(m[0], 'properties') });
  }
  const spine: SpineItem[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)) {
    const id = attr(m[0], 'idref'), it = manifest.get(id);
    if (!it) continue;
    const paths = [...new Set([resolvePath(dir, it.href, true), resolvePath(dir, it.href, false)])];
    spine.push({ id, paths, type: it.type, props: it.props, linear: attr(m[0], 'linear').toLowerCase() !== 'no' });
  }
  return spine;
}

export const isHtml = (it: SpineItem) => /x?html/i.test(it.type) || /\.x?html?$/i.test(it.paths[0] ?? '');

/** Portada, portadilla, índice, créditos…: no sirven de vista previa. */
const FRONT = /(^|[\/_.\- ])(cover|portada|portadilla|titlepage|title[-_ ]?page|toc|contents|indice|índice|nav|copyright|derechos|colophon|colofon|colofón|cip)([\/_.\- ]|\d|$)/i;
export const isFrontMatter = (it: SpineItem) => /\bnav\b/.test(it.props) || FRONT.test(`${it.id} ${it.paths[0] ?? ''}`);

// ---- XHTML → bloques de texto ----
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿', middot: '·', copy: '©',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', agrave: 'à', egrave: 'è', ccedil: 'ç',
};
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return NAMED[e] ?? all;
  });
}

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'br', 'hr', 'ul', 'ol', 'table', 'pre', 'figure', 'figcaption', 'dt', 'dd', 'aside']);

/** Extrae párrafos y títulos. Quita head, script, style, svg, nav y comentarios; ignora el resto de etiquetas. */
export function htmlToBlocks(html: string): Block[] {
  const s = html.replace(/<[^>]*$/, '') // etiqueta cortada al final
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<(head|script|style|svg|nav)\b[\s\S]*?<\/\1\s*>/gi, '');
  const out: Block[] = [];
  let buf = '', head = false;
  const flush = () => {
    const x = decodeEntities(buf).replace(/\s+/g, ' ').trim();
    buf = '';
    if (x && !/^[\d\s.\-–—ivxlcdm]{1,8}$/i.test(x)) out.push({ t: head ? 'h' : 'p', x }); // sin números de página
  };
  for (const part of s.split(/(<[^>]*>)/)) {
    if (part[0] === '<' && part.endsWith('>')) {
      const m = /^<(\/?)\s*([a-zA-Z][\w:-]*)/.exec(part);
      if (!m) continue;
      const name = m[2].toLowerCase().replace(/^.*:/, '');
      if (!BLOCK.has(name)) continue;
      flush();
      if (/^h[1-6]$/.test(name)) head = m[1] !== '/';
    } else buf += part;
  }
  flush();
  return out;
}

// ---- Fragmento con tope de caracteres ----
/** Recorta `x` a `room` caracteres: en el final de una frase si la hay cerca; si no, en una palabra y con «…». */
export function cutText(x: string, room: number): string {
  if (x.length <= room) return x;
  const head = x.slice(0, room);
  let end = -1;
  for (const m of head.matchAll(/[.!?…]["”»’)]*(?=\s)/g)) end = m.index! + m[0].length;
  if (end > room * 0.4) return head.slice(0, end);
  const cut = x.slice(0, Math.max(0, room - 1)); // deja sitio para «…»
  const sp = cut.lastIndexOf(' ');
  return `${(sp > room * 0.4 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, '')}…`;
}

/** Añade bloques hasta llegar al tope. Devuelve true cuando ya no cabe más. */
export function fill(st: Fill, blocks: Block[], max: number): boolean {
  for (const b of blocks) {
    const room = max - st.used;
    if (b.t === 'h') {
      if (b.x.length + 80 > room) return true; // un título no va solo al final
      st.out.push(b); st.used += b.x.length;
      continue;
    }
    if (room < 60) return true;
    const x = cutText(b.x, room);
    st.out.push({ t: 'p', x }); st.used += x.length;
    if (x.length < b.x.length) return true;
  }
  return false;
}

/** Quita títulos sueltos al final. */
export function finalize(out: Block[]): Block[] {
  const r = out.slice();
  while (r.length && r[r.length - 1].t === 'h') r.pop();
  return r;
}

export const countWords = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.x.match(/\S+/g)?.length ?? 0), 0);
