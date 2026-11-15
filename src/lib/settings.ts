import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { site } from './site';

export const MAX_SLIDES = 6;

/** Una diapositiva de la portada: titular + foto. */
export type Slide = {
  kicker: string; title: string; deck: string;
  image: string; imageAlt: string; caption: string;
  customImage: boolean; key: string | null; focus: string;
};
export type Hero = Slide;

const KEY_RE = /^hero\/[\w-]+\.(jpg|png|webp)$/;
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

/** Diapositivas de la portada: lo guardado por los admins o, si no hay nada, las de `site.ts`.
 *  Admite el formato antiguo (un solo titular con campos sueltos). */
export async function getSlides(client: SupabaseClient = supabase): Promise<Slide[]> {
  const defs = site.heroSlides;
  const fallback = (): Slide[] => defs.map((d, i) => ({
    kicker: d.kicker, title: d.title, deck: d.deck, image: site.heroImage, imageAlt: site.heroAlt,
    caption: d.caption, customImage: false, key: null, focus: d.focus,
  }));
  try {
    const { data } = await client.from('site_settings').select('value').eq('key', 'hero').maybeSingle();
    const v = (data?.value ?? {}) as Record<string, unknown>;
    const raw: Record<string, unknown>[] = Array.isArray(v.slides)
      ? (v.slides as Record<string, unknown>[])
      : v.title ? [v] : []; // formato antiguo
    const slides: Slide[] = [];
    for (const r of raw.slice(0, MAX_SLIDES)) {
      if (!r || typeof r !== 'object') continue;
      const title = str(r.title);
      if (!title) continue;
      const i = slides.length;
      const d = defs[i % defs.length];
      const k = str(r.image);
      const custom = KEY_RE.test(k);
      slides.push({
        kicker: str(r.kicker) || (Array.isArray(v.slides) ? '' : d.kicker),
        title,
        deck: str(r.deck) || (Array.isArray(v.slides) ? '' : d.deck),
        image: custom ? `/media/${k.slice(5)}` : site.heroImage,
        imageAlt: str(r.imageAlt) || site.heroAlt,
        caption: typeof r.caption === 'string' ? r.caption.trim() : (Array.isArray(v.slides) ? '' : d.caption), // vacío = sin pie de foto
        customImage: custom, key: custom ? k : null,
        focus: custom ? '50% 50%' : d.focus,
      });
    }
    return slides.length ? slides : fallback();
  } catch {
    return fallback();
  }
}

/** Primera diapositiva (compatibilidad). */
export async function getHero(client: SupabaseClient = supabase): Promise<Hero> {
  return (await getSlides(client))[0];
}

/** Claves de Supabase Storage que el valor guardado referencia (para limpiar fotos huérfanas). */
export function slideKeys(value: unknown): Set<string> {
  const out = new Set<string>();
  const v = (value ?? {}) as Record<string, unknown>;
  const add = (x: unknown) => { const k = str(x); if (KEY_RE.test(k)) out.add(k); };
  add(v.image);
  if (Array.isArray(v.slides)) for (const s of v.slides) add((s as Record<string, unknown>)?.image);
  return out;
}
