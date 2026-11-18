import { unzipSync, strFromU8 } from 'fflate';
import { parseContainer, parseOpf, parseCssPaths, parseCss, isHtml, isNavLike, htmlToBlocks, fill, finalize, previewBudget, countWords, type Block, type SpineItem, type Fill, type Style } from './epub-preview-parse';

export type Preview = { blocks: Block[]; words: number };
const MAX_META = 2 * 1024 * 1024; // tope por archivo de metadatos (anti zip-bomb)
const MAX_DOC = 2 * 1024 * 1024;  // tope por capítulo que se descomprime
const MAX_CSS = 300 * 1024;
const MAX_COVER = 700 * 1024, MAX_IMG = 300 * 1024, MAX_IMGS_TOTAL = 1024 * 1024, MAX_IMAGES = 4;
const CHUNK = 3, MAX_CHUNKS = 4;  // como mucho 12 capítulos, de 3 en 3, y se para al llenar el tope
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function b64(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; i += 0x4000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x4000)));
  return btoa(s);
}

/** Fragmento inicial de un EPUB con su formato (portada, títulos, cursivas…), o null si no se puede o el libro es demasiado corto.
 *  Solo se descomprimen container.xml, el OPF, las hojas de estilo, los primeros capítulos necesarios y unas pocas imágenes. */
export function buildPreview(data: Uint8Array): Preview | null {
  try {
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return null;
    const sizes = new Map<string, number>();
    const c = unzipSync(data, { filter: (f) => { sizes.set(f.name, f.originalSize); return f.name === 'META-INF/container.xml' && f.originalSize <= MAX_META; } })['META-INF/container.xml'];
    const opfPath = c ? parseContainer(strFromU8(c)) : null;
    if (!opfPath) return null;
    const o = unzipSync(data, { filter: (f) => f.name === opfPath && f.originalSize <= MAX_META })[opfPath];
    if (!o) return null;
    const opfXml = strFromU8(o);

    const items = parseOpf(opfXml, opfPath)
      .filter((it) => it.linear && isHtml(it))
      .map((it) => ({ it, name: it.paths.find((p) => sizes.has(p)) }))
      .filter((x): x is { it: SpineItem; name: string } => !!x.name && sizes.get(x.name)! <= MAX_DOC);
    const max = previewBudget(items.reduce((n, x) => n + (sizes.get(x.name) ?? 0), 0));
    if (!max) return null;

    // Estilos del propio libro: alineación, cursivas, sangrías…
    const rules = new Map<string, Style>();
    const cssNames = new Set([...new Set(parseCssPaths(opfXml, opfPath))].filter((p) => sizes.has(p) && sizes.get(p)! <= MAX_CSS).slice(0, 4));
    if (cssNames.size) for (const raw of Object.values(unzipSync(data, { filter: (f) => cssNames.has(f.name) }))) parseCss(strFromU8(raw), rules);

    const cands = items.filter((x) => !isNavLike(x.it)); // se muestra el libro tal cual empieza: portada, portadilla…
    const st: Fill = { out: [], used: 0 };
    let done = false, docs = 0;
    for (let i = 0; i < cands.length && i < CHUNK * MAX_CHUNKS && !done; i += CHUNK) {
      const chunk = cands.slice(i, i + CHUNK), names = new Set(chunk.map((x) => x.name));
      const files = unzipSync(data, { filter: (f) => names.has(f.name) });
      for (const x of chunk) {
        const raw = files[x.name];
        if (!raw) continue;
        const dir = x.name.includes('/') ? x.name.slice(0, x.name.lastIndexOf('/') + 1) : '';
        const blocks = htmlToBlocks(strFromU8(raw).slice(0, max * 40), { css: rules, dir }); // no se analiza más de lo necesario
        if (!blocks.length) continue;
        const first = blocks[0];
        if (st.out.length && (docs < 4 || first.t === 'img' || (first.t === 'h' && (first.n ?? 6) <= 2))) first.pb = 1; // cada capítulo en página nueva
        docs++;
        if (fill(st, blocks, max)) { done = true; break; }
      }
    }

    let blocks = finalize(st.out);
    // Imágenes: solo las que quedaron en el fragmento, pequeñas y de tipos seguros (nada de svg), como data URI.
    const wanted: { b: Block; name: string; mime: string; size: number }[] = [];
    let total = 0;
    for (const b of blocks) {
      if (b.t !== 'img' || !b.s) continue;
      const name = [b.s, encodeURI(b.s)].find((p) => sizes.has(p));
      const mime = MIME[(b.s.split('.').pop() ?? '').toLowerCase()];
      const size = name ? sizes.get(name)! : 0;
      if (!name || !mime || wanted.length >= MAX_IMAGES || size > (wanted.length ? MAX_IMG : MAX_COVER) || total + size > MAX_IMGS_TOTAL) continue;
      total += size;
      wanted.push({ b, name, mime, size });
    }
    const ok = new Set<Block>();
    if (wanted.length) {
      const names = new Set(wanted.map((w) => w.name));
      const files = unzipSync(data, { filter: (f) => names.has(f.name) });
      for (const w of wanted) {
        const bytes = files[w.name];
        if (!bytes) continue;
        w.b.s = `data:${w.mime};base64,${b64(bytes)}`;
        ok.add(w.b);
      }
    }
    blocks = blocks.filter((b) => b.t !== 'img' || ok.has(b));
    if (blocks[0]?.t === 'img') blocks[0].c = 1;
    return blocks.some((b) => b.r?.length) ? { blocks, words: countWords(blocks) } : null;
  } catch {
    return null;
  }
}
