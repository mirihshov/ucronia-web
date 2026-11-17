import type { APIRoute } from 'astro';
import { getBook } from '../../lib/catalog';
import { getObject } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { buildPreview } from '../../lib/epub-preview';

// Vista previa pública: solo el comienzo del libro (texto, con tope de caracteres), nunca el EPUB entero.
// Solo libros publicados (igual que la descarga: el bucket es privado y RLS solo concede los publicados).
// Caché de borde de 1 h: el EPUB se descarga y analiza una vez por hora como mucho.
const json = (body: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });

export const GET: APIRoute = async ({ params, locals, request }) => {
  const cache = (globalThis as any).caches?.default;
  const hit = cache ? await cache.match(request).catch(() => null) : null;
  if (hit) return hit;

  const book = await getBook(params.slug!);
  if (!book?.epub_key) return json({ error: 'No encontrado' }, 404);

  const obj = await getObject(supabase, book.epub_key);
  if (!obj) return json({ error: 'Archivo no disponible' }, 404);

  const pv = buildPreview(new Uint8Array(await obj.blob.arrayBuffer()));
  if (!pv) return json({ error: 'Este libro no tiene vista previa.' }, 404);

  const res = json(pv, 200, true);
  if (cache) (locals as any).runtime?.ctx?.waitUntil?.(cache.put(request, res.clone()).catch(() => {}));
  return res;
};
