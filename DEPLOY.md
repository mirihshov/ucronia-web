# Despliegue en Cloudflare Pages

Tiempo estimado: 30–40 min. Todo es gratuito (límites al final).

## 1. Supabase (si aún no lo hiciste)
1. SQL Editor → ejecuta **en orden** el contenido de `supabase/migrations/`: `0001`, `0002`, `0003`, `0004`, `0005` y `0005b`.
2. Authentication → Users → *Add user* (correo + contraseña, «auto confirm»). Luego, en el SQL Editor:
   `insert into admins (user_id) select id from auth.users where email = 'tu@correo';`
3. Authentication → Sign In / Providers → desactiva **Allow new users to sign up**.
4. Copia *Project URL* (sin `/rest/v1/`) y la clave **publishable**. Nunca uses `service_role` en la web.

## 2. R2 (archivos)
Cloudflare → R2 → *Create bucket* → nombre **`ucronia-libros`** (el mismo de `wrangler.toml`). Déjalo **privado**: no actives acceso público ni `r2.dev`. Los libros se entregan solo por `/descargar/…`.

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

Los *bindings* (R2 `BUCKET`) y variables (`MAX_EPUB_MB`, `GITHUB_BACKUP_REPO`) salen de `wrangler.toml`; no se configuran en el panel.

> Las vistas previas de otras ramas usan el mismo Supabase y el mismo bucket. Si no las quieres: Settings → Build → Branch control → solo `main`.

## 5. Respaldo en GitHub (opcional)
1. En `wrangler.toml` pon `GITHUB_BACKUP_REPO = "usuario/folio-backup"` y haz push.
2. Pages → Settings → Variables and secrets → *Add* → tipo **Secret** → `GITHUB_DISPATCH_TOKEN` (token fine-grained solo de ese repo, permiso *Actions: Read and write*).

## 6. Verifica
Abre `https://biblioteca-ucronia.pages.dev` y comprueba:
- `/`, `/catalogo`, `/acerca`, `/opds`, `/sitemap.xml`, `/robots.txt`.
- `/admin` → entra con tu usuario → crea un libro con un EPUB y una portada → publícalo → descárgalo desde su ficha.
- Admin → Portada y Pie de página: edita y revisa que se vea en la web (hasta 1 minuto).
- En un lector (KOReader, Calibre…): añade `https://TU-DOMINIO/opds`.

## 7. Dominio propio
Pages → Custom domains → *Set up a domain*. Si el dominio está en Cloudflare, el DNS se crea solo.

## Límites del plan gratuito (revisados el 15 nov 2026)
| Servicio | Límite | Qué significa aquí |
|---|---|---|
| Pages | 500 builds/mes · 20.000 archivos · 25 MiB por archivo | Sobra. |
| Pages Functions (Workers Free) | **100.000 peticiones/día** (las páginas dinámicas cuentan; los archivos estáticos no) | ≈ 70 páginas/min sostenidas. Sobra para una biblioteca pequeña o mediana. |
| Workers Free | **10 ms de CPU por petición** | Por eso el navegador calcula la huella SHA-256 del EPUB y el límite por defecto es `MAX_EPUB_MB = 15`. Si al subir un libro grande aparece el error 1102, baja el límite o pasa a Workers de pago (5 USD/mes). |
| R2 | 10 GB, 1 M escrituras y 10 M lecturas al mes, salida gratis | Ver `README.md`. |
| Supabase Free | 500 MB de BD; pausa a los 7 días sin actividad | El workflow diario de `folio-backup` lo mantiene activo. |

## Actualizar
`git push` a `main` → Cloudflare compila y publica solo. Sin Git: `npm run build && npx wrangler pages deploy dist --project-name=biblioteca-ucronia`.

## Si algo falla
- **Build: «Invalid binding SESSION»** (no apareció en las pruebas) → es un aviso del adaptador de Astro: crea un KV vacío en Cloudflare y añádelo en `wrangler.toml` como `[[kv_namespaces]]` con `binding = "SESSION"`. La web no usa sesiones de Astro.
- **Páginas vacías o error 500** → revisa las dos variables `PUBLIC_SUPABASE_*` y vuelve a desplegar.
- **«Almacenamiento no configurado» al subir/descargar** → el bucket de `wrangler.toml` no existe o el nombre no coincide.
- **Login admin vuelve al formulario** → tu usuario no está en la tabla `admins`.
- **El cambio de la portada tarda** → el borde de Cloudflare guarda las páginas 60 s.
