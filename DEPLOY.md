# Despliegue en Cloudflare Pages

Tiempo estimado: 30–40 min. Todo es gratuito (límites al final).

## 1. Supabase (si aún no lo hiciste)
1. SQL Editor → ejecuta **en orden** el contenido de `supabase/migrations/`: `0001`, `0002`, `0003`, `0004`, `0005`, `0005b` y **`0006_storage.sql`** (crea el bucket privado y sus políticas).
2. Authentication → Users → *Add user* (correo + contraseña, «auto confirm»). Luego, en el SQL Editor:
   `insert into admins (user_id) select id from auth.users where email = 'tu@correo';`
3. Authentication → Sign In / Providers → desactiva **Allow new users to sign up**.
4. Copia *Project URL* (sin `/rest/v1/`) y la clave **publishable**. Nunca uses `service_role` en la web.

## 2. Archivos (Supabase Storage)
Los archivos viven en el bucket **privado `ucronia-libros`**, que crea `0006_storage.sql` (comprueba en Supabase → Storage que aparece y que **no** dice *Public*). No necesitas ninguna cuenta ni servicio adicional.
- Escribir/borrar: solo los usuarios de la tabla `admins` (política RLS sobre `storage.objects`).
- Leer sin sesión: solo portadas (`covers/`), fotos de la portada (`hero/`) y los EPUB de libros **publicados**. Los borradores no se pueden descargar.
- Los libros se entregan solo por `/descargar/…`; el navegador nunca recibe una URL de Supabase Storage ni se usa la clave `service_role`.

**¿Ya tenías archivos en R2?** (opcional, una sola vez, desde tu equipo con `npx wrangler login` hecho)
```bash
export SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=tu_clave_publishable \
       ADMIN_EMAIL=tu@correo ADMIN_PASSWORD=tu_contraseña
npm run migrar:r2 -- --dry   # lista lo que se copiaría
npm run migrar:r2            # copia (R2_BUCKET=nombre si el bucket de R2 no se llama ucronia-libros)
```
Entra como administrador (sin claves secretas) y conserva las claves de los objetos, así que no cambia nada en la base de datos. Después puedes borrar el bucket de R2 desde el panel de Cloudflare.

## 3. Código en GitHub
```bash
cd ucro
git init -b main && git add . && git commit -m "Biblioteca Ucronía"
# crea un repositorio PRIVADO vacío en GitHub y:
git remote add origin git@github.com:TU-USUARIO/ucronia-web.git
git push -u origin main
```
`.gitignore` ya excluye `node_modules`, `dist`, `.env` y `.wrangler`.

## 4. Proyecto en Pages
Cloudflare → Workers & Pages → *Create* → **Pages** → *Connect to Git* → elige el repositorio.
- Nombre del proyecto: **`biblioteca-ucronia`** (debe coincidir con `name` en `wrangler.toml`; si está ocupado, usa otro y cámbialo allí).
- Framework preset: **Astro** · Build command: `npm run build` · Output directory: `dist`.
- *Environment variables* (Producción y Vista previa):
  - `PUBLIC_SUPABASE_URL` = tu Project URL
  - `PUBLIC_SUPABASE_ANON_KEY` = tu clave publishable
  
  Se incrustan al compilar: si las cambias, hay que volver a desplegar.
- Node: ya queda fijado en 22 por `.node-version`.

Las variables (`MAX_EPUB_MB`, `GITHUB_BACKUP_REPO`) salen de `wrangler.toml`; no se configuran en el panel. Ya no hay *bindings* de almacenamiento.

> Las vistas previas de otras ramas usan el mismo Supabase y el mismo bucket de Storage. Si no las quieres: Settings → Build → Branch control → solo `main`.

## 5. Respaldo en GitHub (opcional)
1. En `wrangler.toml` pon `GITHUB_BACKUP_REPO = "usuario/folio-backup"` y haz push.
2. Pages → Settings → Variables and secrets → *Add* → tipo **Secret** → `GITHUB_DISPATCH_TOKEN` (token fine-grained solo de ese repo, permiso *Actions: Read and write*).

## 6. Verifica
Abre `https://biblioteca-ucronia.pages.dev` y comprueba:
- `/`, `/catalogo`, `/acerca`, `/opds`, `/sitemap.xml`, `/robots.txt`.
- `/admin` → entra con tu usuario → crea un libro con un EPUB y una portada → publícalo → descárgalo desde su ficha.
- Admin → Portada, Acerca de y Pie de página: edita y revisa que se vea en la web (hasta 1 minuto).
- En un lector (KOReader, Calibre…): añade `https://TU-DOMINIO/opds`.

## 7. Dominio propio
Pages → Custom domains → *Set up a domain*. Si el dominio está en Cloudflare, el DNS se crea solo.

## Límites del plan gratuito (revisados el 15 nov 2026)
| Servicio | Límite | Qué significa aquí |
|---|---|---|
| Pages | 500 builds/mes · 20.000 archivos · 25 MiB por archivo | Sobra. |
| Pages Functions (Workers Free) | **100.000 peticiones/día** (las páginas dinámicas cuentan; los archivos estáticos no) | ≈ 70 páginas/min sostenidas. Sobra para una biblioteca pequeña o mediana. |
| Workers Free | **10 ms de CPU por petición** | Por eso el navegador calcula la huella SHA-256 del EPUB y el límite por defecto es `MAX_EPUB_MB = 15`. Si al subir un libro grande aparece el error 1102, baja el límite o pasa a Workers de pago (5 USD/mes). |
| Supabase Storage (Free) | **1 GB** de archivos en total · 50 MB por archivo · 5 GB de egress + 5 GB cacheados al mes | ≈ 200–400 libros según su peso. Pasados los límites, el plan gratuito responde 402 (también para la base de datos) hasta el siguiente ciclo. Las descargas se cachean 1 h en Cloudflare para gastar menos egress. Vigila Supabase → Settings → Usage. |
| Supabase Free | 500 MB de BD; pausa a los 7 días sin actividad | El workflow diario de `folio-backup` lo mantiene activo. |

## Actualizar
`git push` a `main` → Cloudflare compila y publica solo. Sin Git: `npm run build && npx wrangler pages deploy dist --project-name=biblioteca-ucronia`.

## Si algo falla
- **Build: «Invalid binding SESSION»** (no apareció en las pruebas) → es un aviso del adaptador de Astro: crea un KV vacío en Cloudflare y añádelo en `wrangler.toml` como `[[kv_namespaces]]` con `binding = "SESSION"`. La web no usa sesiones de Astro.
- **Páginas vacías o error 500** → revisa las dos variables `PUBLIC_SUPABASE_*` y vuelve a desplegar.
- **Error al subir («new row violates row-level security policy») o «Archivo no disponible»** → falta ejecutar `0006_storage.sql`, el bucket no se llama exactamente `ucronia-libros`, o tu usuario no está en `admins`.
- **Un libro publicado no se descarga** → comprueba en Storage que existe el objeto `epub/…` que indica la columna `epub_key` (si migraste desde R2, ejecuta `npm run migrar:r2`).
- **Login admin vuelve al formulario** → tu usuario no está en la tabla `admins`.
- **El cambio de la portada tarda** → el borde de Cloudflare guarda las páginas 60 s.
