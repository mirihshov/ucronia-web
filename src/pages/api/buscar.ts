import type { APIRoute } from 'astro';
import { listBooks, coverUrl, markOf } from '../../lib/catalog';

// Sugerencias del buscador: solo libros publicados (RLS) y datos públicos.
const json = (d: unknown) =>
  new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, s-maxage=60' } });

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return json({ q, total: 0, results: [] });
  const { books, total } = await listBooks({ q, limit: 6 });
  return json({
    q, total,
    results: books.slice(0, 6).map((b) => ({
      slug: b.slug, title: b.title, author: b.author, category: b.category?.name ?? null,
      year: b.year, tags: b.tags.slice(0, 3), cover: coverUrl(b.cover_key), mark: markOf(b.title),
    })),
  });
};
