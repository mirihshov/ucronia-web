# Folio — Biblioteca digital

Astro (SSR) + Cloudflare Pages (solo la web) + Supabase (base de datos, autenticación y **Storage** para los archivos). Solo catálogo público y descarga; la administración llega en la Fase 2.

## Puesta en marcha
1. Supabase: crea un proyecto y ejecuta `supabase/migrations/0001_init.sql` en el SQL Editor.
2. Archivos: ejecuta también `supabase/migrations/0006_storage.sql`. Crea el bucket **privado** `ucronia-libros` en Supabase Storage y las políticas RLS (solo los admins escriben; el público solo lee portadas, fotos y los EPUB de libros publicados). No hace falta ningún servicio adicional ni clave secreta.
3. Copia `.env.example` a `.env` y completa las variables (`PUBLIC_COVERS_BASE_URL` ya no se usa).
4. `npm install && npm run dev`
5. Cloudflare Pages: conecta el repo, build `npm run build`, salida `dist`, variables `PUBLIC_*`. No hay bindings de almacenamiento.

## Límites gratuitos (verificados nov 2026)
- Supabase Storage (Free): **1 GB** de archivos en total, 50 MB máx. por archivo (el bucket limita a 20 MB y el panel a `MAX_EPUB_MB`), y 5 GB de egress + 5 GB en caché al mes. Si se supera un límite, el plan gratuito deja de servir peticiones (error 402) hasta el siguiente ciclo o hasta pasar a Pro: vigila *Settings → Usage*. Las descargas de EPUB se cachean 1 h en el borde de Cloudflare para gastar menos egress.
- Supabase Free: 500 MB BD, 5 GB egress; el proyecto se pausa tras 7 días sin actividad (se mitiga con un ping programado, Fase 4).

## Estado
- [x] Fase 1: portada, catálogo, fichas, buscador, categorías, descarga desde Supabase Storage
- [x] Fase 2: panel `/admin`, login, permisos, CRUD de fichas y categorías
  - Supabase → Authentication → Sign In: desactiva «Allow new users to sign up».
  - Crea tu usuario en Authentication → Users → Add user (auto-confirm), y ejecuta:
    `insert into admins (user_id) select id from auth.users where email = 'tu@correo';`
  - Ejecuta `supabase/migrations/0002_constraints.sql`.
- [x] Fase 3: subida/validación de EPUB y portadas (Supabase Storage)
  - Ejecuta `supabase/migrations/0003_publish_needs_epub.sql`.
  - Bucket **privado** único (`ucronia-libros`, migración `0006_storage.sql`): EPUB en `epub/`, portadas en `covers/` (se sirven por `/portadas/…`) y fotos de la portada en `hero/` (`/media/…`). Los EPUB solo salen por `/descargar/[slug]`.
  - Permisos (RLS en `storage.objects`): escribir, reemplazar y borrar solo si `is_admin()`; leer, `anon` solo `covers/`, `hero/` y los EPUB cuyo libro está publicado. Si despublicas un libro, su EPUB deja de ser legible.
  - Si ya tenías archivos en R2: `npm run migrar:r2` (opcional, ver DEPLOY.md). Las claves no cambian, así que la base de datos tampoco.
  - Límite configurable: `MAX_EPUB_MB` en `wrangler.toml`. Pruebas: `npm run test:epub`.
- [x] Fase 4: respaldo en GitHub (repo aparte `folio-backup`; ver su README)
  - Ejecuta `supabase/migrations/0004_sync_log.sql`.
  - `wrangler.toml`: pon `GITHUB_BACKUP_REPO = "usuario/folio-backup"`. Secreto: `npx wrangler pages secret put GITHUB_DISPATCH_TOKEN` (local: `.dev.vars`).
- [x] Rediseño: diseño de Figma Make «Biblioteca Digital Blanco y Negro» portado, marca «Biblioteca Ucronía» (textos y marca en `src/lib/site.ts`)
- [x] Fase 5: rendimiento (fuentes autoalojadas, caché de borde 60 s), SEO (sitemap.xml, robots.txt, Open Graph, JSON-LD), seguridad (CSP, HSTS, no-store en /admin), pruebas
  - `npm run test:epub` (validador) · `npm run test:storage` (capa de Storage con cliente simulado) · `npm run test:smoke` (páginas y protección de /admin con Supabase simulado)
  - Imagen del hero: remota (Unsplash) como en Figma; mejor descargarla a `public/` y cambiar `heroImage`.

