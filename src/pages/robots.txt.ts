import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ url }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /descargar/\n\nSitemap: ${url.origin}/sitemap.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
