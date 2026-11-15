export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'libro';

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
