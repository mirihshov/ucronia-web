import { zipSync, strToU8 } from 'fflate';
import { buildPreview } from '../src/lib/epub-preview';
import { geometry, clamp, keepPosition, pageLabel, GAP_TWO } from '../src/lib/reader-math';
import {
  parseContainer, parseOpf, parseCssPaths, resolvePath, htmlToBlocks, decodeEntities, parseCss, declStyle, cutText, cutRuns, fill, finalize,
  previewBudget, isNavLike, PREVIEW_MAX_CHARS, F_I, F_B, F_SC, F_SUP, type Block, type Run, type SpineItem,
} from '../src/lib/epub-preview-parse';

let bad = 0;
const t = (name: string, ok: boolean) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };
const text = (b: Block) => (b.r ?? []).map((r) => r.x).join('');
const item = (id: string, path: string, props = ''): SpineItem => ({ id, paths: [path], type: 'application/xhtml+xml', props, linear: true });

// ---- paquete y rutas ----
t('container.xml → ruta del OPF', parseContainer('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="x"/></rootfiles></container>') === 'OEBPS/content.opf');
t('container sin rootfile → null', parseContainer('<container/>') === null);
t('resolvePath normaliza ../ y ./', resolvePath('OEBPS/', '../Text/./ch%201.xhtml#a', true) === 'Text/ch 1.xhtml' && resolvePath('OEBPS/', 'a/b.xhtml', true) === 'OEBPS/a/b.xhtml');
t('resolvePath no sale de la raíz', resolvePath('', '../../x.xhtml', true) === 'x.xhtml');

const opf = `<package><manifest>
  <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="ch%201.xhtml" media-type="application/xhtml+xml"/>
  <item id="img" href="a.png" media-type="image/png"/>
  <item id="css" href="Styles/main.css" media-type="text/css"/>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
</manifest><spine><itemref idref="cover"/><itemref idref="c1" linear="no"/><itemref idref="nope"/><itemref idref="nav"/></spine></package>`;
const sp = parseOpf(opf, 'OEBPS/content.opf');
t('spine en orden y sin ids inexistentes', sp.length === 3 && sp[0].id === 'cover' && sp[1].id === 'c1');
t('linear="no" y rutas candidatas', !sp[1].linear && sp[1].paths.includes('OEBPS/ch 1.xhtml') && sp[1].paths.includes('OEBPS/ch%201.xhtml'));
t('hojas de estilo del manifiesto', parseCssPaths(opf, 'OEBPS/content.opf').includes('OEBPS/Styles/main.css'));
t('solo el índice/navegación se salta; la portada se muestra', isNavLike(sp[2]) && isNavLike(item('toc', 'OEBPS/toc.xhtml')) && !isNavLike(sp[0]) && !isNavLike(item('chapter1', 'OEBPS/Text/chapter1.xhtml')));

// ---- estilos del libro ----
t('declStyle: alineación, cursiva, negrita, versalitas', JSON.stringify(declStyle('text-align:center; font-style: italic; font-weight:700; font-variant:small-caps')) === JSON.stringify({ a: 'c', it: true, bd: true, sc: true }));
t('declStyle: sangría y separación', declStyle('text-indent:1.5em;margin:0').ind === 1 && declStyle('text-indent:0').ind === 0 && declStyle('margin:0 0 1em').tight === false && declStyle('margin:0 auto').tight === true && declStyle('margin-bottom:0').tight === true);
t('declStyle: sangría francesa negativa se ignora', declStyle('text-indent:-1em').ind === undefined);
const css = parseCss(`/* c */ p{margin:0;text-indent:1.5em} .c, h1.t{text-align:center} @font-face{font-family:x;src:url(a.ttf)} @media screen{.it{font-style:italic}} div p{text-align:right} p:first-child{text-align:left}`);
t('parseCss: reglas simples; ignora combinadas, pseudo y @font-face', css.get('p')?.ind === 1 && css.get('.c')?.a === 'c' && css.get('h1.t')?.a === 'c' && css.get('.it')?.it === true && css.size === 4);

