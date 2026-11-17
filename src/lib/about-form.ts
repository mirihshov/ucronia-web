// Validación y formato puros de «Acerca del proyecto» (sin dependencias del servidor: se prueba con tsx).
import { safeUrl, isExternal } from './footer-form';

export { isExternal };
export const MAX_SECTIONS = 12;
export const MAX_PAGE_TITLE = 80;
export const MAX_TITLE = 80;
export const MAX_ID = 40;
export const MAX_BODY = 3000;
const RESERVED_IDS = new Set(['top']); // ids que ya usa la maqueta del sitio

export type AboutSection = { id: string; title: string; body: string };
export type AboutValue = { title: string; sections: AboutSection[] };

const clean = (x: unknown, n: number) => String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

/** «Criterios de publicación» → «criterios-de-publicacion» (ancla para /acerca#…). */
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_ID).replace(/-+$/, '');

/** Texto libre: párrafos separados por una línea en blanco; los saltos simples se conservan. */
export const cleanBody = (x: unknown, n = MAX_BODY) =>
  String(x ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.trim().replace(/[ \t]+/g, ' ')).filter(Boolean).join('\n'))
    .filter(Boolean).join('\n\n').slice(0, n);

/** Asigna un id único y válido a cada sección (el id escrito a mano manda; si no, sale del título). */
function uniqueId(wanted: string, title: string, i: number, used: Set<string>) {
  const base = slugify(wanted) || slugify(title) || `seccion-${i + 1}`;
  let id = RESERVED_IDS.has(base) ? `${base}-2` : base, k = 2;
  while (used.has(id)) id = `${base.slice(0, MAX_ID - 4)}-${k++}`;
  used.add(id);
  return id;
}

/** Lee lo guardado en la base (se revalida siempre). Devuelve null si no hay nada usable. */
export function normalizeAbout(raw: unknown): AboutValue | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (!v || typeof v !== 'object' || !Array.isArray(v.sections)) return null;
  const used = new Set<string>();
  const sections: AboutSection[] = [];
  for (const r of (v.sections as Record<string, unknown>[]).slice(0, MAX_SECTIONS)) {
    const title = clean(r?.title, MAX_TITLE), body = cleanBody(r?.body);
    if (!title) continue;
    sections.push({ id: uniqueId(String(r?.id ?? ''), title, sections.length, used), title, body });
  }
  if (!sections.length) return null;
  return { title: clean(v.title, MAX_PAGE_TITLE), sections };
}

export function parseAboutForm(f: FormData): { error: string } | { value: AboutValue } {
  const title = clean(f.get('page_title'), MAX_PAGE_TITLE);
  if (!title) return { error: 'El título de la página no puede estar vacío.' };
  const ids = f.getAll('sec_id'), titles = f.getAll('sec_title'), bodies = f.getAll('sec_body');
  if (titles.length > MAX_SECTIONS) return { error: `Máximo ${MAX_SECTIONS} secciones.` };
  const used = new Set<string>();
  const sections: AboutSection[] = [];
  for (let i = 0; i < titles.length; i++) {
    const t = clean(titles[i], MAX_TITLE), body = cleanBody(bodies[i]);
    if (!t && !body) continue; // sección nueva en blanco
    if (!t) return { error: `La sección ${i + 1} necesita un título.` };
    sections.push({ id: uniqueId(String(ids[i] ?? ''), t, sections.length, used), title: t, body });
  }
  if (!sections.length) return { error: 'Debe haber al menos una sección.' };
  return { value: { title, sections } };
}

// ---- Presentación del texto (se escapa solo: nunca se inyecta HTML) ----
export type Seg = { text: string; href?: string };
const TOKEN = /\[([^\]\n]{1,100})\]\(([^)\s]{1,200})\)|(https?:\/\/[^\s<>"'`\\]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Una línea → trozos de texto y enlaces: [texto](/ruta), https://… y correos. Solo enlaces seguros. */
export function inline(line: string): Seg[] {
  const out: Seg[] = [];
  const push = (text: string, href?: string) => { if (text) out.push(href ? { text, href } : { text }); };
  let last = 0, m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    push(line.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) { // [texto](dirección)
      if (safeUrl(m[2])) push(m[1], m[2]); else push(m[0]);
    } else if (m[3] !== undefined) { // https://…
      const trail = /[.,;:!?)\]]+$/.exec(m[3])?.[0] ?? '';
      const url = m[3].slice(0, m[3].length - trail.length);
      if (safeUrl(url)) { push(url, url); push(trail); } else push(m[0]);
    } else push(m[4], `mailto:${m[4]}`); // correo
  }
  push(line.slice(last));
  return out;
}

/** Texto de una sección → párrafos → líneas → trozos. `vars` rellena {nombre}, {correo}, {origen}. */
export function blocks(body: string, vars: Record<string, string> = {}): Seg[][][] {
  const text = body.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all));
  return text.split(/\n{2,}/).map((p) => p.split('\n').filter(Boolean).map(inline)).filter((p) => p.length);
}
