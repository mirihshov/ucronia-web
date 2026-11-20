// OPDS 1.2 (Atom). Lo consumen KOReader, Calibre, Moon+ Reader, Librera, Thorium…
import { coverUrl, type Book } from './catalog';
import { site } from './site';

export const NAV = 'application/atom+xml;profile=opds-catalog;kind=navigation';
export const ACQ = 'application/atom+xml;profile=opds-catalog;kind=acquisition';
export const PAGE = 40;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type Link = { rel?: string; href: string; type?: string; title?: string; length?: number };
const iso = (d?: string | null) => (d && !isNaN(+new Date(d)) ? new Date(d) : new Date()).toISOString();
const mime = (u: string) => (u.endsWith('.png') ? 'image/png' : u.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

const linkXml = (l: Link, origin: string) =>
  `<link${l.rel ? ` rel="${esc(l.rel)}"` : ''} href="${esc(l.href.startsWith('http') ? l.href : origin + l.href)}"` +
  `${l.type ? ` type="${esc(l.type)}"` : ''}${l.title ? ` title="${esc(l.title)}"` : ''}${l.length != null ? ` length="${l.length}"` : ''}/>`;

export function bookEntry(b: Book, origin: string) {
  const cover = coverUrl(b.cover_key);
  const links: Link[] = [
    { rel: 'http://opds-spec.org/acquisition/open-access', href: `/descargar/${b.slug}`, type: 'application/epub+zip', title: 'EPUB', length: b.epub_size ?? undefined },
    ...(b.pdf_key ? [{ rel: 'http://opds-spec.org/acquisition/open-access', href: `/descargar-pdf/${b.slug}`, type: 'application/pdf', title: 'PDF', length: b.pdf_size ?? undefined }] : []),
    ...(cover ? [{ rel: 'http://opds-spec.org/image', href: cover, type: mime(cover) }, { rel: 'http://opds-spec.org/image/thumbnail', href: cover, type: mime(cover) }] : []),
    { rel: 'alternate', href: `/libro/${b.slug}`, type: 'text/html', title: 'Ficha en la web' },
  ];
  return `<entry><title>${esc(b.title)}</title><id>urn:uuid:${esc(b.id)}</id><updated>${iso(b.updated_at)}</updated>` +
    `<author><name>${esc(b.author)}</name></author><dcterms:language>${esc(b.language)}</dcterms:language>` +
    (b.publisher ? `<dcterms:publisher>${esc(b.publisher)}</dcterms:publisher>` : '') +
    (b.year ? `<dcterms:issued>${b.year}</dcterms:issued>` : '') +
    (b.category ? `<category term="${esc(b.category.slug)}" label="${esc(b.category.name)}"/>` : '') +
    b.tags.map((t) => `<category term="${esc(t)}" label="${esc(t)}"/>`).join('') +
    (b.description ? `<summary type="text">${esc(b.description.slice(0, 1000))}</summary>` : '') +
    links.map((l) => linkXml(l, origin)).join('') + `</entry>`;
}

export const navEntry = (o: { title: string; id: string; href: string; rel?: string; type: string; content?: string }, origin: string) =>
  `<entry><title>${esc(o.title)}</title><id>${esc(origin + o.id)}</id><updated>${new Date().toISOString()}</updated>` +
  (o.content ? `<content type="text">${esc(o.content)}</content>` : '') + linkXml({ rel: o.rel ?? 'subsection', href: o.href, type: o.type }, origin) + `</entry>`;

export function feed(o: {
  origin: string; id: string; title: string; kind: 'navigation' | 'acquisition'; links: Link[]; entries: string[];
  updated?: string; total?: number; start?: number; perPage?: number;
}) {
  const os = o.total != null
    ? `<opensearch:totalResults>${o.total}</opensearch:totalResults><opensearch:itemsPerPage>${o.perPage ?? PAGE}</opensearch:itemsPerPage><opensearch:startIndex>${o.start ?? 1}</opensearch:startIndex>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">` +
    `<id>${esc(o.origin + o.id)}</id><title>${esc(o.title)}</title><updated>${iso(o.updated)}</updated>` +
    `<author><name>${esc(site.name)}</name><uri>${esc(o.origin)}</uri></author>` +
    o.links.map((l) => linkXml(l, o.origin)).join('') + os + o.entries.join('') + `</feed>`;
  return new Response(xml, {
    headers: {
      'Content-Type': `${o.kind === 'navigation' ? NAV : ACQ}; charset=utf-8`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=0, s-maxage=60',
    },
  });
}

/** Enlaces comunes: inicio, búsqueda (OpenSearch + plantilla directa). */
export const commonLinks = (self: string, type: string, up = true): Link[] => [
  { rel: 'self', href: self, type },
  { rel: 'start', href: '/opds', type: NAV },
  ...(up && self !== '/opds' ? [{ rel: 'up', href: '/opds', type: NAV }] : []),
  { rel: 'search', href: '/opds/opensearch.xml', type: 'application/opensearchdescription+xml', title: 'Buscar' },
  { rel: 'search', href: '/opds/buscar?q={searchTerms}', type: ACQ, title: 'Buscar' },
];

export function openSearch(origin: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>${esc(site.name)}</ShortName>` +
    `<Description>Buscar en ${esc(site.name)}</Description><InputEncoding>UTF-8</InputEncoding><OutputEncoding>UTF-8</OutputEncoding>` +
    `<Url type="${ACQ}" template="${esc(origin)}/opds/buscar?q={searchTerms}"/></OpenSearchDescription>`,
    { headers: { 'Content-Type': 'application/opensearchdescription+xml; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });
}