// ---- texto y formato ----
t('entidades con y sin nombre', decodeEntities('Ni&ntilde;o &#233; &#x2014; &amp;amp; &foo; &#0;') === 'Niño é — &amp; &foo; ');
let bl = htmlToBlocks('<p>Hola <em>mundo</em> <strong>fuerte</strong> y <i><b>ambos</b></i>.</p>');
t('cursiva y negrita se conservan', bl.length === 1 && JSON.stringify(bl[0].r) === JSON.stringify([{ x: 'Hola ' }, { x: 'mundo', f: F_I }, { x: ' ' }, { x: 'fuerte', f: F_B }, { x: ' y ' }, { x: 'ambos', f: F_I | F_B }, { x: '.' }]));
bl = htmlToBlocks('<p>E=mc<sup>2</sup> y <span style="font-variant:small-caps">Dios</span></p>');
t('superíndice y versalitas (también en línea)', bl[0].r![1].f === F_SUP && bl[0].r![3].f === F_SC);
bl = htmlToBlocks('<h2>Capítulo <i>I</i></h2><h4>Sub</h4>');
t('títulos con nivel', bl[0].t === 'h' && bl[0].n === 2 && text(bl[0]) === 'Capítulo I' && bl[1].n === 4);
t('la negrita de un título no se arrastra', htmlToBlocks('<h1><b>Todo</b></h1>')[0].r![0].f === undefined);

const rules = parseCss('.c{text-align:center} .it{font-style:italic} .n{font-style:normal} p{margin:0;text-indent:1.5em} h1{text-align:center} .sc{font-variant:small-caps}');
bl = htmlToBlocks('<h1>T</h1><p class="c">Centrado</p><p style="text-align:right">Derecha</p><div class="c"><p>Heredado</p></div><p>Con <span class="it">cursiva</span> y <em class="n">normal</em>.</p>', { css: rules });
t('alineación: de la hoja, en línea y heredada', bl[0].a === 'c' && bl[1].a === 'c' && bl[2].a === 'r' && bl[3].a === 'c');
t('clase con cursiva; font-style:normal la anula (y se unen fragmentos iguales)', bl[4].r!.length === 3 && bl[4].r![1].f === F_I && bl[4].r![2].f === undefined && text(bl[4]) === 'Con cursiva y normal.');
t('sangría y párrafos pegados de la hoja del libro', bl[1].i === 1 && bl[1].g === 1 && bl[4].i === 1);
t('sin reglas: párrafos separados y sin sangría', htmlToBlocks('<p>x</p>')[0].i === undefined && htmlToBlocks('<p>x</p>')[0].g === undefined);

bl = htmlToBlocks('<p>Verso uno<br/>Verso dos<br/></p><p><br/>Otro</p>');
t('br: salto de línea; al principio y al final se ignora', bl[0].r!.map((r) => r.x).join('|') === 'Verso uno|\n|Verso dos' && text(bl[1]) === 'Otro');
bl = htmlToBlocks('<p>Antes</p><hr/><p>Después</p><blockquote><p>Cita</p></blockquote>');
t('separador y citas', bl[1].t === 'hr' && bl[3].q === 1 && bl[0].q === undefined);
bl = htmlToBlocks('<ul><li>a</li><li>b</li></ul><ol><li>uno</li><li>dos</li></ol>');
t('listas con viñeta y numeradas', bl.map((b) => `${b.t}${b.m}`).join(',') === 'li•,li•,li1.,li2.');
bl = htmlToBlocks('<html><head><title>No</title><style>p{}</style></head><body><nav>Índice</nav><script>alert(1)</script><!-- oculto --><p>Tabla</p><table><tr><td>A</td><td>B</td></tr></table></body></html>');
t('sin head, script, style, nav ni comentarios; celdas separadas', bl.map(text).join('|') === 'Tabla|A B' && !JSON.stringify(bl).match(/alert|oculto|Índice|"No"/));
t('etiqueta cortada al final no deja basura', htmlToBlocks('<p>Hola</p><p cla').map(text).join('|') === 'Hola');
t('párrafos vacíos y &nbsp; no crean bloques', htmlToBlocks('<p> </p><p>&nbsp;</p><p>Ok</p>').length === 1);

