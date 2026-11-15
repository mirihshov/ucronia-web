// Prueba de humo: Supabase simulado (PostgREST mínimo) + `astro dev`; comprueba rutas públicas y protección de /admin.
import http from 'node:http';
import { spawn } from 'node:child_process';

const cats = [{ id: 'c1', slug: 'novela', name: 'Novela' }, { id: 'c2', slug: 'ensayo', name: 'Ensayo' }];
const mk = (i, o = {}) => ({ id: `b${i}`, slug: `libro-${i}`, title: `Libro de prueba número ${i}`, author: i % 2 ? 'Autor Uno' : 'Autora Dos',
  description: `Descripción ${i}`, publisher: 'Editorial X', year: 1900 + i, language: 'es', tags: ['prueba'], cover_key: null,
  epub_key: `epub/${i}.epub`, epub_size: 123456, featured: i < 3, published: true, created_at: `2026-01-0${i}`, updated_at: `2026-02-0${i}`,
  category_id: i % 2 ? 'c1' : 'c2', category: i % 2 ? cats[0] : cats[1], ...o });
const books = [1, 2, 3, 4, 5, 6, 7].map((i) => mk(i));

const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const t = u.pathname.split('/').pop();
  let rows = t === 'categories' ? cats : t === 'books' ? books : t === 'site_settings' ? [
    ...(process.env.NO_HERO ? [] : [{ key: 'hero', value: { kicker: 'Kicker editado', title: 'Titular editado por admin', deck: 'Bajada editada', image: 'hero/abc-123.jpg', caption: '' } }]),
    ...(process.env.NO_FOOTER ? [] : [{ key: 'footer', value: { tagline: 'Pie editado desde el panel', note: 'Nota editada', columns: [
      { title: 'Servicio', text: 'Avda. Principal 123\nescribe a hola@ucronia.org', links: [{ label: 'Mi enlace', url: '/acerca#legal' }, { label: 'Externo', url: 'https://example.org' }, { label: 'Malo', url: 'javascript:alert(1)' }] },
      { title: 'Horarios', text: 'Lunes a jueves', links: [] } ],
      social: [{ network: 'instagram', url: 'https://instagram.com/ucronia' }, { network: 'web', url: 'javascript:alert(2)' }] } }]),
  ] : [];
  const key = u.searchParams.get('key'); if (key) rows = rows.filter((r) => `eq.${r.key}` === key);
  const slug = u.searchParams.get('slug'); if (slug) rows = rows.filter((r) => `eq.${r.slug}` === slug);
  if (u.searchParams.get('featured') === 'eq.true') rows = rows.filter((r) => r.featured);
  const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const h = { 'Content-Type': 'application/json', 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
  if (single) { res.writeHead(rows[0] ? 200 : 406, h); return res.end(JSON.stringify(rows[0] ?? { code: 'PGRST116', message: 'no rows' })); }
  res.writeHead(200, h); res.end(JSON.stringify(rows));
});
await new Promise((r) => mock.listen(54399, '127.0.0.1', r));

