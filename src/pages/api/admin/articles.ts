import type { APIRoute } from 'astro';
import { parseArticleForm, slugify } from '../../../lib/admin';

const go = (to: string, msg: string) =>
  new Response(null, { status: 303, headers: { Location: `${to}${to.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` } });

// El middleware ya exigió admin; RLS (is_admin) lo vuelve a comprobar en cada consulta.
export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client;
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');
  const id = String(f.get('id') ?? '');
  const fail = (e: { code?: string; message: string }, to = '/admin/articulos') =>
    go(to, e.code === '42501' ? 'Sin permiso.' : e.code === '42P01' ? 'Falta ejecutar la migración 0008_articulos.sql en Supabase.' : `Error: ${e.message}`);

  if (intent === 'save') {
    const back = id ? `/admin/articulos/${id}` : '/admin/articulos/nuevo';
    const p = parseArticleForm(f);
    if ('error' in p) return go(back, p.error);

    if (id) {
      const { error } = await db.from('articles').update(p.row).eq('id', id);
      if (error) return fail(error, back);
      return go(back, 'Cambios guardados.');
    }
    const base = slugify(p.row.title, 'articulo');
    for (let i = 0; i < 4; i++) {
      const slug = i ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
      const { data, error } = await db.from('articles').insert({ ...p.row, slug }).select('id').single();
      if (!error) return go(`/admin/articulos/${data.id}`, 'Artículo creado como borrador. Ya puedes publicarlo.');
      if (!(error.code === '23505' && error.message.includes('slug'))) return fail(error, back);
    }
    return go(back, 'No se pudo generar un slug único.');
  }

  if (!id) return go('/admin/articulos', 'Falta el artículo.');
  const patches: Record<string, object> = { publish: { published: true }, unpublish: { published: false } };
  if (intent in patches) {
    const { error } = await db.from('articles').update(patches[intent]).eq('id', id);
    return error ? fail(error) : go('/admin/articulos', 'Actualizado.');
  }
  if (intent === 'delete') {
    const { error } = await db.from('articles').delete().eq('id', id);
    return error ? fail(error) : go('/admin/articulos', 'Artículo eliminado.');
  }
  return go('/admin/articulos', 'Acción no válida.');
};
