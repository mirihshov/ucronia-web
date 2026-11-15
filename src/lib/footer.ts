import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { site } from './site';
import { MAX_COLS, MAX_COL_LINKS, MAX_SOCIAL, NETWORKS, cleanText, safeSocial, safeUrl, type FooterColumn, type Social } from './footer-form';

export { isExternal, segments, MAX_COLS, MAX_COL_LINKS, MAX_SOCIAL, NETWORKS } from './footer-form';
export type Footer = { tagline: string; note: string; columns: FooterColumn[]; social: Social[]; custom: boolean };

const normCol = (c: unknown): FooterColumn => {
  const o = (c ?? {}) as Record<string, unknown>;
  return {
    title: String(o.title ?? '').trim().slice(0, 40),
    text: cleanText(o.text, 300),
    links: (Array.isArray(o.links) ? (o.links as Record<string, unknown>[]) : [])
      .map((l) => ({ label: String(l?.label ?? '').trim(), url: String(l?.url ?? '').trim() }))
      .filter((l) => l.label && safeUrl(l.url)) // se revalida al leer
      .slice(0, MAX_COL_LINKS),
  };
};

/** Pie de página: lo guardado por los admins o, si no hay nada, los valores de `site.ts`. */
export async function getFooter(client: SupabaseClient = supabase): Promise<Footer> {
  const base: Footer = { tagline: site.tagline, note: site.footerNote, columns: site.footerColumns.map(normCol), social: [], custom: false };
  try {
    const { data } = await client.from('site_settings').select('value').eq('key', 'footer').maybeSingle();
    const v = data?.value as Record<string, unknown> | undefined;
    if (!v || typeof v !== 'object') return base;
    // Formato anterior: una sola lista de enlaces → una columna.
    const raw = Array.isArray(v.columns) ? v.columns : Array.isArray(v.links) ? [{ title: 'Enlaces', text: '', links: v.links }] : null;
    const columns = raw ? raw.slice(0, MAX_COLS).map(normCol).filter((c) => c.title || c.text || c.links.length) : base.columns;
    const social = (Array.isArray(v.social) ? (v.social as Record<string, unknown>[]) : [])
      .map((s) => ({ network: String(s?.network ?? '') as keyof typeof NETWORKS, url: String(s?.url ?? '').trim() }))
      .filter((s) => safeSocial(s.network, s.url))
      .slice(0, MAX_SOCIAL);
    return {
      tagline: typeof v.tagline === 'string' ? v.tagline.trim() : base.tagline, // vacío = sin frase
      note: typeof v.note === 'string' ? v.note.trim() : base.note,
      columns, social, custom: true,
    };
  } catch {
    return base;
  }
}
