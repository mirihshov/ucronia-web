-- Solo la tabla de ajustes de la portada (si 0005 no se pudo ejecutar completa). Se puede repetir sin problema.
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
notify pgrst, 'reload schema';
