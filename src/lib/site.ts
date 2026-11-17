// Marca y textos editoriales (tomados del diseño de Figma). Cámbialos aquí.
export const site = {
  name: 'Biblioteca Ucronía',
  nameLines: ['Biblioteca', 'Ucronía'],
  initial: 'U',
  // Logo principal: texto + logo (/public/logo-completo.svg). Con logoOnly: true se oculta el texto del nombre junto al logo.
  logo: '/logo-completo.svg' as string | null,
  logoOnly: true,
  logoIcon: '/icono.svg',
  logoFooter: '/logo-texto.svg' as string | null, // pie de página: wordmark horizontal (solo texto)
  tagline: 'Memoria impresa para futuros posibles.',
  // Pie de página: valores por defecto. Los admins lo editan en Admin → Pie de página.
  footerNote: 'Proyecto independiente · Obras de dominio público o con licencia libre',
  footerColumns: [
    { title: 'Biblioteca', text: '', links: [{ label: 'Catálogo', url: '/catalogo' }, { label: 'Manifiesto', url: '/#manifiesto' }, { label: 'Proyecto', url: '/acerca#proyecto' }, { label: 'Criterios de publicación', url: '/acerca#criterios' }] },
    { title: 'Contacto', text: 'contacto@ejemplo.org\nSugerencias, correcciones o solicitudes de retirada.', links: [{ label: 'Más información', url: '/acerca#contacto' }] },
    { title: 'Lectores de libros', text: 'Añade el catálogo a KOReader, Calibre o Moon+ Reader.', links: [{ label: 'Catálogo OPDS', url: '/opds' }, { label: 'Cómo usarlo', url: '/acerca#opds' }] },
    { title: 'Legal', text: '', links: [{ label: 'Avisos legales', url: '/acerca#legal' }] },
  ],
  description: 'Biblioteca digital pública: explora, consulta y descarga libros en EPUB, sin registro.',
  // Imagen remota como en el diseño. Recomendado: descargarla a /public/hero.jpg y apuntar aquí a '/hero.jpg'.
  heroImage: 'https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1200',
  heroAlt: 'Periódicos históricos encuadernados para archivo',
  heroIndex: 'ARCHIVO / 001', // el número final se recalcula para cada diapositiva
  heroCaption: 'Prensa obrera y cultura impresa · Fondo histórico',
  kicker: 'Biblioteca digital de libre uso',
  title: 'Ideas para un mundo sin amos.',
  deck: 'Libros, periódicos y ensayos fundamentales del pensamiento libertario. Ediciones legibles, descargables y abiertas para todas.',
  // Titulares rotativos de la portada. Si no hay nada guardado en Admin → Portada, se usan estos.
  // `focus` = encuadre (object-position) cuando la diapositiva usa la foto original. Máx. 6.
  heroSlides: [
    { kicker: 'Biblioteca digital de libre uso', title: 'Ideas para un mundo sin amos.', deck: 'Libros, periódicos y ensayos fundamentales del pensamiento libertario. Ediciones legibles, descargables y abiertas para todas.', caption: 'Prensa obrera y cultura impresa · Fondo histórico', focus: '50% 50%' },
    { kicker: 'Memoria impresa', title: 'Libros que circulan de mano en mano.', deck: 'Folletos, ensayos y periódicos recuperados para que las ideas vuelvan al uso común.', caption: 'Colección abierta · Ediciones históricas', focus: '14% 72%' },
    { kicker: 'Sin registro, sin rastreo', title: 'Descarga libre, en EPUB.', deck: 'Todo el catálogo se consulta y se descarga sin cuenta, sin costo y sin vigilancia.', caption: 'Para leer en cualquier dispositivo', focus: '88% 24%' },
  ],
  quote: '“La libertad no se concede: se toma.”',
  quoteBy: '— Piotr Kropotkin',
  manifestoLead: 'Una ucronía imagina qué habría pasado si la historia hubiera tomado otro rumbo. Esta biblioteca reúne los textos que lo intentaron, y los devuelve al uso común.',
  principles: [
    { title: 'Acceso libre', text: 'Todo el catálogo se consulta y se descarga sin registro, sin cuenta y sin rastreo.' },
    { title: 'Memoria compartida', text: 'Recuperamos libros, folletos y ensayos para que circulen de mano en mano, como siempre lo hicieron las ideas.' },
    { title: 'Edición cuidada', text: 'Cada ficha lleva autor, año, idioma y editorial, y cada archivo se valida antes de publicarse.' },
    { title: 'Derechos en regla', text: 'Solo publicamos obras de dominio público, con licencia compatible o con autorización expresa.' },
  ],
  // «Acerca del proyecto»: textos por defecto. Los admins los editan en Admin → Acerca de.
  // Marcadores: {nombre}, {correo}, {origen}. Línea en blanco = párrafo nuevo. `id` = ancla (/acerca#id): los enlaces del pie la usan.
  aboutTitle: 'Acerca del proyecto',
  aboutSections: [
    { id: 'proyecto', title: 'El proyecto', body: '{nombre} es una biblioteca digital pública. Los administradores publican los libros; las personas visitantes exploran el catálogo, consultan las fichas y descargan los archivos EPUB. No hay cuentas, ni lector integrado, ni publicación comunitaria.' },
    { id: 'criterios', title: 'Criterios de publicación', body: 'Solo se publican obras de dominio público, con licencias compatibles con su distribución, o con autorización expresa de quien detenta los derechos.' },
    { id: 'opds', title: 'Lectores de libros electrónicos (OPDS)', body: 'Puedes explorar y descargar el catálogo directamente desde tu lector. En KOReader, Calibre, Moon+ Reader, Librera o Thorium añade un catálogo OPDS con esta dirección:\n\n{origen}/opds\n\nIncluye novedades, selección destacada, categorías y búsqueda. No requiere cuenta.' },
    { id: 'contacto', title: 'Contacto', body: 'Para sugerencias, correcciones o solicitudes de retirada: {correo}.' },
    { id: 'creditos', title: 'Créditos', body: 'Catálogo, edición y mantenimiento a cargo de los administradores del proyecto.' },
    { id: 'legal', title: 'Avisos legales', body: 'Si crees que una obra se publica sin autorización, escríbenos y la retiraremos con prontitud. Los archivos se ofrecen tal cual, sin garantías.' },
  ],
  contactEmail: 'contacto@ejemplo.org',
};
