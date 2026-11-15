import type { APIRoute } from 'astro';
import { supabase } from '../lib/supabase';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const GET: APIRoute = async ({ url }) => {
  const rows: { slug: string; updated_at: string }[] = [];
  for (let from = 0; from < 50000; from += 1000) { // paginado: sin tope de 1000 libros
    const { data } = await supabase.from('books').select('slug,updated_at').order('created_at').range(from, from + 999);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const u = (loc: string, last?: string) => `<url><loc>${esc(url.origin + loc)}</loc>${last ? `<lastmod>${last.slice(0, 10)}</lastmod>` : ''}</url>`;
  const body = [u('/'), u('/catalogo'), u('/acerca'), ...rows.map((r) => u(`/libro/${r.slug}`, r.updated_at))].join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
