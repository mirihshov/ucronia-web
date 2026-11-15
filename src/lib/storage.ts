import type { SupabaseClient } from '@supabase/supabase-js';

/** Bucket PRIVADO de Supabase Storage. Se crea con supabase/migrations/0006_storage.sql, que también define las políticas RLS.
 *  Claves: `epub/…` (libros), `covers/…` (portadas de libros) y `hero/…` (fotos de la portada del sitio). */
export const BUCKET = 'ucronia-libros';
const store = (client: SupabaseClient) => client.storage.from(BUCKET);

/** Sube un objeto con la identidad de `client` (los admins; RLS exige is_admin()). Lanza si falla. Nunca sobrescribe. */
export async function putObject(client: SupabaseClient, key: string, data: Uint8Array | ArrayBuffer, contentType: string): Promise<void> {
  const { error } = await store(client).upload(key, data, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
}

/** Borra objetos (solo admins). Devuelve false si Storage respondió con error; una lista vacía cuenta como éxito. */
export async function removeObjects(client: SupabaseClient, keys: (string | null | undefined)[]): Promise<boolean> {
  const list = keys.filter((k): k is string => !!k);
  if (!list.length) return true;
  try {
    const { error } = await store(client).remove(list);
    return !error;
  } catch {
    return false;
  }
}

/** Lee un objeto con la identidad de `client`. Con el cliente anónimo, RLS solo deja ver portadas, fotos y EPUB de libros publicados. */
export async function getObject(client: SupabaseClient, key: string): Promise<{ blob: Blob; size: number; type: string } | null> {
  try {
    const { data, error } = await store(client).download(key);
    if (error || !data) return null;
    return { blob: data, size: data.size, type: data.type };
  } catch {
    return null;
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Detecta el tipo real por firma (no confía en la extensión ni en el Content-Type del cliente). */
export function sniffImage(b: Uint8Array): { ext: 'jpg' | 'png' | 'webp'; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' };
  return null;
}
