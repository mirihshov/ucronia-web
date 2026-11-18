// Lógica pura de la vista previa de un EPUB (sin dependencias: se prueba con tsx).
// Conserva lo que importa del libro: títulos, cursiva, negrita, versalitas, alineación, citas, listas, saltos y imágenes.
// Nunca scripts ni HTML: el resultado es una estructura de datos que el navegador pinta con textContent.

export const F_I = 1, F_B = 2, F_SC = 4, F_SUP = 8, F_SUB = 16; // marcas de formato de un fragmento de texto
export type Run = { x: string; f?: number }; // x === '\n' es un salto de línea
export type Align = 'c' | 'r' | 'j' | 'l';
export type Block = {
  t: 'p' | 'h' | 'li' | 'hr' | 'img';
  r?: Run[];      // texto con formato
  n?: number;     // nivel de título 1–6
  a?: Align;      // alineación
  q?: 1;          // dentro de una cita
  i?: 0 | 1;      // sangría de primera línea (1 = con sangría)
  g?: 1;          // párrafos pegados (sin espacio vertical)
  m?: string;     // viñeta o número de lista
  s?: string;     // img: ruta dentro del ZIP (al final pasa a data URI)
  alt?: string;
  c?: 1;          // portada
  pb?: 1;         // empieza en página nueva
};
export type SpineItem = { id: string; paths: string[]; type: string; props: string; linear: boolean };
export type Fill = { out: Block[]; used: number };
export type Style = { a?: Align; it?: boolean; bd?: boolean; sc?: boolean; ind?: 0 | 1; tight?: boolean };

/** Tope del fragmento: ~1.000 palabras como máximo y siempre una parte pequeña del libro (≤25 % del marcado). */
export const PREVIEW_MAX_CHARS = 6500;
export const PREVIEW_MIN_CHARS = 1500;
export const IMG_COST = 400, HR_COST = 20; // lo que «cuesta» una imagen o un separador en el tope

export function previewBudget(spineBytes: number): number {
  const max = Math.min(PREVIEW_MAX_CHARS, Math.max(PREVIEW_MIN_CHARS, Math.round(spineBytes * 0.04)), Math.floor(spineBytes * 0.25));
  return max >= 300 ? max : 0; // libros diminutos: sin vista previa (se mostraría casi todo)
}

// ---- Atributos y rutas ----
const ATTR = new Map<string, RegExp>();
const attr = (tag: string, name: string) => {
  let re = ATTR.get(name);
  if (!re) { re = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'); ATTR.set(name, re); }
  const m = re.exec(tag);
  return m ? (m[1] ?? m[2] ?? '') : '';
};

export const parseContainer = (xml: string): string | null =>
  /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(xml)?.[1] ?? null;

/** Ruta de `href` relativa al directorio `dir`, normalizada (sin ./ ni ../ ni #fragmento). */
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

const opfDir = (opfPath: string) => (opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '');
const variants = (dir: string, href: string) => [...new Set([resolvePath(dir, href, true), resolvePath(dir, href, false)])];

/** Spine del OPF, en orden de lectura. `paths` = posibles nombres dentro del ZIP (decodificado y tal cual). */
export function parseOpf(xml: string, opfPath: string): SpineItem[] {
  const dir = opfDir(opfPath);
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const m of xml.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const id = attr(m[0], 'id'), href = attr(m[0], 'href');
    if (id && href) manifest.set(id, { href, type: attr(m[0], 'media-type'), props: attr(m[0], 'properties') });
  }
  const spine: SpineItem[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)) {
    const id = attr(m[0], 'idref'), it = manifest.get(id);
    if (!it) continue;
    spine.push({ id, paths: variants(dir, it.href), type: it.type, props: it.props, linear: attr(m[0], 'linear').toLowerCase() !== 'no' });
  }
  return spine;
}

/** Hojas de estilo del manifiesto (posibles nombres dentro del ZIP). */
export function parseCssPaths(xml: string, opfPath: string): string[] {
  const dir = opfDir(opfPath), out: string[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (href && (/text\/css/i.test(attr(m[0], 'media-type')) || /\.css$/i.test(href))) out.push(...variants(dir, href));
  }
  return out;
}

export const isHtml = (it: SpineItem) => /x?html/i.test(it.type) || /\.x?html?$/i.test(it.paths[0] ?? '');

