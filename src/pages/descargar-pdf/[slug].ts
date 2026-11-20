import type { APIRoute } from 'astro';
import { getBook } from '../../lib/catalog';
import { getObject } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

// Descarga del PDF (opcional): solo existe para libros publicados que tengan PDF. Mismo esquema que el EPUB:
// bucket privado + RLS (solo concede los PDF de libros publicados) y caché de borde de 1 h para ahorrar egress.
export const GET: APIRoute = async ({ params, locals, request }) => {
  const cache = (globalThis as any).caches?.default;
  const hit = cache ? await cache.match(request).catch(() => null) : null;
  if (hit) return hit;

  const book = await getBook(params.slug!);
  if (!book?.pdf_key) return new Response('Este libro no tiene PDF', { status: 404 });

  const obj = await getObject(supabase, book.pdf_key);
  if (!obj) return new Response('Archivo no disponible', { status: 404 });

  const res = new Response(obj.blob, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${book.slug}.pdf"`,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  if (cache) (locals as any).runtime?.ctx?.waitUntil?.(cache.put(request, res.clone()).catch(() => {}));
  return res;
};
