-- Fase 9: portada (imagen) opcional para los artículos. Ejecutar DESPUÉS de 0008_articulos.sql (se puede repetir).
-- La imagen se guarda en el mismo bucket que las portadas de libros (`covers/…`), que ya es de lectura pública.
alter table articles add column if not exists cover_key text;
alter table articles add column if not exists cover_caption text;   -- pie de foto o crédito (opcional)
notify pgrst, 'reload schema';
