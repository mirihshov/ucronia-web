-- Fase 7: PDF opcional por libro + reparación de la búsqueda. Ejecutar en el SQL Editor de Supabase (se puede repetir sin problema).

-- 1) PDF opcional: solo los libros que tengan `pdf_key` muestran el botón de descarga en PDF.
alter table books add column if not exists pdf_key text;
alter table books add column if not exists pdf_size bigint;

-- 2) El bucket privado acepta también PDF (límite de 20 MB sin cambios).
update storage.buckets
   set allowed_mime_types = array['application/epub+zip', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'ucronia-libros';

-- 3) Lectura anónima: portadas, fotos, y SOLO los EPUB y PDF de libros publicados.
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
        where b.published and (b.epub_key = storage.objects.name or b.pdf_key = storage.objects.name)
      )
    )
  );

-- 4) Búsqueda: la web ya no depende de `search_text`, pero se deja la columna al día (por si se usa desde SQL).
create extension if not exists unaccent with schema extensions;
alter table books add column if not exists search_text text not null default '';
create or replace function books_set_search() returns trigger
  language plpgsql set search_path = public, extensions as $$
begin
  new.search_text := lower(unaccent(concat_ws(' ', new.title, new.author, new.publisher,
    array_to_string(new.tags, ' '), (select name from categories where id = new.category_id))));
  return new;
end $$;
drop trigger if exists books_search on books;
create trigger books_search before insert or update on books for each row execute function books_set_search();
update books set title = title;

notify pgrst, 'reload schema';
