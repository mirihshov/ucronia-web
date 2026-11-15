import type { APIRoute } from 'astro';
import { listBooks, getCategories } from '../../lib/catalog';
import { feed, bookEntry, navEntry, commonLinks, openSearch, NAV, ACQ, PAGE } from '../../lib/opds';

const notFound = () => new Response('No encontrado', { status: 404 });

export const GET: APIRoute = async ({ params, url }) => {
  const o = url.origin;
  const seg = (params.feed ?? '').split('/').filter(Boolean);
  const [a, b] = seg;
  const page = Math.max(1, Number(url.searchParams.get('p')) || 1);

  if (seg.length === 1 && a === 'opensearch.xml') return openSearch(o);

  if (seg.length === 1 && a === 'categorias') {
    const cats = await getCategories();
    return feed({
      origin: o, id: '/opds/categorias', title: 'Categorías', kind: 'navigation', links: commonLinks('/opds/categorias', NAV),
      entries: cats.map((c) => navEntry({ title: c.name, id: `/opds/categoria/${c.slug}`, href: `/opds/categoria/${c.slug}`, type: ACQ, content: `Libros de ${c.name}` }, o)),
    });
  }

  // Cada ruta de adquisición: título, id y consulta
  let title = '', id = '', query: Parameters<typeof listBooks>[0] = {}, extra = '';
  if (seg.length === 1 && a === 'nuevos') { title = 'Novedades'; id = '/opds/nuevos'; }
  else if (seg.length === 1 && a === 'destacados') { title = 'Selección destacada'; id = '/opds/destacados'; query = { featured: true }; }
  else if (seg.length === 1 && a === 'todos') { title = 'Todo el catálogo'; id = '/opds/todos'; }
  else if (seg.length === 1 && a === 'buscar') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    title = q ? `Resultados para «${q}»` : 'Búsqueda'; id = '/opds/buscar'; query = { q }; extra = `q=${encodeURIComponent(q)}`;
  } else if (seg.length === 2 && a === 'categoria') {
    const cat = (await getCategories()).find((c) => c.slug === b);
    if (!cat) return notFound();
    title = cat.name; id = `/opds/categoria/${cat.slug}`; query = { category: cat.slug };
  } else return notFound();

  const empty = a === 'buscar' && !query.q;
  const { books, total } = empty ? { books: [], total: 0 } : await listBooks({ ...query, limit: PAGE, page });
  const href = (p: number) => `${id}?${[extra, `p=${p}`].filter(Boolean).join('&')}`;
  const last = Math.max(1, Math.ceil(total / PAGE));
  const links = [
    ...commonLinks(page > 1 || extra ? href(page) : id, ACQ),
    { rel: 'first', href: href(1), type: ACQ },
    ...(page > 1 ? [{ rel: 'previous', href: href(page - 1), type: ACQ }] : []),
    ...(page < last ? [{ rel: 'next', href: href(page + 1), type: ACQ }] : []),
  ];
  const updated = books.map((x) => x.updated_at).sort().pop();
  return feed({ origin: o, id, title, kind: 'acquisition', links, entries: books.map((x) => bookEntry(x, o)), updated, total, start: (page - 1) * PAGE + 1 });
};
