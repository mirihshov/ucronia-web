import { unzipSync, strFromU8 } from 'fflate';
import { parseContainer, parseOpf, isHtml, isFrontMatter, htmlToBlocks, fill, finalize, previewBudget, countWords, type Block, type SpineItem, type Fill } from './epub-preview-parse';

export type Preview = { blocks: Block[]; words: number };
const MAX_META = 2 * 1024 * 1024; // tope por archivo de metadatos (anti zip-bomb)
const MAX_DOC = 2 * 1024 * 1024;  // tope por capítulo que se descomprime
const CHUNK = 3, MAX_CHUNKS = 4;  // como mucho 12 capítulos, de 3 en 3, y se para al llenar el tope

/** Fragmento inicial (solo texto) de un EPUB, o null si no se puede o el libro es demasiado corto.
 *  Solo se descomprimen container.xml, el OPF y los primeros capítulos necesarios; el resto del ZIP no se toca. */
export function buildPreview(data: Uint8Array): Preview | null {
  try {
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return null;
    const sizes = new Map<string, number>();
    const c = unzipSync(data, { filter: (f) => { sizes.set(f.name, f.originalSize); return f.name === 'META-INF/container.xml' && f.originalSize <= MAX_META; } })['META-INF/container.xml'];
    const opfPath = c ? parseContainer(strFromU8(c)) : null;
    if (!opfPath) return null;
    const o = unzipSync(data, { filter: (f) => f.name === opfPath && f.originalSize <= MAX_META })[opfPath];
    if (!o) return null;

    const items = parseOpf(strFromU8(o), opfPath)
      .filter((it) => it.linear && isHtml(it))
      .map((it) => ({ it, name: it.paths.find((p) => sizes.has(p)) }))
      .filter((x): x is { it: SpineItem; name: string } => !!x.name && sizes.get(x.name)! <= MAX_DOC);
    const max = previewBudget(items.reduce((n, x) => n + (sizes.get(x.name) ?? 0), 0));
    if (!max) return null;

    const cands = items.filter((x) => !isFrontMatter(x.it));
    const st: Fill = { out: [], used: 0 };
    let done = false;
    for (let i = 0; i < cands.length && i < CHUNK * MAX_CHUNKS && !done; i += CHUNK) {
      const chunk = cands.slice(i, i + CHUNK), names = new Set(chunk.map((x) => x.name));
      const files = unzipSync(data, { filter: (f) => names.has(f.name) });
      for (const x of chunk) {
        const raw = files[x.name];
        if (!raw) continue;
        const blocks = htmlToBlocks(strFromU8(raw).slice(0, max * 24)); // no se analiza más de lo necesario
        if (!st.out.length && blocks.reduce((n, b) => n + b.x.length, 0) < 200) continue; // portadas, dedicatorias
        if (fill(st, blocks, max)) { done = true; break; }
      }
    }
    const blocks = finalize(st.out);
    return blocks.length ? { blocks, words: countWords(blocks) } : null;
  } catch {
    return null;
  }
}
