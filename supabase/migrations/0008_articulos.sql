-- Fase 8: artículos (textos editoriales) con sección propia en la portada. Ejecutar en el SQL Editor de Supabase (se puede repetir).
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  kicker text,                       -- tipo o sección: «Conversación», «Ensayo», «Crónica»…
  author text,
  source text,                       -- línea de edición o fuente: «Nueva Sociedad 323 / agosto 2026»
  excerpt text,                      -- resumen para la vista previa (si está vacío se usa el inicio del texto)
  body text not null default '',     -- texto con formato sencillo (ver el panel de administración)
  published boolean not null default false,
  published_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists articles_published_date on articles (published, published_at desc);

drop trigger if exists articles_touch on articles;
create trigger articles_touch before update on articles for each row execute function touch_updated_at();

alter table articles enable row level security;
drop policy if exists articles_read on articles;
create policy articles_read on articles for select using (published);
drop policy if exists articles_admin on articles;
create policy articles_admin on articles for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
