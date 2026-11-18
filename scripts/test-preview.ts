import { zipSync, strToU8 } from 'fflate';
import { buildPreview } from '../src/lib/epub-preview';
import { geometry, clamp, keepPosition, pageLabel } from '../src/lib/reader-math';
import { parseContainer, parseOpf, resolvePath, htmlToBlocks, decodeEntities, cutText, fill, finalize, previewBudget, isFrontMatter, PREVIEW_MAX_CHARS, type Block } from '../src/lib/epub-preview-parse';

let bad = 0;
const t = (name: string, ok: boolean) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };

// ---- piezas puras ----
t('container.xml → ruta del OPF', parseContainer('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="x"/></rootfiles></container>') === 'OEBPS/content.opf');
t('container sin rootfile → null', parseContainer('<container/>') === null);
t('resolvePath normaliza ../ y ./', resolvePath('OEBPS/', '../Text/./ch%201.xhtml#a', true) === 'Text/ch 1.xhtml' && resolvePath('OEBPS/', 'a/b.xhtml', true) === 'OEBPS/a/b.xhtml');
t('resolvePath no sale de la raíz', resolvePath('', '../../x.xhtml', true) === 'x.xhtml');

const opf = `<package><manifest>
  <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="ch%201.xhtml" media-type="application/xhtml+xml"/>
  <item id="img" href="a.png" media-type="image/png"/>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
</manifest><spine><itemref idref="cover"/><itemref idref="c1" linear="no"/><itemref idref="nope"/><itemref idref="nav"/></spine></package>`;
const sp = parseOpf(opf, 'OEBPS/content.opf');
t('spine en orden y sin ids inexistentes', sp.length === 3 && sp[0].id === 'cover' && sp[1].id === 'c1');
t('linear="no" y rutas candidatas', !sp[1].linear && sp[1].paths.includes('OEBPS/ch 1.xhtml') && sp[1].paths.includes('OEBPS/ch%201.xhtml'));
t('portada e índice se reconocen como preliminares', isFrontMatter(sp[0]) && isFrontMatter(sp[2]));
t('un capítulo normal no', !isFrontMatter({ id: 'chapter1', paths: ['OEBPS/Text/chapter1.xhtml'], type: 'application/xhtml+xml', props: '', linear: true }));

t('entidades con y sin nombre', decodeEntities('Ni&ntilde;o &#233; &#x2014; &amp;amp; &foo; &#0;') === 'Niño é — &amp; &foo; ');
const html = `<html><head><title>No</title><style>p{}</style></head><body><nav>Índice</nav><script>alert(1)</script>
  <h1>Capítulo <i>I</i></h1><p>Hola   <b>mundo</b>&nbsp;feliz.<br/>Segunda&#160;línea</p><!-- oculto --><div>12</div><p> </p><p>Fin &laquo;ok&raquo;</p></body></html>`;
const bl = htmlToBlocks(html);
t('título y párrafos, sin scripts, nav, head ni comentarios', bl[0].t === 'h' && bl[0].x === 'Capítulo I' && bl.every((b) => !/[<>]|alert|oculto|Índice|No\b/.test(b.x) || b.x.includes('No')) && !bl.some((b) => /alert|oculto|Índice/.test(b.x)));
t('br separa y los números de página se omiten', bl.map((b) => b.x).join('|') === 'Capítulo I|Hola mundo feliz.|Segunda línea|Fin «ok»');
t('etiqueta cortada al final no deja basura', htmlToBlocks('<p>Hola</p><p cla').map((b) => b.x).join('|') === 'Hola');

t('cutText respeta frases', cutText('Una frase corta y completa aquí. Otra frase bastante más larga que no cabe', 50) === 'Una frase corta y completa aquí.');
t('cutText corta en palabra con …', cutText('palabra '.repeat(30).trim(), 50).endsWith('…') && cutText('palabra '.repeat(30).trim(), 50).length <= 50);
t('cutText no toca lo que cabe', cutText('corto', 50) === 'corto');
const st = { out: [] as Block[], used: 0 };
const done = fill(st, [{ t: 'h', x: 'T' }, { t: 'p', x: 'a'.repeat(100) }, { t: 'p', x: 'b'.repeat(500) }, { t: 'p', x: 'nunca' }], 300);
t('fill para en el tope y no pasa de él', done && st.used <= 300 && !st.out.some((b) => b.x === 'nunca'));
t('finalize quita títulos sueltos al final', finalize([{ t: 'p', x: 'a' }, { t: 'h', x: 'T' }]).length === 1);
t('presupuesto: tope máximo, y libros diminutos sin vista previa', previewBudget(10_000_000) === PREVIEW_MAX_CHARS && previewBudget(500) === 0 && previewBudget(10_000) <= 2500);