/** Índice de contenidos / navegación: son listas de enlaces, no sirven de vista previa. */
const NAVLIKE = /(^|[\/_.\- ])(toc|nav|contents|indice|índice)([\/_.\- ]|\d|$)/i;
export const isNavLike = (it: SpineItem) => /\bnav\b/.test(it.props) || NAVLIKE.test(`${it.id} ${it.paths[0] ?? ''}`);

// ---- Estilos del propio libro (solo lo que se puede respetar con seguridad) ----
const isZero = (v: string) => /^[+-]?(?:0+|0*\.0+)(?:px|em|rem|pt|%|ex|ch|cm|mm|in)?$/i.test(v.trim());

export function declStyle(decl: string): Style {
  const s: Style = {};
  for (const d of decl.split(';')) {
    const k = d.indexOf(':');
    if (k < 0) continue;
    const p = d.slice(0, k).trim().toLowerCase(), v = d.slice(k + 1).replace(/!important/i, '').trim().toLowerCase();
    if (p === 'text-align') {
      const a: Align | undefined = v === 'center' ? 'c' : v === 'right' || v === 'end' ? 'r' : v === 'justify' ? 'j' : v === 'left' || v === 'start' ? 'l' : undefined;
      if (a) s.a = a;
    } else if (p === 'font-style') {
      if (/italic|oblique/.test(v)) s.it = true; else if (v === 'normal') s.it = false;
    } else if (p === 'font-weight') {
      if (/^(bold|bolder|[6-9]00)$/.test(v)) s.bd = true; else if (/^(normal|lighter|[1-5]00)$/.test(v)) s.bd = false;
    } else if (p === 'font-variant' || p === 'font-variant-caps') {
      if (/small-caps/.test(v)) s.sc = true; else if (v === 'normal') s.sc = false;
    } else if (p === 'text-indent') {
      const t = v.split(/\s+/)[0];
      if (isZero(t)) s.ind = 0; else if (/^\+?(\d|\.\d)/.test(t)) s.ind = 1; // sangría francesa (negativa): se ignora
    } else if (p === 'margin') {
      const t = v.split(/\s+/);
      s.tight = isZero(t[2] ?? t[0]); // el margen inferior decide si hay separación entre párrafos
    } else if (p === 'margin-bottom') {
      s.tight = isZero(v);
    }
  }
  return s;
}

const merge = (a: Style, b?: Style): Style => (b ? { ...a, ...b } : a);

/** Reglas simples (`p`, `.clase`, `p.clase`) de una hoja de estilos. Lo demás se ignora. */
export function parseCss(css: string, into: Map<string, Style> = new Map()): Map<string, Style> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const st = declStyle(m[2]);
    if (!Object.keys(st).length) continue;
    for (const raw of m[1].split(',')) {
      const sm = /^([a-z][a-z0-9]*)?(?:\.([\w-]+))?$/i.exec(raw.trim());
      if (!sm || (!sm[1] && !sm[2])) continue;
      const key = (sm[1] ? sm[1].toLowerCase() : '') + (sm[2] ? `.${sm[2]}` : '');
      into.set(key, merge(into.get(key) ?? {}, st));
    }
  }
  return into;
}

// ---- XHTML → bloques ----
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

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'ul', 'ol', 'table', 'pre', 'figure', 'figcaption', 'dt', 'dd', 'aside', 'header', 'footer', 'main']);
const VOID = new Set(['meta', 'link', 'input', 'col', 'wbr', 'area', 'base', 'source', 'embed', 'param', 'track']);
const DEFAULT: Record<string, Style> = { i: { it: true }, em: { it: true }, cite: { it: true }, dfn: { it: true }, var: { it: true }, b: { bd: true }, strong: { bd: true }, center: { a: 'c' } };

type Frame = { name: string; set: number; clear: number; a?: Align; ind?: 0 | 1; tight?: boolean; m?: string; n?: number };
type Snap = { t: Block['t']; n?: number; a?: Align; q?: 1; i?: 0 | 1; g?: 1; m?: string };
export type ParseCtx = { css?: Map<string, Style>; dir?: string }; // dir: carpeta del capítulo dentro del ZIP (para las imágenes)

