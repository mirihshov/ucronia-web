import type { APIRoute } from 'astro';
import { parseArticleForm, slugify } from '../../../lib/admin';
import { putObject, removeObjects as removeFiles, sniffImage } from '../../../lib/storage';

const MAX_COVER = 3 * 1024 * 1024;
const go = (to: string, msg: string) =>
  new Response(null, { status: 303, headers: { Location: `${to}${to.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` } });
const isFile = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

// El middleware ya exigió admin; RLS (is_admin) lo vuelve a comprobar en cada consulta.
export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client;
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');
  const id = String(f.get('id') ?? '');
  const fail = (e: { code?: string; message: string }, to = '/admin/articulos') =>
    go(to, e.code === '42501' ? 'Sin permiso.'
      : e.code === '42P01' ? 'Falta ejecutar la migración 0008_articulos.sql en Supabase.'
      : e.code === '42703' || e.code === 'PGRST204' ? 'Falta ejecutar la migración 0009_articulos_portada.sql en Supabase.'
      : `Error: ${e.message}`);

  if (intent === 'save') {
    const back = id ? `/admin/articulos/${id}` : '/admin/articulos/nuevo';
    const p = parseArticleForm(f);
    if ('error' in p) return go(back, p.error);

    const cover = f.get('cover');
    const hasCover = isFile(cover);
    const dropCover = f.get('remove_cover') === '1' && !hasCover;
    let oldCover: string | null = null;
    if (id) {
      const { data, error } = await db.from('articles').select('cover_key').eq('id', id).maybeSingle();
      if (error) return fail(error, back);
      if (!data) return go('/admin/articulos', 'Artículo no encontrado.');
      oldCover = data.cover_key;
    }

    const row: Record<string, unknown> = { ...p.row };
    const uploaded: string[] = [];
    try {
      if (hasCover) {
        if (cover.size > MAX_COVER) return go(back, 'La portada supera 3 MB.');
        const buf = new Uint8Array(await cover.arrayBuffer());
        const img = sniffImage(buf);
        if (!img) return go(back, 'La portada debe ser JPG, PNG o WebP.');
        const key = `covers/${crypto.randomUUID()}.${img.ext}`;
        await putObject(db, key, buf, img.type);
        uploaded.push(key);
        row.cover_key = key;
      } else if (dropCover) row.cover_key = null;
    } catch {
      await removeFiles(db, uploaded);
      return go(back, 'Error al guardar la portada en el almacenamiento. Inténtalo de nuevo.');
    }

    let savedId = id;
    if (id) {
      const { error } = await db.from('articles').update(row).eq('id', id);
      if (error) { await removeFiles(db, uploaded); return fail(error, back); }
    } else {
      const base = slugify(p.row.title, 'articulo');
      let done = false;
      for (let i = 0; i < 4 && !done; i++) {
        const slug = i ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
        const { data, error } = await db.from('articles').insert({ ...row, slug }).select('id').single();
        if (!error) { savedId = data.id; done = true; }
        else if (!(error.code === '23505' && error.message.includes('slug'))) { await removeFiles(db, uploaded); return fail(error, back); }
      }
      if (!done) { await removeFiles(db, uploaded); return go(back, 'No se pudo generar un slug único.'); }
    }
    // Solo tras guardar con éxito se borra la portada reemplazada o quitada.
    if (hasCover || dropCover) await removeFiles(db, [oldCover]);
    return go(`/admin/articulos/${savedId}`, id ? 'Cambios guardados.' : 'Artículo creado como borrador. Ya puedes publicarlo.');
  }

  if (!id) return go('/admin/articulos', 'Falta el artículo.');
  const patches: Record<string, object> = { publish: { published: true }, unpublish: { published: false } };
  if (intent in patches) {
    const { error } = await db.from('articles').update(patches[intent]).eq('id', id);
    return error ? fail(error) : go('/admin/articulos', 'Actualizado.');
  }
  if (intent === 'delete') {
    const { data } = await db.from('articles').select('cover_key').eq('id', id).maybeSingle();
    const { error } = await db.from('articles').delete().eq('id', id);
    if (error) return fail(error);
    await removeFiles(db, [data?.cover_key]);
    return go('/admin/articulos', 'Artículo eliminado.');
  }
  return go('/admin/articulos', 'Acción no válida.');
};
