export const slugify = (s: string, fallback = 'libro') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);

export function parseBookForm(f: FormData) {
  const title = text(f, 'title', 300);
  const author = text(f, 'author', 200);
  if (!title || !author) return { error: 'Título y autor son obligatorios.' as const };
  const y = text(f, 'year', 4);
  const year = y ? Number(y) : null;
  if (year !== null && (!Number.isInteger(year) || year < 0 || year > 2100)) return { error: 'Año no válido.' as const };
  const tags = [...new Set(text(f, 'tags', 500).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 15);
  return {
    row: {
      title, author, year, tags,
      description: text(f, 'description', 5000) || null,
      publisher: text(f, 'publisher', 200) || null,
      language: text(f, 'language', 10) || 'es',
      category_id: text(f, 'category_id', 40) || null,
    },
  };
}

export function parseArticleForm(f: FormData) {
  const title = text(f, 'title', 300);
  if (!title) return { error: 'El título es obligatorio.' as const };
  const body = String(f.get('body') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 120000);
  if (!body) return { error: 'El cuerpo del artículo no puede estar vacío.' as const };
  const d = text(f, 'published_at', 10);
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { error: 'Fecha no válida.' as const };
  return {
    row: {
      title, body,
      subtitle: text(f, 'subtitle', 300) || null,
      kicker: text(f, 'kicker', 60) || null,
      author: text(f, 'author', 200) || null,
      source: text(f, 'source', 200) || null,
      excerpt: text(f, 'excerpt', 500) || null,
      ...(d ? { published_at: d } : {}),
    },
  };
}