/** Extrae bloques con formato. Quita head, script, style, nav y comentarios; las imágenes (incluidas las de svg) pasan a bloques `img`. */
export function htmlToBlocks(html: string, ctx: ParseCtx = {}): Block[] {
  const rules = ctx.css ?? new Map<string, Style>();
  const src = html.replace(/<[^>]*$/, '') // etiqueta cortada al final
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, (m) => { const im = /<image\b[^>]*?href\s*=\s*["']([^"']+)["']/i.exec(m); return im ? `<img src="${im[1]}" alt=""/>` : ''; })
    .replace(/<(head|script|style|nav)\b[\s\S]*?<\/\1\s*>/gi, '');

  const out: Block[] = [];
  const stack: Frame[] = [];
  let runs: Run[] = [], snap: Snap | null = null;

  const eff = () => { let f = 0; for (const fr of stack) f = (f | fr.set) & ~fr.clear; return f; };

  const takeSnap = (): Snap => {
    let leaf = 'p';
    for (let k = stack.length - 1; k >= 0; k--) if (BLOCK.has(stack[k].name)) { leaf = stack[k].name; break; }
    const h = /^h([1-6])$/.exec(leaf);
    const sn: Snap = { t: h ? 'h' : leaf === 'li' ? 'li' : 'p' };
    if (h) sn.n = Number(h[1]);
    let aSet = false, iSet = false, gSet = false;
    for (let k = stack.length - 1; k >= 0; k--) { // el valor más cercano manda (como la herencia de CSS)
      const fr = stack[k];
      if (!aSet && fr.a) { sn.a = fr.a; aSet = true; }
      if (!iSet && fr.ind !== undefined) { sn.i = fr.ind; iSet = true; }
      if (!gSet && fr.tight !== undefined) { if (fr.tight) sn.g = 1; gSet = true; }
      if (fr.name === 'blockquote') sn.q = 1;
      if (sn.t === 'li' && fr.name === 'li' && fr.m && sn.m === undefined) sn.m = fr.m;
    }
    return sn;
  };

  const addText = (raw: string) => {
    let x = decodeEntities(raw).replace(/\s+/g, ' ');
    if (!x) return;
    const last = runs[runs.length - 1];
    if (!last || last.x.endsWith(' ') || last.x === '\n') x = x.replace(/^ /, ''); // sin espacios dobles ni al inicio
    if (!x) return;
    if (!snap) snap = takeSnap();
    let f = eff();
    if (snap.t === 'h') f &= ~F_B; // los títulos ya van en su tipografía
    if (last && (last.f ?? 0) === f && last.x !== '\n') last.x += x; else runs.push(f ? { x, f } : { x });
  };

  const flush = () => {
    if (snap) {
      while (runs.length && runs[runs.length - 1].x === '\n') runs.pop();
      const last = runs[runs.length - 1];
      if (last) { last.x = last.x.replace(/ $/, ''); if (!last.x) runs.pop(); }
      if (runs.length) {
        const b: Block = { t: snap.t, r: runs };
        if (snap.n) b.n = snap.n;
        if (snap.a) b.a = snap.a;
        if (snap.q) b.q = 1;
        if (snap.i !== undefined) b.i = snap.i;
        if (snap.g) b.g = 1;
        if (snap.m) b.m = snap.m;
        out.push(b);
      }
    }
    runs = []; snap = null;
  };

  const frameFor = (name: string, part: string): Frame => {
    let st: Style = merge(DEFAULT[name] ?? {}, rules.get(name));
    const cl = attr(part, 'class'), inl = attr(part, 'style');
    if (cl) for (const c of cl.split(/\s+/)) if (c) { st = merge(st, rules.get(`.${c}`)); st = merge(st, rules.get(`${name}.${c}`)); }
    if (inl) st = merge(st, declStyle(inl));
    let set = 0, clear = 0;
    if (st.it === true) set |= F_I; else if (st.it === false) clear |= F_I;
    if (st.bd === true) set |= F_B; else if (st.bd === false) clear |= F_B;
    if (st.sc === true) set |= F_SC; else if (st.sc === false) clear |= F_SC;
    if (name === 'sup') set |= F_SUP;
    if (name === 'sub') set |= F_SUB;
    return { name, set, clear, a: st.a, ind: st.ind, tight: st.tight };
  };

  for (const part of src.split(/(<[^>]*>)/)) {
    if (part[0] !== '<' || !part.endsWith('>')) { addText(part); continue; } // texto (o un «<» suelto)
    const m = /^<(\/?)\s*([a-zA-Z][\w:-]*)/.exec(part);
    if (!m) continue; // <!DOCTYPE>, <?xml ?>
    const name = m[2].toLowerCase().replace(/^[^:]*:/, '');

    if (m[1]) { // cierre
      if (BLOCK.has(name)) flush();
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      if (name === 'td' || name === 'th') addText(' ');
      continue;
    }
    if (name === 'br') { if (runs.length) runs.push({ x: '\n' }); continue; }
    if (name === 'hr') { flush(); out.push({ t: 'hr' }); continue; }
    if (name === 'img') {
      flush();
      const s = attr(part, 'src');
      if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) { // solo imágenes del propio libro (nada de http: ni data:)
        const b: Block = { t: 'img', s: resolvePath(ctx.dir ?? '', s, true) };
        const alt = decodeEntities(attr(part, 'alt')).trim();
        if (alt) b.alt = alt.slice(0, 200);
        out.push(b);
      }
      continue;
    }
    const selfClose = part.endsWith('/>');
    if (BLOCK.has(name)) flush();
    if (VOID.has(name) || selfClose) continue;
    const fr = frameFor(name, part);
    if (name === 'li') {
      let list: Frame | undefined;
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === 'ul' || stack[k].name === 'ol') { list = stack[k]; break; }
      if (list?.name === 'ol') { list.n = (list.n ?? 0) + 1; fr.m = `${list.n}.`; } else fr.m = '•';
    }
    stack.push(fr);
  }
  flush();
  return out;
}

