// Prueba de humo: Supabase simulado (PostgREST mínimo) + `astro dev`; comprueba rutas públicas y protección de /admin.
import http from 'node:http';
import { spawn } from 'node:child_process';

const cats = [{ id: 'c1', slug: 'novela', name: 'Novela' }, { id: 'c2', slug: 'ensayo', name: 'Ensayo' }];
const mk = (i, o = {}) => ({ id: `b${i}`, slug: `libro-${i}`, title: `Libro de prueba número ${i}`, author: i % 2 ? 'Autor Uno' : 'Autora Dos',
  description: `Descripción ${i}`, publisher: 'Editorial X', year: 1900 + i, language: 'es', tags: ['prueba'], cover_key: null,
  epub_key: `epub/${i}.epub`, epub_size: 123456, featured: i < 3, published: true, created_at: `2026-01-0${i}`, updated_at: `2026-02-0${i}`,
  category_id: i % 2 ? 'c1' : 'c2', category: i % 2 ? cats[0] : cats[1], ...o });
const books = [1, 2, 3, 4, 5, 6, 7].map((i) => mk(i));
const arts = [1, 2, 3].map((i) => ({ id: `a${i}`, slug: `articulo-${i}`, title: `Artículo de prueba ${i}`, subtitle: `Subtítulo ${i}`, kicker: 'Conversación',
  author: 'Autora Uno', source: `Revista ${i} / agosto 2026`, excerpt: null, cover_key: i === 1 ? 'covers/art-1.jpg' : null, cover_caption: i === 1 ? 'Ilustración de prueba' : null, published: true, published_at: `2026-08-0${i}`, created_at: `2026-08-0${i}`, updated_at: `2026-08-1${i}`,
  body: `Primer párrafo del artículo ${i}.\n\n## Un título\n\nSegundo <b>párrafo</b> con [enlace](/catalogo) y [malo](javascript:alert(1)).` }));

