import { supabase } from './supabase';
import { fold, rankBooks } from './search-match';

export type Category = { id: string; slug: string; name: string };
export type Book = {
  id: string; slug: string; title: string; author: string; description: string | null;
  publisher: string | null; year: number | null; language: string; tags: string[];
  cover_key: string | null; epub_key: string | null; epub_size: number | null;
  pdf_key: string | null; pdf_size: number | null;
  featured: boolean; created_at: string; updated_at: string; category: Category | null;
};

const COLS = 'id,slug,title,author,description,publisher,year,language,tags,cover_key,epub_key,epub_size,pdf_key,pdf_size,featured,created_at,updated_at';
export const PAGE_SIZE = 24;

export const coverUrl = (key: string | null) =>
  key ? `/portadas/${key.split('/').pop()}` : null;

export const formatSize = (bytes: number | null) =>
  bytes == null ? '—' : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export async function getCategories(): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('id,slug,name').order('position');
  return data ?? [];
}

export const normalizeQuery = (q = '') =>
  q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();

type Opts = { q?: string; category?: string; featured?: boolean; limit?: number; page?: number };

// Índice ligero de búsqueda (solo campos buscables). Se filtra en la propia web, sin depender de columnas derivadas
// de la base: así funciona con acentos, por título, autor, categoría y etiquetas. Caché de 60 s por instancia.
type Indexed = {
  id: string; title: string; author: string; publisher: string | null; tags: string[] | null; featured: boolean;
  category: { slug: string; name: string } | null;
};
let index: { at: number; rows: Indexed[] } | null = null;
const INDEX_COLS = 'id,title,author,publisher,tags,featured,category:categories(slug,name)';

async function searchIndex(): Promise<Indexed[]> {
  if (index && Date.now() - index.at < 60_000) return index.rows;
  const rows: Indexed[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('books').select(INDEX_COLS)
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) { console.error('searchIndex', error.message); return index?.rows ?? []; }
    rows.push(...((data ?? []) as unknown as Indexed[]));
    if (!data || data.length < 1000) break;
  }
  index = { at: Date.now(), rows };
  return rows;
}

async function searchBooks({ q = '', category, featured, limit = PAGE_SIZE, page = 1 }: Opts) {
  let rows = await searchIndex();
  if (category) rows = rows.filter((b) => b.category?.slug === category);
  if (featured) rows = rows.filter((b) => b.featured);
  const hits = rankBooks(rows, q);
  const ids = hits.slice((page - 1) * limit, page * limit).map((b) => b.id);
  if (!ids.length) return { books: [] as Book[], total: hits.length };
  const { data, error } = await supabase.from('books')
    .select(`${COLS}, category:categories(id,slug,name)`).in('id', ids);
  if (error) console.error('searchBooks', error.message);
  const byId = new Map(((data ?? []) as unknown as Book[]).map((b) => [b.id, b]));
  return { books: ids.map((id) => byId.get(id)).filter((b): b is Book => !!b), total: hits.length };
}

export async function listBooks(opts: Opts = {}) {
  const { q, category, featured, limit = PAGE_SIZE, page = 1 } = opts;
  if (fold(q)) return searchBooks(opts);

  let query = supabase
    .from('books')
    .select(`${COLS}, category:categories${category ? '!inner' : ''}(id,slug,name)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (category) query = query.eq('category.slug', category);
  if (featured) query = query.eq('featured', true);

  const { data, count, error } = await query;
  if (error) console.error('listBooks', error.message);
  return { books: (data ?? []) as unknown as Book[], total: count ?? 0 };
}

export async function getBook(slug: string): Promise<Book | null> {
  const { data } = await supabase
    .from('books').select(`${COLS}, category:categories(id,slug,name)`).eq('slug', slug).maybeSingle();
  return (data as unknown as Book) ?? null;
}

export const markOf = (title: string) => {
  const w = title.split(/\s+/).filter((x) => x.length > 3);
  return (w.length > 1 ? w[0][0] + w[1][0] : title.slice(0, 2)).toUpperCase();
};
const VARIANTS = ['slash', 'circle', 'grid', 'red', 'type', 'frame'];
export const coverVariant = (id: string) => VARIANTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % VARIANTS.length];
