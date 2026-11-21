import type { APIRoute } from 'astro';
import { parseAboutForm } from '../../../lib/about-form';

const go = (msg: string, ok = false) =>
  new Response(null, { status: 303, headers: { Location: `/admin/acerca?msg=${encodeURIComponent(msg)}${ok ? '&ok=1' : ''}` } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client; // sesión admin; RLS lo comprueba otra vez en la base
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');

  let error: { code?: string; message: string } | null = null;
  if (intent === 'save') {
    const p = parseAboutForm(f);
    if ('error' in p) return go(p.error);
    ({ error } = await db.from('site_settings').upsert({ key: 'about', value: p.value, updated_at: new Date().toISOString() }));
  } else if (intent === 'reset') {
    ({ error } = await db.from('site_settings').delete().eq('key', 'about'));
  } else return go('Acción no válida.');

  if (error) {
    if (error.code === 'PGRST205' || /site_settings/.test(error.message)) return go('Falta la tabla site_settings: ejecuta supabase/migrations/0005b_site_settings_solo.sql en el SQL Editor de Supabase.');
    return go(error.code === '42501' ? 'Sin permiso.' : `Error: ${error.message}`);
  }
  try { await (globalThis as any).caches?.default?.delete(new URL('/acerca', request.url).href); } catch { /* caché de borde: opcional */ }
  return go(intent === 'save' ? 'Acerca del proyecto guardado. Ya está en la web.' : 'Texto original de «Acerca del proyecto» restablecido.', true); // ok=1: el navegador borra el borrador automático
};
