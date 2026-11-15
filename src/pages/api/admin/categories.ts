import type { APIRoute } from 'astro';
import { slugify } from '../../../lib/admin';
import { notifyBackup } from '../../../lib/backup';

const go = (msg: string) =>
  new Response(null, { status: 303, headers: { Location: `/admin/categorias?msg=${encodeURIComponent(msg)}` } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client;
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');
  const id = String(f.get('id') ?? '');
  const name = String(f.get('name') ?? '').trim().slice(0, 80);
  const fail = (e: { code?: string; message: string }) =>
    go(e.code === '23505' ? 'Ya existe una categoría con ese nombre.' : e.code === '42501' ? 'Sin permiso.' : `Error: ${e.message}`);

  if (intent === 'create') {
    if (!name) return go('El nombre es obligatorio.');
    const { count } = await db.from('categories').select('id', { count: 'exact', head: true });
    const { error } = await db.from('categories').insert({ name, slug: slugify(name), position: (count ?? 0) + 1 });
    if (error) return fail(error);
    notifyBackup(locals);
    return go('Categoría creada.');
  }
  if (intent === 'rename') {
    if (!id || !name) return go('Datos incompletos.');
    const { error } = await db.from('categories').update({ name }).eq('id', id); // el slug no cambia: URLs estables
    if (error) return fail(error);
    notifyBackup(locals);
    return go('Categoría renombrada.');
  }
  if (intent === 'delete') {
    const { error } = await db.from('categories').delete().eq('id', id);
    if (error) return fail(error);
    notifyBackup(locals);
    return go('Categoría eliminada.');
  }
  return go('Acción no válida.');
};