bl = htmlToBlocks('<svg viewBox="0 0 1 1"><image width="1" height="1" xlink:href="../images/cover%201.jpg"/></svg><p>x</p><img src="a.png" alt="Dibujo &amp; más"/><img src="http://x.org/a.png"/><img src="data:image/png;base64,AAAA"/>', { dir: 'OEBPS/Text/' });
t('portada en svg → img con ruta del ZIP; http: y data: se descartan', bl.filter((b) => b.t === 'img').length === 2 && bl[0].s === 'OEBPS/images/cover 1.jpg' && bl[2].s === 'OEBPS/Text/a.png' && bl[2].alt === 'Dibujo & más');

// ---- recortes y tope ----
t('cutText respeta frases', cutText('Una frase corta y completa aquí. Otra frase bastante más larga que no cabe', 50) === 'Una frase corta y completa aquí.');
t('cutText corta en palabra con …', cutText('palabra '.repeat(30).trim(), 50).endsWith('…') && cutText('palabra '.repeat(30).trim(), 50).length <= 50);
t('cutText no toca lo que cabe', cutText('corto', 50) === 'corto');
const cr = cutRuns([{ x: 'Una frase. ', f: F_I }, { x: 'Otra frase larga que no cabe' }], 14);
t('cutRuns conserva el formato y corta en frase', cr.length === 1 && cr[0].x === 'Una frase.' && cr[0].f === F_I);
const cr2 = cutRuns([{ x: 'palabra '.repeat(20), f: F_B }] as Run[], 30);
t('cutRuns añade … con el mismo formato', cr2[cr2.length - 1].x === '…' && cr2[cr2.length - 1].f === F_B && cr2.map((r) => r.x).join('').length <= 30);
const P = (x: string): Block => ({ t: 'p', r: [{ x }] });
const st = { out: [] as Block[], used: 0 };
const done = fill(st, [{ t: 'h', n: 1, r: [{ x: 'T' }] }, P('a'.repeat(100)), P('b'.repeat(500)), P('nunca')], 300);
t('fill para en el tope y no pasa de él', done && st.used <= 300 && !st.out.some((b) => text(b) === 'nunca'));
const st2 = { out: [] as Block[], used: 0 };
t('una imagen cuenta contra el tope', !fill(st2, [{ t: 'img', s: 'a.png' }], 1000) && st2.used === 400 && fill(st2, [{ t: 'img', s: 'b.png' }, { t: 'img', s: 'c.png' }], 1000));
t('finalize quita títulos y separadores sueltos al final', finalize([P('a'), { t: 'h', r: [{ x: 'T' }] }, { t: 'hr' }]).length === 1);
t('presupuesto: tope máximo, y libros diminutos sin vista previa', previewBudget(10_000_000) === PREVIEW_MAX_CHARS && previewBudget(500) === 0 && previewBudget(10_000) <= 2500);

// ---- paginación del lector ----
const W2 = 900, g2 = geometry(W2, W2, 2);
t('un texto corto cabe en un solo pliego', g2.cols === 2 && g2.spreads === 1 && g2.step === W2 + GAP_TWO);
const colW2 = (W2 - GAP_TWO) / 2, sw9 = 9 * colW2 + 8 * GAP_TWO, g9 = geometry(W2, sw9, 2);
t('9 columnas en escritorio = 5 pliegos', g9.cols === 9 && g9.spreads === 5 && g9.step === W2 + GAP_TWO);
const g1 = geometry(360, 7 * 360 + 6 * 40, 1);
t('móvil: 7 columnas = 7 páginas, una por vez', g1.cols === 7 && g1.spreads === 7 && g1.step === 400);
t('páginas: etiqueta compacta de pliego y de página única', pageLabel(1, g9).text === '3–4 / 9' && pageLabel(4, g9).text === '9 / 9' && pageLabel(0, g1).text === '1 / 7');
t('clamp no se sale del libro', clamp(-3, 5) === 0 && clamp(99, 5) === 4 && clamp(2.6, 5) === 3);
t('cambiar el tamaño conserva la posición relativa', keepPosition(0, 9, 14) === 0 && keepPosition(8, 9, 14) === 13 && keepPosition(4, 9, 15) === 7 && keepPosition(3, 1, 6) === 0);
t('sin ancho no hay división por cero', geometry(360, 0, 1).cols >= 1);

