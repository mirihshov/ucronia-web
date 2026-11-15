import type { APIRoute } from 'astro';
import { feed, navEntry, commonLinks, NAV, ACQ } from '../../lib/opds';
import { site } from '../../lib/site';

export const GET: APIRoute = ({ url }) => {
  const o = url.origin;
  return feed({
    origin: o, id: '/opds', title: site.name, kind: 'navigation', links: commonLinks('/opds', NAV, false),
    entries: [
      navEntry({ title: 'Novedades', id: '/opds/nuevos', href: '/opds/nuevos', rel: 'http://opds-spec.org/sort/new', type: ACQ, content: 'Los libros añadidos más recientemente.' }, o),
      navEntry({ title: 'Selección destacada', id: '/opds/destacados', href: '/opds/destacados', rel: 'http://opds-spec.org/featured', type: ACQ, content: 'Elegidos por los editores.' }, o),
      navEntry({ title: 'Categorías', id: '/opds/categorias', href: '/opds/categorias', type: NAV, content: 'Explorar por género y tema.' }, o),
      navEntry({ title: 'Todo el catálogo', id: '/opds/todos', href: '/opds/todos', type: ACQ, content: 'Todos los libros publicados.' }, o),
    ],
  });
};