// ---- Fragmento con tope de caracteres ----
/** Cuánto se conserva de `x` dentro de `room` caracteres: hasta el final de una frase si la hay cerca; si no, hasta una palabra y con «…». */
export function cutLen(x: string, room: number): { end: number; ell: boolean } {
  if (x.length <= room) return { end: x.length, ell: false };
  const head = x.slice(0, room);
  let end = -1;
  for (const m of head.matchAll(/[.!?…]["”»’)]*(?=\s)/g)) end = m.index! + m[0].length;
  if (end > room * 0.4) return { end, ell: false };
  const cut = x.slice(0, Math.max(0, room - 1)); // deja sitio para «…»
  const sp = cut.lastIndexOf(' ');
  const keep = sp > room * 0.4 ? cut.slice(0, sp) : cut;
  return { end: keep.replace(/[\s,;:]+$/, '').length, ell: true };
}

export function cutText(x: string, room: number): string {
  const { end, ell } = cutLen(x, room);
  return x.slice(0, end) + (ell ? '…' : '');
}

/** Lo mismo que cutText pero sobre fragmentos con formato (la cursiva y la negrita se mantienen). */
export function cutRuns(runs: Run[], room: number): Run[] {
  const text = runs.map((r) => r.x).join('');
  const { end, ell } = cutLen(text, room);
  if (end >= text.length && !ell) return runs;
  const out: Run[] = [];
  let left = end;
  for (const r of runs) {
    if (left <= 0) break;
    const x = r.x.length <= left ? r.x : r.x.slice(0, left);
    out.push({ ...r, x });
    left -= x.length;
  }
  const last = out[out.length - 1];
  if (ell && last) out.push(last.f ? { x: '…', f: last.f } : { x: '…' });
  return out;
}

export const textLen = (b: Block) => (b.r ? b.r.reduce((n, r) => n + r.x.length, 0) : 0);

/** Añade bloques hasta llegar al tope. Devuelve true cuando ya no cabe más. */
export function fill(st: Fill, blocks: Block[], max: number): boolean {
  for (const b of blocks) {
    const room = max - st.used;
    if (b.t === 'img') { if (room < IMG_COST) return true; st.out.push(b); st.used += IMG_COST; continue; }
    if (b.t === 'hr') { if (room < 80) return true; st.out.push(b); st.used += HR_COST; continue; }
    const len = textLen(b);
    if (b.t === 'h') { // un título no va solo al final
      if (len + 80 > room) return true;
      st.out.push(b); st.used += len;
      continue;
    }
    if (room < 60) return true;
    if (len <= room) { st.out.push(b); st.used += len; continue; }
    const cut: Block = { ...b, r: cutRuns(b.r ?? [], room) };
    st.out.push(cut); st.used += textLen(cut);
    return true;
  }
  return false;
}

/** Quita títulos y separadores sueltos al final. */
export function finalize(out: Block[]): Block[] {
  const r = out.slice();
  while (r.length && (r[r.length - 1].t === 'h' || r[r.length - 1].t === 'hr')) r.pop();
  return r;
}

export const countWords = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.r ? b.r.reduce((m, r) => m + (r.x.match(/\S+/g)?.length ?? 0), 0) : 0), 0);
