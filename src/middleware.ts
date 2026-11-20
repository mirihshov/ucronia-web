import { defineMiddleware } from 'astro:middleware';
import { resolveAdmin } from './lib/auth';

const CSP = "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const cacheable = (p: string) => p === '/' || p === '/catalogo' || p === '/acerca' || p === '/api/buscar' || p.startsWith('/opds') || p.startsWith('/libro/') || p === '/articulos' || p.startsWith('/articulo/');

// Cabeceras de seguridad en todas las respuestas (CSP/HSTS solo en producción).
function secure(res: Response, noStore = false) {
  const r = new Response(res.body, res); // copia con cabeceras mutables
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  r.headers.set('X-Frame-Options', 'DENY');
  if (import.meta.env.PROD) {
    r.headers.set('Content-Security-Policy', CSP);
    r.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  if (noStore) r.headers.set('Cache-Control', 'private, no-store');
  return r;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const p = ctx.url.pathname;
  const isApi = p.startsWith('/api/admin');
  const isAdmin = isApi || (p.startsWith('/admin') && p !== '/admin/login');

  if (isAdmin) { // sesión válida + pertenecer a `admins`
    const admin = await resolveAdmin(ctx.cookies);
    if (!admin) return secure(isApi ? new Response('No autorizado', { status: 401 }) : ctx.redirect('/admin/login'), true);
    ctx.locals.admin = admin;
    return secure(await next(), true);
  }
  if (p.startsWith('/admin')) return secure(await next(), true);

  // Caché de borde de 60 s para páginas públicas (reduce consultas a Supabase). Sin caché para quien tenga sesión admin.
  const cache = (globalThis as any).caches?.default;
  if (cache && ctx.request.method === 'GET' && cacheable(p) && !ctx.cookies.has('folio-at')) {
    try {
      const hit = await cache.match(ctx.request);
      if (hit) return secure(hit);
    } catch { /* sin caché */ }
    const res = await next();
    if (res.status === 200) {
      const h = new Headers(res.headers);
      h.set('Cache-Control', 'public, max-age=0, s-maxage=60');
      (ctx.locals as any).runtime?.ctx?.waitUntil?.(cache.put(ctx.request, new Response(res.clone().body, { status: 200, headers: h })).catch(() => {}));
    }
    return secure(res);
  }
  return secure(await next());
});
