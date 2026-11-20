import { supabase } from './supabase';
export { renderBody, excerptOf, readingMinutes, plainText } from './article-body';

export type Article = {
  id: string; slug: string; title: string; subtitle: string | null; kicker: string | null; author: string | null;
  source: string | null; excerpt: string | null; published_at: string; body: string;
  cover_key: string | null; cover_caption: string | null;
};

const META = 'id,slug,title,subtitle,kicker,author,source,excerpt,published_at,cover_key,cover_caption';
export const ARTICLES_PAGE = 24;

export const formatDate = (d: string) =>
  new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));

/** Artículos publicados (RLS) del más reciente al más antiguo. `withBody` solo cuando hace falta el texto (resúmenes, tiempo de lectura). */
export async function listArticles({ limit = 8, page = 1, withBody = false, exclude }: { limit?: number; page?: number; withBody?: boolean; exclude?: string } = {}) {
  let q = supabase.from('articles').select(withBody ? `${META},body` : META, { count: 'exact' })
    .order('published_at', { ascending: false }).order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (exclude) q = q.neq('id', exclude);
  const { data, count, error } = await q;
  if (error) console.error('listArticles', error.message);
  return { articles: ((data ?? []) as unknown as Article[]).map((a) => ({ ...a, body: a.body ?? '' })), total: count ?? 0 };
}

export async function getArticle(slug: string): Promise<Article | null> {
  const { data, error } = await supabase.from('articles').select(`${META},body`).eq('slug', slug).maybeSingle();
  if (error) console.error('getArticle', error.message);
  return (data as unknown as Article) ?? null;
}
