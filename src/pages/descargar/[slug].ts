import type { APIRoute } from 'astro';
import { getBook } from '../../lib/catalog';

// Descarga pública: solo libros publicados (RLS lo garantiza en getBook).
export const GET: APIRoute = async ({ params, locals }) => {
  const book = await getBook(params.slug!);
  if (!book?.epub_key) return new Response('No encontrado', { status: 404 });

  const bucket = (locals as any).runtime?.env?.BUCKET;
  if (!bucket) return new Response('Almacenamiento no configurado', { status: 503 });

  const obj = await bucket.get(book.epub_key);
  if (!obj) return new Response('Archivo no disponible', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${book.slug}.epub"`,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
