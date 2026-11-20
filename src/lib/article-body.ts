// Formato sencillo para el cuerpo de los artículos (sin dependencias; se prueba con `npm run test:articles`).
//   Párrafos separados por una línea en blanco · «## Título» y «### Subtítulo» · «> cita» · «- elemento» · «---» separador
//   **negrita** · *cursiva* · _cursiva_ · [texto](https://enlace) o [texto](/ruta)
// Todo el HTML del autor se escapa: lo único que sale al navegador son las etiquetas que genera este archivo.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const emph = (s: string) => s
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');

// Solo http(s) y rutas del propio sitio (nunca «javascript:» ni «//dominio»).
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]*)\)/g;

function inline(raw: string): string {
  const links: string[] = [];
  let s = esc(raw.replace(/\u0000/g, '')).replace(LINK, (_m, t: string, u: string) => {
    const ext = /^https?:/.test(u);
    links.push(`<a href="${u}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${emph(t)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = emph(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}

const HEADING = /^(#{2,3})\s+(\S.*)$/;
const RULE = /^(-{3,}|\*{3,})$/;
const QUOTE = /^>\s?/;
const ITEM = /^[-*]\s+\S/;
const startsBlock = (l: string) => HEADING.test(l) || RULE.test(l.trim()) || QUOTE.test(l) || ITEM.test(l);

export function renderBody(body: string): string {
  const lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = HEADING.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`); i++; continue; }
    if (RULE.test(line.trim())) { out.push('<hr />'); i++; continue; }
    if (QUOTE.test(line)) {
      const q: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) { q.push(lines[i].replace(QUOTE, '')); i++; }
      const paras = q.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${inline(p.replace(/\s*\n\s*/g, ' '))}</p>`);
      out.push(`<blockquote>${paras.join('')}</blockquote>`);
      continue;
    }
    if (ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ITEM.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '').trim()); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }
    const p = [line.trim()]; i++; // la primera línea se consume siempre: evita bucles con marcas incompletas («###»)
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) { p.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** Texto sin marcas de formato (para resúmenes y cuenta de palabras). */
export function plainText(body: string): string {
  return String(body ?? '').replace(/\r\n?/g, '\n')
    .replace(/^#{2,3}\s+/gm, '').replace(/^>\s?/gm, '').replace(/^[-*]\s+(?=\S)/gm, '').replace(/^(-{3,}|\*{3,})\s*$/gm, '')
    .replace(/\[([^\]\n]+)\]\([^)\s]*\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1$2').replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
}

export const readingMinutes = (body: string) => Math.max(1, Math.round(plainText(body).split(' ').filter(Boolean).length / 200));

const cut = (s: string, max: number) => {
  if (s.length <= max) return s;
  const c = s.slice(0, max), k = c.lastIndexOf(' ');
  return `${(k > max * 0.6 ? c.slice(0, k) : c).replace(/[\s,;:.\-–—]+$/, '')}…`;
};

/** Resumen para la vista previa: el escrito a mano o, si falta, el primer párrafo del texto. */
export function excerptOf(a: { excerpt?: string | null; body?: string | null }, max = 230): string {
  const own = a.excerpt?.trim();
  if (own) return cut(own.replace(/\s+/g, ' '), max);
  const first = String(a.body ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).find((p) => p.trim() && !HEADING.test(p.trim()) && !RULE.test(p.trim()));
  return first ? cut(plainText(first), max) : '';
}
