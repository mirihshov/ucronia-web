-- Fase 4: registro de la última sincronización con el respaldo (una sola fila).
create table sync_log (
  id int primary key default 1 check (id = 1),
  synced_at timestamptz not null default now(),
  status text not null,
  detail text,
  books_count int,
  categories_count int
);
alter table sync_log enable row level security;
create policy sync_log_admin on sync_log for all using (is_admin()) with check (is_admin());
