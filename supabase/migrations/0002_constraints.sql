-- Fase 2: restricciones en la base (segunda línea de defensa frente a la validación del backend)
alter table books add constraint books_title_len check (char_length(title) between 1 and 300);
alter table books add constraint books_author_len check (char_length(author) between 1 and 200);
alter table books add constraint books_year_range check (year is null or year between 0 and 2100);
alter table categories add constraint categories_name_unique unique (name);
