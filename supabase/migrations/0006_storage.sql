-- Supabase Storage en lugar de Cloudflare R2. Ejecutar una vez en el SQL Editor de Supabase (se puede repetir sin problema).
--
-- Bucket PRIVADO `ucronia-libros`: sin URL pública. Los archivos se entregan solo a través de la web
-- (/descargar/[slug], /portadas/…, /media/…), que los lee con la clave anónima + RLS. No hay ninguna clave secreta en el código.
--   epub/…    EPUB de los libros
--   covers/…  portadas de los libros
--   hero/…    fotos de la portada del sitio

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ucronia-libros', 'ucronia-libros', false, 20971520,
        array['application/epub+zip', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,                                  -- siempre privado
      file_size_limit = excluded.file_size_limit,      -- 20 MB (el panel limita los EPUB a MAX_EPUB_MB)
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura (anónimos y sesiones): portadas y fotos, y SOLO los EPUB de libros publicados.
drop policy if exists ucronia_lectura_publica on storage.objects;
create policy ucronia_lectura_publica on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'ucronia-libros'
    and (
      name like 'covers/%'
      or name like 'hero/%'
      or exists (
        select 1 from public.books b
        where b.epub_key = storage.objects.name and b.published
      )
    )
  );

-- Administradores (tabla `admins`): leer todo, subir, reemplazar y borrar. Nadie más puede escribir.
drop policy if exists ucronia_admin_total on storage.objects;
create policy ucronia_admin_total on storage.objects
  for all to authenticated
  using (bucket_id = 'ucronia-libros' and public.is_admin())
  with check (bucket_id = 'ucronia-libros' and public.is_admin());