const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const t = u.pathname.split('/').pop();
  let rows = t === 'categories' ? cats : t === 'books' ? books : t === 'articles' ? arts : t === 'site_settings' ? [
    ...(process.env.NO_HERO ? [] : [{ key: 'hero', value: { kicker: 'Kicker editado', title: 'Titular editado por admin', deck: 'Bajada editada', image: 'hero/abc-123.jpg', caption: '' } }]),
    ...(process.env.NO_ABOUT ? [] : [{ key: 'about', value: { title: 'Acerca editado', sections: [
      { id: 'sec-nueva', title: 'Sección escrita por admin', body: 'Primer párrafo con hola@ucronia.org y [mi enlace](/catalogo).\n\nSegundo [malo](javascript:alert(3)) párrafo.' },
      { id: 'legal', title: 'Avisos legales', body: 'Texto legal editado.' } ] } }]),
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

// `detached` + matar el grupo de procesos: `npx` lanza a `astro` como nieto y, si no, queda huérfano ocupando el puerto.
let log = '';
const dev = spawn('npx', ['astro', 'dev', '--port', '4398'], {
  env: { ...process.env, PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54399', PUBLIC_SUPABASE_ANON_KEY: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true });
for (const s of [dev.stdout, dev.stderr]) s.on('data', (d) => { log = (log + d).slice(-6000); });
const stop = (code) => { try { process.kill(-dev.pid, 'SIGKILL'); } catch { /* ya terminó */ } mock.close(); process.exit(code); };
let base = '';
const get = (p, o = {}) => fetch(base + p, { redirect: 'manual', ...o });
let up = false;
for (let i = 0; i < 90 && !up; i++) {
  // Astro avisa del puerto real (cambia de puerto si el pedido está ocupado): se usa ese, no uno fijo.
  const m = log.match(/Local\s+http:\/\/localhost:(\d+)/);
  if (m) { base = `http://127.0.0.1:${m[1]}`; try { await get('/robots.txt'); up = true; break; } catch { /* aún arrancando */ } }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!up) {
  console.error('FAIL astro dev no arrancó.');
  console.error('--- salida de astro dev (últimas líneas) ---\n' + (log.trim() || '(sin salida)'));
  stop(1);
}

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
await check('portada: destacados interactivos', '/', 200, 'data-feat', 'data-feat-stage', 'data-feat-panel', 'data-feat-tab', 'feat-list', 'Ver todo el catálogo');
await check('portada: artículos rotativos', '/', 200, 'data-articles', 'data-art-track', 'art-slide', 'Artículo de prueba 1', 'Leer artículo', 'data-art-next');
const homeHtml = await (await get('/')).text();
const order = ['id="destacados"', 'id="articulos"', 'id="recientes"'].map((k) => homeHtml.indexOf(k));
const okOrder = order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1]));
console.log(okOrder ? 'OK  ' : 'FAIL', 'orden: destacados → artículos → últimas incorporaciones'); if (!okOrder) bad++;
const home2 = await (await get('/')).text();
const noArrows = !['data-feat-prev', 'data-feat-next', 'feat-count', 'feat-ctrl'].some((k) => home2.includes(k));
console.log(noArrows ? 'OK  ' : 'FAIL', 'destacados: sin flechas ni contador'); if (!noArrows) bad++;
await check('portada: portada de artículo', '/', 200, 'class="art-cover"', '/portadas/art-1.jpg');
await check('listado de artículos', '/articulos', 200, 'Artículo de prueba 2', '3 artículos publicados');
await check('artículo: interior', '/articulo/articulo-2', 200, 'art-hero', 'Subtítulo 2', 'Revista 2 / agosto 2026', 'art-body', 'application/ld+json', '"@type":"Article"', 'href="/catalogo"', 'Artículos relacionados');
const art = await (await get('/articulo/articulo-2')).text();
const okArt = art.includes('&lt;b&gt;párrafo&lt;/b&gt;') && !art.includes('javascript:alert');
console.log(okArt ? 'OK  ' : 'FAIL', 'artículo: HTML escapado y javascript: filtrado'); if (!okArt) bad++;
await check('artículo con portada', '/articulo/articulo-1', 200, 'class="art-figure"', '/portadas/art-1.jpg', 'Ilustración de prueba', 'og:image');
await check('artículo inexistente', '/articulo/no-existe', 404);
await check('admin artículos sin sesión', '/admin/articulos', 302);
await check('API artículos sin sesión', '/api/admin/articles', 401);
await check('búsqueda sin resultados', '/catalogo?q=zzz', 200, 'noindex');
await check('ficha', '/libro/libro-3', 200, 'Descargar EPUB', 'application/ld+json', '"@type":"Book"', 'EPUB · 121 KB');
await check('ficha inexistente', '/libro/no-existe', 404);
await check('acerca', '/acerca', 200, 'Avisos legales');
if (!process.env.NO_ABOUT) {
  await check('acerca editable: título, secciones, anclas y enlaces', '/acerca', 200, 'Acerca editado', 'id="sec-nueva"', 'Sección escrita por admin', 'href="mailto:hola@ucronia.org"', 'href="/catalogo"', 'Texto legal editado.');
  const ab = await (await get('/acerca')).text();
  const okAb = !ab.includes('href="javascript:') && !ab.includes('id="proyecto"');
  console.log(okAb ? 'OK  ' : 'FAIL', 'acerca: javascript: filtrado y secciones por defecto reemplazadas'); if (!okAb) bad++;
} else await check('acerca por defecto', '/acerca', 200, 'Acerca del proyecto', 'id="proyecto"', 'id="criterios"', 'id="opds"', 'id="contacto"', 'id="legal"', 'href="mailto:contacto@ejemplo.org"', '/opds');
await check('admin acerca sin sesión', '/admin/acerca', 302);
await check('robots', '/robots.txt', 200, 'Disallow: /admin', 'Sitemap:');
await check('sitemap', '/sitemap.xml', 200, '/libro/libro-1', '<lastmod>2026-02-01</lastmod>', '/articulos', '/articulo/articulo-1');
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
const post = await get('/api/admin/books', { method: 'POST', headers: { Origin: base, Cookie: 'folio-at=falsa', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=delete&id=b1' });
console.log(post.status === 401 ? 'OK  ' : 'FAIL', 'borrado con cookie falsa →', post.status); if (post.status !== 401) bad++;
stop(bad ? 1 : 0);
