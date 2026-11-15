-- Fase 3: un libro publicado debe tener EPUB (también garantizado en la base).
update books set published = false where published and epub_key is null;
alter table books add constraint books_published_needs_epub check (not published or epub_key is not null);
