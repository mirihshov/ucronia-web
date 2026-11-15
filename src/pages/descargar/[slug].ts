import type { APIRoute } from 'astro';
import { getBook } from '../../lib/catalog';
import { getObject } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

// Descarga pública: solo libros publicados. El bucket es privado: el archivo se lee con la clave anónima y
// la política RLS de Storage solo concede los EPUB de libros publicados; nunca se expone una URL del bucket.
// Caché de borde de 1 h: los libros más pedidos no vuelven a consumir la cuota de salida (egress) de Supabase.
export const GET: APIRoute = async ({ params, locals, request }) => {
  const cache = (globalThis as any).caches?.default;
  const hit = cache ? await cache.match(request).catch(() => null) : null;
  if (hit) return hit;

  const book = await getBook(params.slug!);
  if (!book?.epub_key) return new Response('No encontrado', { status: 404 });

  const obj = await getObject(supabase, book.epub_key);
  if (!obj) return new Response('Archivo no disponible', { status: 404 });

  const res = new Response(obj.blob, {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${book.slug}.epub"`,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  if (cache) (locals as any).runtime?.ctx?.waitUntil?.(cache.put(request, res.clone()).catch(() => {}));
  return res;
};
