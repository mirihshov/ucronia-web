-- Folio: esquema inicial. Ejecutar en el SQL Editor de Supabase.
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  position int not null default 0
);

create table books (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  author text not null,
  description text,
  publisher text,
  year int,
  language text not null default 'es',
  category_id uuid references categories(id) on delete set null,
  tags text[] not null default '{}',
  cover_key text,                 -- clave del objeto en Supabase Storage (portadas)
  epub_key text unique,           -- clave del objeto en Supabase Storage (EPUB)
  epub_size bigint,
  epub_sha256 text unique,        -- control de duplicados
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index books_published_created on books (published, created_at desc);
create index books_category on books (category_id);

create table admins (user_id uuid primary key references auth.users(id) on delete cascade);

create function is_admin() returns boolean
  language sql security definer stable set search_path = public
  as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger books_touch before update on books for each row execute function touch_updated_at();

alter table categories enable row level security;
alter table books enable row level security;
alter table admins enable row level security;  -- sin políticas: solo is_admin() la consulta

create policy categories_read on categories for select using (true);
create policy categories_admin on categories for all using (is_admin()) with check (is_admin());
create policy books_read on books for select using (published);
create policy books_admin on books for all using (is_admin()) with check (is_admin());

insert into categories (slug, name, position) values
 ('literatura','Literatura',1),('filosofia','Filosofía',2),('historia','Historia',3),
 ('ciencia','Ciencia',4),('poesia','Poesía',5),('ensayo','Ensayo',6),
 ('novela','Novela',7),('otros','Otros géneros',8);
