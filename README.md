# Folio — Biblioteca digital

Astro (SSR) + Cloudflare Pages/R2 + Supabase. Solo catálogo público y descarga; la administración llega en la Fase 2.

## Puesta en marcha
1. Supabase: crea un proyecto y ejecuta `supabase/migrations/0001_init.sql` en el SQL Editor.
2. R2: crea un bucket privado (`npx wrangler r2 bucket create folio-libros`) y pon su nombre en `wrangler.toml`.
3. Copia `.env.example` a `.env` y completa las variables (`PUBLIC_COVERS_BASE_URL` ya no se usa).
4. `npm install && npm run dev`
5. Cloudflare Pages: conecta el repo, build `npm run build`, salida `dist`, variables `PUBLIC_*` y binding R2 `BUCKET`.

## Límites gratuitos (verificados nov 2026)
- R2: 10 GB, 1 M ops clase A, 10 M clase B al mes; salida gratuita.
- Supabase Free: 500 MB BD, 5 GB egress; el proyecto se pausa tras 7 días sin actividad (se mitiga con un ping programado, Fase 4).

## Estado
- [x] Fase 1: portada, catálogo, fichas, buscador, categorías, descarga desde R2
- [x] Fase 2: panel `/admin`, login, permisos, CRUD de fichas y categorías
  - Supabase → Authentication → Sign In: desactiva «Allow new users to sign up».
  - Crea tu usuario en Authentication → Users → Add user (auto-confirm), y ejecuta:
    `insert into admins (user_id) select id from auth.users where email = 'tu@correo';`
  - Ejecuta `supabase/migrations/0002_constraints.sql`.
- [x] Fase 3: subida/validación de EPUB y portadas (R2)
  - Ejecuta `supabase/migrations/0003_publish_needs_epub.sql`.
  - Bucket R2 **privado** único (`folio-libros`): EPUB en `epub/`, portadas en `covers/` (se sirven por `/portadas/…`).
  - Límite configurable: `MAX_EPUB_MB` en `wrangler.toml`. Pruebas: `npm run test:epub`.
- [x] Fase 4: respaldo en GitHub (repo aparte `folio-backup`; ver su README)
  - Ejecuta `supabase/migrations/0004_sync_log.sql`.
  - `wrangler.toml`: pon `GITHUB_BACKUP_REPO = "usuario/folio-backup"`. Secreto: `npx wrangler pages secret put GITHUB_DISPATCH_TOKEN` (local: `.dev.vars`).
- [x] Rediseño: diseño de Figma Make «Biblioteca Digital Blanco y Negro» portado, marca «Biblioteca Ucronía» (textos y marca en `src/lib/site.ts`)
- [x] Fase 5: rendimiento (fuentes autoalojadas, caché de borde 60 s), SEO (sitemap.xml, robots.txt, Open Graph, JSON-LD), seguridad (CSP, HSTS, no-store en /admin), pruebas
  - `npm run test:epub` (validador) · `npm run test:smoke` (páginas y protección de /admin con Supabase simulado)
  - Imagen del hero: remota (Unsplash) como en Figma; mejor descargarla a `public/` y cambiar `heroImage`.

## Portada editable y buscador
- Ejecuta `supabase/migrations/0005_search_and_settings.sql` (búsqueda sin acentos + tabla `site_settings`). Si el guardado de la portada dice «Could not find the table 'public.site_settings'», ejecuta `0005b_site_settings_solo.sql` (es repetible).
- Panel admin rediseñado con el mismo estilo del sitio (cabecera con pestañas, tarjetas en móvil, acciones fijas al pie en formularios). Estilos: `src/styles/admin.css`.
- Admin → **Portada**: edita antetítulo, titular y bajada del inicio. «Restablecer» vuelve a los textos de `src/lib/site.ts`.
- Buscador: sugerencias en vivo (`/api/buscar`), flechas/Enter/Esc, atajo `/`, resaltado sin acentos.

## OPDS y logos
- Feed OPDS 1.2 en `/opds` (novedades, destacados, categorías, todo, búsqueda). En KOReader/Calibre: añadir catálogo con `https://TU-DOMINIO/opds`.
- Logos en `public/` (`logo-completo.svg` = texto + logo, principal en cabecera; `logo-texto.svg` = wordmark del pie; `icono.svg`; `ucronia-texto.svg`). Los SVG llevan el texto convertido a trazos (no dependen de la fuente STIX) + favicon, apple-touch-icon y `og-default.png`. Se configuran en `src/lib/site.ts`.
- Admin → Portada: hasta 6 titulares con su foto (rotan solos en el inicio; flechas a los costados, teclado ←/→ y deslizar en móvil; se detienen con el ratón encima o el foco). Las fotos se suben a R2 (`hero/`) y se sirven por `/media/…`. Sin nada guardado se usan `site.heroSlides`. Con `prefers-reduced-motion` no rotan solos.
- Manifiesto: la frase se ilumina al hacer scroll, queda anclada a la pantalla mientras pasan los principios (también en móvil, bajo la cabecera) y el principio activo se resalta (`src/scripts/motion.ts` + bloque «Manifiesto con movimiento» de `global.css`).

## Pie de página editable
- Fondo negro: logo + frase + redes (iconos) y hasta 4 columnas (título, texto libre con correos enlazados solos, hasta 5 enlaces cada una) y línea inferior con el año.
- Admin → **Pie de página**. «Restablecer» vuelve a las columnas por defecto de `src/lib/site.ts` (`footerColumns`). Las redes no tienen valores por defecto: solo se muestran las que se configuren.
- Se guarda en `site_settings` (clave `footer`; requiere `0005b_site_settings_solo.sql`). Admite el formato anterior (lista de enlaces). Pruebas: `npm run test:footer`.

## Despliegue
Guía completa en **DEPLOY.md** (Cloudflare Pages + R2 + Supabase). Prueba local en el entorno de Cloudflare: `npm run build && npx wrangler pages dev dist`.
