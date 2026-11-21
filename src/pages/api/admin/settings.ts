import type { APIRoute } from 'astro';
import { putObject, removeObjects, sniffImage } from '../../../lib/storage';
import { MAX_SLIDES, slideKeys } from '../../../lib/settings';

const MAX_IMAGE = 3 * 1024 * 1024;
const go = (msg: string, ok = false) =>
  new Response(null, { status: 303, headers: { Location: `/admin/portada?msg=${encodeURIComponent(msg)}${ok ? '&ok=1' : ''}` } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client; // sesión admin; RLS lo comprueba otra vez en la base
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');
  const clean = (x: unknown, n: number) => String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
  const drop = async (key: string) => { if (key) await removeObjects(db, [key]); }; // si falla queda un huérfano inocuo

  const { data: cur } = await db.from('site_settings').select('value').eq('key', 'hero').maybeSingle();
  const oldKeys = slideKeys(cur?.value);

  if (intent === 'save') {
    // Cada campo llega como lista alineada con el orden de las diapositivas en el formulario.
    const titles = f.getAll('title'), kickers = f.getAll('kicker'), decks = f.getAll('deck');
    const alts = f.getAll('imageAlt'), caps = f.getAll('caption'), keys = f.getAll('image_key');
    const modes = f.getAll('image_mode'), files = f.getAll('image');
    const n = titles.length;
    if (n > MAX_SLIDES) return go(`Máximo ${MAX_SLIDES} titulares.`);

    const slides: Record<string, unknown>[] = [];
    const uploaded: string[] = [];
    const rollback = async () => { for (const k of uploaded) await drop(k); };

    for (let i = 0; i < n; i++) {
      const title = clean(titles[i], 120), kicker = clean(kickers[i], 80), deck = clean(decks[i], 400);
      const file = files[i];
      const hasFile = file instanceof File && file.size > 0;
      if (!title && !kicker && !deck && !hasFile) continue; // diapositiva nueva en blanco
      if (!title) { await rollback(); return go(`El titular ${i + 1} no puede estar vacío.`); }

      let image: string | null = null;
      const prev = clean(keys[i], 200);
      if (prev && oldKeys.has(prev) && String(modes[i] ?? 'keep') !== 'remove') image = prev; // solo claves ya guardadas
      if (hasFile) {
        if (file.size > MAX_IMAGE) { await rollback(); return go(`La imagen del titular ${i + 1} supera 3 MB.`); }
        const buf = new Uint8Array(await file.arrayBuffer());
        const img = sniffImage(buf); // tipo real por firma, no por extensión
        if (!img) { await rollback(); return go(`La imagen del titular ${i + 1} debe ser JPG, PNG o WebP.`); }
        const key = `hero/${crypto.randomUUID()}.${img.ext}`;
        try { await putObject(db, key, buf, img.type); }
        catch { await rollback(); return go('Error al guardar la imagen. Inténtalo de nuevo.'); }
        uploaded.push(key); image = key;
      }
      slides.push({ kicker, title, deck, imageAlt: clean(alts[i], 160), caption: clean(caps[i], 140), image });
    }
    if (!slides.length) return go('Debe haber al menos un titular.');

    const { error } = await db.from('site_settings').upsert({ key: 'hero', value: { slides }, updated_at: new Date().toISOString() });
    if (error) {
      await rollback();
      if (error.code === 'PGRST205' || /site_settings/.test(error.message)) return go('Falta la tabla site_settings: ejecuta supabase/migrations/0005b_site_settings_solo.sql en el SQL Editor de Supabase.');
      return go(error.code === '42501' ? 'Sin permiso.' : `Error: ${error.message}`);
    }
    const keep = new Set(slides.map((s) => s.image as string | null).filter(Boolean) as string[]);
    for (const k of oldKeys) if (!keep.has(k)) await drop(k); // solo tras guardar con éxito
  } else if (intent === 'reset') {
    const { error } = await db.from('site_settings').delete().eq('key', 'hero');
    if (error) return go(`Error: ${error.message}`);
    for (const k of oldKeys) await drop(k);
  } else return go('Acción no válida.');

  try { await (globalThis as any).caches?.default?.delete(new URL('/', request.url).href); } catch { /* caché de borde: opcional */ }
  return go(intent === 'save' ? 'Portada guardada. Ya está en la web.' : 'Titulares y fotos originales restablecidos.', true); // ok=1: el navegador borra el borrador automático
};