const dev = spawn('npx', ['astro', 'dev', '--port', '4398'], {
  env: { ...process.env, PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54399', PUBLIC_SUPABASE_ANON_KEY: 'test' }, stdio: 'ignore' });
const stop = (code) => { dev.kill('SIGKILL'); mock.close(); process.exit(code); };
const get = (p, o = {}) => fetch('http://127.0.0.1:4398' + p, { redirect: 'manual', ...o });
for (let i = 0; i < 60; i++) { try { await get('/robots.txt'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

let bad = 0;
const check = async (name, p, status, ...needles) => {
  const r = await get(p); const body = await r.text();
  const miss = needles.filter((n) => !body.includes(n));
  const ok = r.status === status && !miss.length;
  if (!ok) bad++;
  console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : `(status ${r.status}, faltan: ${miss.join(' | ')})`);
};
await check('portada', '/', 200, `aria-label="${process.env.NO_HERO ? 'Ideas para un mundo sin amos.' : 'Titular editado por admin'}"`, 'data-suggest', 'Explorar', process.env.NO_HERO ? 'unsplash.com' : 'src="/media/abc-123.jpg"', 'logo-completo.svg', 'logo-texto.svg', 'rel="icon"', 'og-default.png', 'kind=navigation', 'Selección destacada', 'Últimas incorporaciones', 'Biblioteca Ucronía', 'id="manifiesto"', 'Derechos en regla', 'property="og:title"', 'lang="es"');
await check('portada rotativa y manifiesto', '/', 200, 'data-hero', 'hero-slide', 'data-scrub', 'data-m-cur');
const home = await (await get('/')).text();
const noAuthors = !home.includes('Autores destacados') && !home.includes('class="ticker"') && !home.includes('Novedades</');
console.log(noAuthors ? 'OK  ' : 'FAIL', 'sin autores ni cinta de novedades'); if (!noAuthors) bad++;
await check('catálogo', '/catalogo', 200, 'Libro de prueba número 7', '7 libros encontrados', 'Novela');
await check('búsqueda sin resultados', '/catalogo?q=zzz', 200, 'noindex');
await check('ficha', '/libro/libro-3', 200, 'Descargar EPUB', 'application/ld+json', '"@type":"Book"', 'EPUB · 121 KB');
await check('ficha inexistente', '/libro/no-existe', 404);
await check('acerca', '/acerca', 200, 'Avisos legales');
await check('robots', '/robots.txt', 200, 'Disallow: /admin', 'Sitemap:');
await check('sitemap', '/sitemap.xml', 200, '/libro/libro-1', '<lastmod>2026-02-01</lastmod>');
await check('admin sin sesión → login', '/admin', 302);
await check('login visible', '/admin/login', 200, 'Acceso', 'Entrar', 'logo-completo.svg');
await check('OPDS raíz', '/opds', 200, '<feed', 'kind=acquisition', 'rel="search"', '/opds/nuevos');
await check('OPDS novedades', '/opds/nuevos', 200, 'opds-spec.org/acquisition/open-access', 'application/epub+zip', '/descargar/libro-1', 'urn:uuid:b1');
await check('OPDS categorías', '/opds/categorias', 200, '/opds/categoria/novela');
await check('OPDS categoría', '/opds/categoria/novela', 200, '<title>Novela</title>');
await check('OPDS categoría inexistente', '/opds/categoria/zzz', 404);
await check('OPDS búsqueda', '/opds/buscar?q=prueba', 200, 'prueba');
await check('OPDS opensearch', '/opds/opensearch.xml', 200, 'OpenSearchDescription', '{searchTerms}');
await check('OPDS ruta inexistente', '/opds/nada', 404);
await check('API de sugerencias', '/api/buscar?q=prueba', 200, '"results":[{"slug":"libro-1"', '"total":7');
await check('sugerencias: consulta corta', '/api/buscar?q=a', 200, '"results":[]');
if (!process.env.NO_FOOTER) {
  await check('pie editable: columnas, texto, enlaces y redes', '/', 200, 'Pie editado desde el panel', 'Nota editada', 'class="foot-col"', '>Servicio</h2>', 'Avda. Principal 123', 'href="mailto:hola@ucronia.org"', 'Mi enlace', 'href="/acerca#legal"', 'rel="noopener noreferrer"', 'aria-label="Instagram"', 'https://instagram.com/ucronia', 'Subir');
  const h2 = await (await get('/')).text();
  const clean = !h2.includes('javascript:') && !h2.includes('/acerca#opds') && !h2.includes('aria-label="Sitio web"');
  console.log(clean ? 'OK  ' : 'FAIL', 'pie: javascript: filtrado y columnas por defecto reemplazadas'); if (!clean) bad++;
} else await check('pie por defecto', '/', 200, 'class="foot-cols"', '/opds', 'Avisos legales', 'contacto@ejemplo.org', 'mailto:contacto@ejemplo.org', 'Memoria impresa para futuros posibles.');
await check('admin pie sin sesión', '/admin/pie', 302);
await check('API pie sin sesión', '/api/admin/footer', 401);
await check('admin portada sin sesión', '/admin/portada', 302);
await check('API ajustes sin sesión', '/api/admin/settings', 401);
await check('API admin sin sesión', '/api/admin/books', 401);
const post = await get('/api/admin/books', { method: 'POST', headers: { Origin: 'http://127.0.0.1:4398', Cookie: 'folio-at=falsa', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=delete&id=b1' });
console.log(post.status === 401 ? 'OK  ' : 'FAIL', 'borrado con cookie falsa →', post.status); if (post.status !== 401) bad++;
stop(bad ? 1 : 0);
