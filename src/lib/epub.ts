import { unzipSync, strFromU8 } from 'fflate';

export type EpubResult = { ok: true; opfPath: string } | { ok: false; error: string };
const MAX_META = 2 * 1024 * 1024; // tope por archivo de metadatos (anti zip-bomb)

/** Validación estructural real: ZIP + mimetype + container.xml + OPF existente. */
export function validateEpub(data: Uint8Array): EpubResult {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b)
    return { ok: false, error: 'El archivo no es un EPUB válido (no es un ZIP).' };
  try {
    const meta = unzipSync(data, {
      filter: (f) => (f.name === 'mimetype' || f.name === 'META-INF/container.xml') && f.originalSize <= MAX_META,
    });
    const mt = meta['mimetype'];
    if (!mt || strFromU8(mt).trim() !== 'application/epub+zip')
      return { ok: false, error: 'EPUB inválido: falta el tipo «application/epub+zip».' };
    const c = meta['META-INF/container.xml'];
    if (!c) return { ok: false, error: 'EPUB inválido: falta META-INF/container.xml.' };
    const m = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(strFromU8(c));
    if (!m) return { ok: false, error: 'EPUB inválido: container.xml no declara el documento raíz.' };
    const opfPath = m[1];
    const opf = unzipSync(data, { filter: (f) => f.name === opfPath && f.originalSize <= MAX_META })[opfPath];
    if (!opf || !/<(\w+:)?package\b/.test(strFromU8(opf)))
      return { ok: false, error: 'EPUB inválido: el documento raíz (OPF) falta o está dañado.' };
    return { ok: true, opfPath };
  } catch {
    return { ok: false, error: 'El archivo está dañado o no es un EPUB.' };
  }
}
