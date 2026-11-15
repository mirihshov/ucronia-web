// OPCIONAL y de un solo uso: copia a Supabase Storage los archivos que ya tenías en Cloudflare R2.
// Solo hace falta si el catálogo ya tenía libros/portadas/fotos subidos antes del cambio. Las claves (epub/…, covers/…, hero/…) se
// conservan, así que la base de datos NO cambia. No usa ninguna clave secreta: entra como administrador (RLS) y lee R2 con wrangler.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=… ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run migrar:r2 -- --dry   # solo lista
//   … npm run migrar:r2                                                                                                   # copia
//   (R2_BUCKET=nombre-del-bucket-r2 si no se llama ucronia-libros; requiere `npx wrangler login` previo)
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, R2_BUCKET = 'ucronia-libros' } = process.env;
const dry = process.argv.includes('--dry');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL o ADMIN_PASSWORD.'); process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: authError } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (authError) { console.error('No se pudo iniciar sesión:', authError.message); process.exit(1); }
if ((await db.rpc('is_admin')).data !== true) { console.error('Ese usuario no está en la tabla admins.'); process.exit(1); }

// Claves referenciadas por la base de datos.
const keys = new Set();
const { data: books } = await db.from('books').select('epub_key,cover_key');
for (const b of books ?? []) for (const k of [b.epub_key, b.cover_key]) if (k) keys.add(k);
const { data: hero } = await db.from('site_settings').select('value').eq('key', 'hero').maybeSingle();
for (const k of [hero?.value?.image, ...(hero?.value?.slides ?? []).map((s) => s?.image)]) if (k) keys.add(k);

const TYPES = { epub: 'application/epub+zip', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const tmp = mkdtempSync(join(tmpdir(), 'r2-'));
let copied = 0, skipped = 0, failed = 0;
for (const key of [...keys].sort()) {
  if (dry) { console.log('•', key); continue; }
  try {
    const file = join(tmp, 'obj');
    execFileSync('npx', ['wrangler', 'r2', 'object', 'get', `${R2_BUCKET}/${key}`, '--file', file, '--remote'], { stdio: 'pipe' });
    const { error } = await db.storage.from('ucronia-libros').upload(key, readFileSync(file), {
      contentType: TYPES[key.split('.').pop()] ?? 'application/octet-stream', upsert: false, cacheControl: '31536000' });
    if (!error) { copied++; console.log('OK   ', key); }
    else if (/already exists|duplicate/i.test(error.message)) { skipped++; console.log('YA ESTÁ', key); }
    else { failed++; console.log('FALLO', key, '→', error.message); }
  } catch (e) { failed++; console.log('FALLO', key, '→ no se pudo leer de R2:', String(e.message).split('\n')[0]); }
}
rmSync(tmp, { recursive: true, force: true });
console.log(dry ? `\n${keys.size} archivos referenciados (no se copió nada).` : `\nCopiados: ${copied} · ya existían: ${skipped} · fallidos: ${failed}`);
process.exit(failed ? 1 : 0);
