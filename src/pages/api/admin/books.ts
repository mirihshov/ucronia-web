import type { APIRoute } from 'astro';
import { parseBookForm, slugify } from '../../../lib/admin';
import { validateEpub } from '../../../lib/epub';
import { sha256Hex, sniffImage } from '../../../lib/storage';
import { notifyBackup } from '../../../lib/backup';

const MAX_COVER = 2 * 1024 * 1024;
const go = (to: string, msg: string) =>
  new Response(null, { status: 303, headers: { Location: `${to}${to.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` } });
const isFile = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

// El middleware ya exigió admin; RLS lo vuelve a comprobar en cada consulta.
export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.admin!.client;
  const env = (locals as any).runtime?.env;
  const bucket = env?.BUCKET;
  const f = await request.formData();
  const intent = String(f.get('intent') ?? '');
  const id = String(f.get('id') ?? '');
  const fail = (e: { code?: string; message: string }) =>
    go('/admin', e.code === '42501' ? 'Sin permiso.' : `Error: ${e.message}`);
  const removeObjects = async (keys: (string | null | undefined)[]) => {
    const list = keys.filter((k): k is string => !!k);
    if (!list.length || !bucket) return true;
    try { await bucket.delete(list); return true; } catch { return false; }
  };

  if (intent === 'save') {
    const back = id ? `/admin/libros/${id}` : '/admin/libros/nuevo';
    const p = parseBookForm(f);
    if ('error' in p) return go(back, p.error);
    const epub = f.get('epub'), cover = f.get('cover');
    const hasEpub = isFile(epub), hasCover = isFile(cover);
    if (!id && !hasEpub) return go(back, 'Debes adjuntar un archivo EPUB.');
    if ((hasEpub || hasCover) && !bucket) return go(back, 'Almacenamiento (R2) no configurado.');

    let old: { epub_key: string | null; cover_key: string | null } | null = null;
    if (id) {
      const { data } = await db.from('books').select('epub_key,cover_key').eq('id', id).maybeSingle();
      if (!data) return go('/admin', 'Libro no encontrado.');
      old = data;
    }

    const patch: Record<string, unknown> = { ...p.row };
    const uploaded: string[] = [];
    try {
      if (hasEpub) {
        const max = (Number(env?.MAX_EPUB_MB) || 15) * 1048576;
        if (epub.size > max) return go(back, `El EPUB supera el límite de ${Math.round(max / 1048576)} MB.`);
        const buf = new Uint8Array(await epub.arrayBuffer());
        const v = validateEpub(buf);
        if (!v.ok) return go(back, v.error);
        // Plan gratuito de Cloudflare: 10 ms de CPU por petición. Hashear un EPUB grande aquí lo agotaría,
        // así que, pasado cierto tamaño, se usa la huella calculada por el navegador del admin (si no llega, se calcula aquí).
        const given = String(f.get('epub_sha256') ?? '').toLowerCase();
        const sha = epub.size > 3 * 1048576 && /^[0-9a-f]{64}$/.test(given) ? given : await sha256Hex(buf);
        const { data: dup } = await db.from('books').select('id,title').eq('epub_sha256', sha).maybeSingle();
        if (dup && dup.id !== id) return go(back, `Ese EPUB ya existe en el catálogo: «${dup.title}».`);
        const key = `epub/${crypto.randomUUID()}.epub`;
        await bucket.put(key, buf, { httpMetadata: { contentType: 'application/epub+zip' }, customMetadata: { sha256: sha } });
        uploaded.push(key);
        Object.assign(patch, { epub_key: key, epub_size: buf.byteLength, epub_sha256: sha });
      }
      if (hasCover) {
        if (cover.size > MAX_COVER) return go(back, 'La portada supera 2 MB.');
        const buf = new Uint8Array(await cover.arrayBuffer());
        const img = sniffImage(buf);
        if (!img) return go(back, 'La portada debe ser JPG, PNG o WebP.');
        const key = `covers/${crypto.randomUUID()}.${img.ext}`;
        await bucket.put(key, buf, { httpMetadata: { contentType: img.type } });
        uploaded.push(key);
        patch.cover_key = key;
      }
    } catch {
      await removeObjects(uploaded);
      return go(back, 'Error al guardar en el almacenamiento. Inténtalo de nuevo.');
    }

    const dbError = async (e: { code?: string; message: string }) => {
      await removeObjects(uploaded); // sin huérfanos si la base falla
      return e.code === '23505' && e.message.includes('epub_sha256')
        ? go(back, 'Ese EPUB ya existe en el catálogo.') : fail(e);
    };

    let savedId = id;
    if (id) {
      const { error } = await db.from('books').update(patch).eq('id', id);
      if (error) return dbError(error);
    } else {
      const base = slugify(p.row.title);
      let done = false;
      for (let i = 0; i < 4 && !done; i++) {
        const slug = i ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
        const { data, error } = await db.from('books').insert({ ...patch, slug }).select('id').single();
        if (!error) { savedId = data.id; done = true; }
        else if (!(error.code === '23505' && error.message.includes('slug'))) return dbError(error);
      }
      if (!done) { await removeObjects(uploaded); return go(back, 'No se pudo generar un slug único.'); }
    }
    // Solo tras guardar con éxito se borran los archivos reemplazados.
    if (old) await removeObjects([hasEpub ? old.epub_key : null, hasCover ? old.cover_key : null]);
    notifyBackup(locals);
    return go(`/admin/libros/${savedId}`, id ? 'Cambios guardados.' : 'Libro creado como borrador. Ya puedes publicarlo.');
  }

  if (!id) return go('/admin', 'Falta el libro.');

  if (intent === 'publish') {
    const { data } = await db.from('books').select('epub_key').eq('id', id).maybeSingle();
    if (!data?.epub_key) return go('/admin', 'No se puede publicar un libro sin EPUB.');
  }
  const patches: Record<string, object> = {
    publish: { published: true }, unpublish: { published: false },
    feature: { featured: true }, unfeature: { featured: false },
  };
  if (intent in patches) {
    const { error } = await db.from('books').update(patches[intent]).eq('id', id);
    if (error) return fail(error);
    notifyBackup(locals);
    return go('/admin', 'Actualizado.');
  }

  if (intent === 'delete') {
    const { data } = await db.from('books').select('epub_key,cover_key').eq('id', id).maybeSingle();
    const { error } = await db.from('books').delete().eq('id', id);
    if (error) return fail(error);
    notifyBackup(locals);
    const clean = await removeObjects([data?.epub_key, data?.cover_key]);
    return go('/admin', clean ? 'Libro y archivos eliminados.' : 'Libro eliminado, pero no se pudieron borrar sus archivos de R2.');
  }
  return go('/admin', 'Acción no válida.');
};
