import type { APIRoute } from 'astro';
import { parseFooterForm } from '../../../lib/footer-form';

const go = (msg: string) =>
  new Response(null, { status: 303, headers: { Location: `/admin/pie?msg=${encodeURIComponent(msg)}` } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client; // sesión admin; RLS lo comprueba otra vez en la base
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');

  let error: { code?: string; message: string } | null = null;
  if (intent === 'save') {
    const p = parseFooterForm(f);
    if ('error' in p) return go(p.error);
    ({ error } = await db.from('site_settings').upsert({ key: 'footer', value: p.value, updated_at: new Date().toISOString() }));
  } else if (intent === 'reset') {
    ({ error } = await db.from('site_settings').delete().eq('key', 'footer'));
  } else return go('Acción no válida.');

  if (error) {
    if (error.code === 'PGRST205' || /site_settings/.test(error.message)) return go('Falta la tabla site_settings: ejecuta supabase/migrations/0005b_site_settings_solo.sql en el SQL Editor de Supabase.');
    return go(error.code === '42501' ? 'Sin permiso.' : `Error: ${error.message}`);
  }
  try { await (globalThis as any).caches?.default?.delete(new URL('/', request.url).href); } catch { /* caché de borde: opcional */ }
  return go(intent === 'save' ? 'Pie de página guardado. Ya está en la web.' : 'Pie de página original restablecido.');
};
