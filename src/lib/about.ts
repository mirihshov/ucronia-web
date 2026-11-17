import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { site } from './site';
import { normalizeAbout, type AboutValue } from './about-form';

export { MAX_SECTIONS, MAX_BODY, MAX_TITLE, MAX_ID, MAX_PAGE_TITLE } from './about-form';
export type About = AboutValue & { custom: boolean };

/** «Acerca del proyecto»: lo guardado por los admins o, si no hay nada, los textos de `site.ts`. */
export async function getAbout(client: SupabaseClient = supabase): Promise<About> {
  const base: About = { ...(normalizeAbout({ title: site.aboutTitle, sections: site.aboutSections }) as AboutValue), custom: false };
  try {
    const { data } = await client.from('site_settings').select('value').eq('key', 'about').maybeSingle();
    const v = normalizeAbout(data?.value);
    return v ? { title: v.title || base.title, sections: v.sections, custom: true } : base;
  } catch {
    return base;
  }
}