## Portada editable y buscador
- Ejecuta `supabase/migrations/0005_search_and_settings.sql` (búsqueda sin acentos + tabla `site_settings`). Si el guardado de la portada dice «Could not find the table 'public.site_settings'», ejecuta `0005b_site_settings_solo.sql` (es repetible).
- Panel admin rediseñado con el mismo estilo del sitio (cabecera con pestañas, tarjetas en móvil, acciones fijas al pie en formularios). Estilos: `src/styles/admin.css`.
- Admin → **Portada**: edita antetítulo, titular y bajada del inicio. «Restablecer» vuelve a los textos de `src/lib/site.ts`.
- Buscador: sugerencias en vivo (`/api/buscar`), flechas/Enter/Esc, atajo `/`, resaltado sin acentos.

## OPDS y logos
- Feed OPDS 1.2 en `/opds` (novedades, destacados, categorías, todo, búsqueda). En KOReader/Calibre: añadir catálogo con `https://TU-DOMINIO/opds`.
- Logos en `public/` (`logo-completo.svg` = texto + logo, principal en cabecera; `logo-texto.svg` = wordmark del pie; `icono.svg`; `ucronia-texto.svg`). Los SVG llevan el texto convertido a trazos (no dependen de la fuente STIX) + favicon, apple-touch-icon y `og-default.png`. Se configuran en `src/lib/site.ts`.
- Admin → Portada: hasta 6 titulares con su foto (rotan solos en el inicio; flechas a los costados, teclado ←/→ y deslizar en móvil; se detienen con el ratón encima o el foco). Las fotos se suben a Supabase Storage (`hero/`) y se sirven por `/media/…`. Sin nada guardado se usan `site.heroSlides`. Con `prefers-reduced-motion` no rotan solos.
- Manifiesto: la frase se ilumina al hacer scroll, queda anclada a la pantalla mientras pasan los principios (también en móvil, bajo la cabecera) y el principio activo se resalta (`src/scripts/motion.ts` + bloque «Manifiesto con movimiento» de `global.css`).

## Pie de página editable
- Fondo negro: logo + frase + redes (iconos) y hasta 4 columnas (título, texto libre con correos enlazados solos, hasta 5 enlaces cada una) y línea inferior con el año.
- Admin → **Pie de página**. «Restablecer» vuelve a las columnas por defecto de `src/lib/site.ts` (`footerColumns`). Las redes no tienen valores por defecto: solo se muestran las que se configuren.
- Se guarda en `site_settings` (clave `footer`; requiere `0005b_site_settings_solo.sql`). Admite el formato anterior (lista de enlaces). Pruebas: `npm run test:footer`.

## «Acerca del proyecto» editable
- Admin → **Acerca de**: título de la página y hasta 12 secciones (añadir, ordenar con ↑↓, quitar). Cada sección tiene título, texto y un **ancla** (`/acerca#ancla`); si se deja en blanco se genera del título. Las anclas por defecto (`proyecto`, `criterios`, `opds`, `contacto`, `legal`) son las que enlaza el pie de página: conviene no cambiarlas.
- Texto: línea en blanco = párrafo nuevo; correos y direcciones `https://…` se enlazan solos; `[texto](/ruta)` también; marcadores `{nombre}`, `{correo}` y `{origen}`. Solo se aceptan enlaces `/ruta`, `https://` y `mailto:` (nunca `javascript:`), y todo se escapa al mostrarlo (no se admite HTML).
- «Restablecer» vuelve a los textos de `src/lib/site.ts` (`aboutTitle`, `aboutSections`). Se guarda en `site_settings` (clave `about`; no necesita migración nueva). Pruebas: `npm run test:about`.

## Vista previa del EPUB
- En la ficha de cada libro, junto a «Descargar EPUB», el botón **Vista previa** abre una ventana con el comienzo del libro (solo texto, sin imágenes). Nunca muestra el EPUB completo: tope de ~5.000 caracteres (≈800 palabras) y, en libros cortos, como mucho el 25 % del contenido; los libros diminutos no tienen vista previa.
- Se salta portada, índice, créditos y páginas casi vacías, y se corta en una frase completa. `GET /vista-previa/[slug]` devuelve JSON, solo para libros publicados, con caché de borde de 1 h; el texto se pinta con `textContent` (sin HTML). Código: `src/lib/epub-preview-parse.ts` (lógica pura), `src/lib/epub-preview.ts` (lectura del ZIP con fflate), `src/scripts/preview.ts` (ventana) y estilos al final de `global.css`. El tope se cambia en `PREVIEW_MAX_CHARS`. Pruebas: `npm run test:preview`.

## Despliegue
Guía completa en **DEPLOY.md** (Cloudflare Pages + Supabase). Prueba local en el entorno de Cloudflare: `npm run build && npx wrangler pages dev dist`.
