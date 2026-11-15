import { supabase } from './supabase';

export type Category = { id: string; slug: string; name: string };
export type Book = {
  id: string; slug: string; title: string; author: string; description: string | null;
  publisher: string | null; year: number | null; language: string; tags: string[];
  cover_key: string | null; epub_key: string | null; epub_size: number | null;
  featured: boolean; created_at: string; updated_at: string; category: Category | null;
};

const COLS = 'id,slug,title,author,description,publisher,year,language,tags,cover_key,epub_key,epub_size,featured,created_at,updated_at';
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

export async function listBooks({ q, category, featured, limit = PAGE_SIZE, page = 1 }: Opts = {}) {
  let query = supabase
    .from('books')
    .select(`${COLS}, category:categories${category ? '!inner' : ''}(id,slug,name)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (category) query = query.eq('category.slug', category);
  if (featured) query = query.eq('featured', true);

  // Sin acentos ni mayúsculas; todas las palabras deben aparecer (título, autor, editorial, etiquetas o categoría).
  const words = normalizeQuery(q).split(' ').filter(Boolean).slice(0, 5);
  for (const w of words) query = query.ilike('search_text', `%${w}%`);

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