// ---- de punta a punta con un EPUB real (ZIP) ----
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const xhtml = (body: string) => strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><link rel="stylesheet" href="../Styles/main.css"/></head><body>${body}</body></html>`);
const para = (i: number) => `<p>Párrafo ${i}. Esta es una frase de relleno con <em>cursiva</em> y acentos: áéíóú ñ. Y otra frase para alargar el texto del párrafo número ${i}.</p>`;
const ch1 = '<h1>Capítulo uno</h1>' + Array.from({ length: 60 }, (_, i) => para(i)).join('');
const ch2 = '<h1>Capítulo dos</h1><p>TEXTO_DEL_CAPITULO_DOS</p>';
const mainCss = '.center{text-align:center} p{margin:0;text-indent:1.5em} h1{text-align:center}';
const opf2 = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
  <item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/><item id="title" href="Text/title.xhtml" media-type="application/xhtml+xml"/>
  <item id="toc" href="Text/toc.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
  <item id="c2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="css" href="Styles/main.css" media-type="text/css"/><item id="im" href="Images/cover.png" media-type="image/png"/></manifest>
  <spine><itemref idref="cover"/><itemref idref="title"/><itemref idref="toc"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`;
const mk = (files: Record<string, Uint8Array>, o = opf2) => zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8(container), 'OEBPS/content.opf': strToU8(o), 'OEBPS/Styles/main.css': strToU8(mainCss), ...files });
const base = { 'OEBPS/Text/cover.xhtml': xhtml('<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><image xlink:href="../Images/cover.png"/></svg>'), 'OEBPS/Text/title.xhtml': xhtml('<p class="center">MI LIBRO</p><p class="center">Autora Ejemplo</p>'), 'OEBPS/Text/toc.xhtml': xhtml('<p>INDICE_SECRETO</p>'), 'OEBPS/Text/ch1.xhtml': xhtml(ch1), 'OEBPS/Text/ch2.xhtml': xhtml(ch2), 'OEBPS/Images/cover.png': PNG };
const pv = buildPreview(mk(base));
const bs = pv?.blocks ?? [];
const txt = bs.map(text).join('\n');
t('genera vista previa', !!pv && bs.length > 5);
t('empieza por la portada real del EPUB (imagen incrustada)', bs[0]?.t === 'img' && bs[0].c === 1 && !!bs[0].s?.startsWith('data:image/png;base64,'));
t('sigue con su portadilla, centrada como en el libro', bs[1]?.t === 'p' && text(bs[1]) === 'MI LIBRO' && bs[1].a === 'c' && text(bs[2]) === 'Autora Ejemplo');
t('salta solo el índice y sigue con el capítulo uno en página nueva', !txt.includes('INDICE_SECRETO') && bs[3]?.t === 'h' && text(bs[3]) === 'Capítulo uno' && bs[3].a === 'c' && bs[3].pb === 1);
t('párrafos con la sangría y el formato del libro', bs[4]?.i === 1 && bs[4].g === 1 && bs[4].r!.some((r) => r.f === F_I && r.x === 'cursiva'));
t('no muestra el libro completo (ni el capítulo dos)', !txt.includes('TEXTO_DEL_CAPITULO_DOS') && txt.length < 2500 && txt.length < ch1.length / 3);
t('solo datos (sin etiquetas) y con acentos', !/[<>]/.test(txt) && txt.includes('áéíóú ñ'));
t('termina en frase completa o con …', /[.…]$/.test(txt));
t('cuenta palabras', !!pv && pv.words > 50);

const bigPng = new Uint8Array(800 * 1024); bigPng.set(PNG);
t('una portada demasiado grande se omite, el texto sigue', (() => { const p = buildPreview(mk({ ...base, 'OEBPS/Images/cover.png': bigPng })); return !!p && p.blocks[0].t !== 'img' && p.blocks.some((b) => b.t === 'h'); })());
t('un EPUB sin texto → null', buildPreview(mk({ ...base, 'OEBPS/Text/title.xhtml': xhtml('<p>x</p>'), 'OEBPS/Text/ch1.xhtml': xhtml('<p>y</p>'), 'OEBPS/Text/ch2.xhtml': xhtml('<p>z</p>') })) === null);
t('texto plano → null', buildPreview(strToU8('hola mundo')) === null);
t('ZIP truncado → null', buildPreview(mk(base).slice(0, 80)) === null);
t('ZIP sin container.xml → null', buildPreview(zipSync({ mimetype: strToU8('application/epub+zip') })) === null);
process.exit(bad ? 1 : 0);
