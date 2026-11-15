import type { APIRoute } from 'astro';

// Sirve solo covers/* desde R2 (nunca EPUB), con caché en el borde para ahorrar lecturas.
export const GET: APIRoute = async ({ params, locals, request }) => {
  const file = params.file ?? '';
  if (!/^[\w-]+\.(jpg|png|webp)$/.test(file)) return new Response('No encontrado', { status: 404 });
  const rt = (locals as any).runtime;
  const bucket = rt?.env?.BUCKET;
  if (!bucket) return new Response('Almacenamiento no configurado', { status: 503 });

  const cache = (globalThis as any).caches?.default;
  const hit = cache ? await cache.match(request).catch(() => null) : null;
  if (hit) return hit;

  const obj = await bucket.get(`covers/${file}`);
  if (!obj) return new Response('No encontrado', { status: 404 });
  const res = new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
  if (cache) rt?.ctx?.waitUntil?.(cache.put(request, res.clone()));
  return res;
};
