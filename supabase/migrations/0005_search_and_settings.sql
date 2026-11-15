-- Fase 6: búsqueda sin acentos ni mayúsculas + textos editables de la portada.

-- 1) Búsqueda: columna derivada (título, autor, editorial, etiquetas y categoría), sin acentos.
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

-- Si se renombra una categoría, se recalcula la búsqueda de sus libros.
create or replace function categories_touch_books() returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name then update books set title = title where category_id = new.id; end if;
  return new;
end $$;
drop trigger if exists categories_rename on categories;
create trigger categories_rename after update on categories for each row execute function categories_touch_books();

update books set title = title; -- rellena los libros existentes

-- 2) Ajustes del sitio (titulares de la portada). Lectura pública, escritura solo admins.
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
drop policy if exists settings_read on site_settings;
drop policy if exists settings_admin on site_settings;
create policy settings_read on site_settings for select using (true);
create policy settings_admin on site_settings for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema'; -- que la API vea la tabla nueva sin esperar