// ---- paginación del lector ----
const W2 = 900, g2 = geometry(W2, W2, 2); // todo cabe en una vista
t('un texto corto cabe en un solo pliego', g2.cols === 2 && g2.spreads === 1 && g2.step === W2 + 80);
const colW2 = (W2 - 80) / 2, cols9 = 9, sw9 = cols9 * colW2 + (cols9 - 1) * 80;
const g9 = geometry(W2, sw9, 2);
t('9 columnas en escritorio = 5 pliegos', g9.cols === 9 && g9.spreads === 5);
t('el desplazamiento por pliego es ancho + hueco', g9.step === 980);
const sw1 = 7 * 360 + 6 * 40, g1 = geometry(360, sw1, 1);
t('móvil: 7 columnas = 7 páginas, una por vez', g1.cols === 7 && g1.spreads === 7 && g1.step === 400);
t('páginas: etiquetas de pliego y de página única', pageLabel(1, g9).text === 'Páginas 3–4 de 9' && pageLabel(4, g9).text === 'Página 9 de 9' && pageLabel(0, g1).text === 'Página 1 de 7');
t('clamp no se sale del libro', clamp(-3, 5) === 0 && clamp(99, 5) === 4 && clamp(2.6, 5) === 3);
t('cambiar el tamaño conserva la posición relativa', keepPosition(0, 9, 14) === 0 && keepPosition(8, 9, 14) === 13 && keepPosition(4, 9, 15) === 7 && keepPosition(3, 1, 6) === 0);
t('sin ancho no hay división por cero', geometry(360, 0, 1).cols >= 1);

// ---- de punta a punta con un EPUB real (ZIP) ----
const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const xhtml = (body: string) => strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`);
const para = (i: number) => `<p>Párrafo ${i}. Esta es una frase de relleno con acentos: áéíóú ñ. Y otra frase para alargar el texto del párrafo número ${i}.</p>`;
const ch1 = '<h1>Capítulo uno</h1>' + Array.from({ length: 60 }, (_, i) => para(i)).join('');
const ch2 = '<h1>Capítulo dos</h1><p>TEXTO_DEL_CAPITULO_DOS</p>';
const opf2 = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
  <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="cover"/><itemref idref="toc"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`;
const mk = (files: Record<string, Uint8Array>) => zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8(container), 'OEBPS/content.opf': strToU8(opf2), ...files });

const epub = mk({ 'OEBPS/cover.xhtml': xhtml('<p>PORTADA_SECRETA</p>'), 'OEBPS/toc.xhtml': xhtml('<p>INDICE_SECRETO</p>'), 'OEBPS/ch1.xhtml': xhtml(ch1), 'OEBPS/ch2.xhtml': xhtml(ch2) });
const pv = buildPreview(epub);
const txt = pv ? pv.blocks.map((b) => b.x).join('\n') : '';
t('genera vista previa', !!pv && pv.blocks.length > 3);
t('salta portada e índice y empieza en el capítulo uno', !!pv && pv.blocks[0].x === 'Capítulo uno' && !txt.includes('PORTADA_SECRETA') && !txt.includes('INDICE_SECRETO'));
t('no muestra el libro completo (ni el capítulo dos)', !txt.includes('TEXTO_DEL_CAPITULO_DOS') && txt.length < 1500 && txt.length < ch1.length / 4);
t('es texto plano (sin etiquetas) y conserva los acentos', !/[<>]/.test(txt) && txt.includes('áéíóú ñ'));
t('termina en frase completa o con …', /[.…]$/.test(txt));
t('cuenta palabras', !!pv && pv.words > 50);

t('un EPUB solo con portada → null', buildPreview(mk({ 'OEBPS/cover.xhtml': xhtml('<p>solo portada</p>'), 'OEBPS/toc.xhtml': xhtml('<p>i</p>'), 'OEBPS/ch1.xhtml': xhtml('<p>x</p>'), 'OEBPS/ch2.xhtml': xhtml('<p>y</p>') })) === null);
t('texto plano → null', buildPreview(strToU8('hola mundo')) === null);
t('ZIP truncado → null', buildPreview(epub.slice(0, 80)) === null);
t('ZIP sin container.xml → null', buildPreview(zipSync({ mimetype: strToU8('application/epub+zip') })) === null);
process.exit(bad ? 1 : 0);
