import type { APIRoute } from 'astro';
import { getObject } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

// Sirve solo hero/* del bucket privado (foto de la portada del sitio; nunca EPUB), con caché en el borde para ahorrar lecturas.
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const GET: APIRoute = async ({ params, locals, request }) => {
  const file = params.file ?? '';
  if (!/^[\w-]+\.(jpg|png|webp)$/.test(file)) return new Response('No encontrado', { status: 404 });
  const rt = (locals as any).runtime;
  const cache = (globalThis as any).caches?.default;
  const hit = cache ? await cache.match(request).catch(() => null) : null;
  if (hit) return hit;

  const obj = await getObject(supabase, `hero/${file}`);
  if (!obj) return new Response('No encontrado', { status: 404 });
  const res = new Response(obj.blob, {
    headers: { 'Content-Type': TYPES[file.split('.').pop()!] ?? obj.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
  if (cache) rt?.ctx?.waitUntil?.(cache.put(request, res.clone()));
  return res;
};
