// Pruebas del formato de artículos (sin red): npm run test:articles
import { renderBody, plainText, excerptOf, readingMinutes } from '../src/lib/article-body';

let fails = 0;
const ok = (name: string, cond: boolean) => { if (!cond) fails++; console.log(`${cond ? '✓' : '✗'} ${name}`); };
const has = (h: string, ...n: string[]) => n.every((x) => h.includes(x));

ok('párrafos', renderBody('Uno.\n\nDos.') === '<p>Uno.</p>\n<p>Dos.</p>');
ok('líneas seguidas forman un párrafo', renderBody('a\nb\nc') === '<p>a b c</p>');
ok('títulos', has(renderBody('## Título\n\n### Menor'), '<h2>Título</h2>', '<h3>Menor</h3>'));
ok('negrita y cursiva', has(renderBody('**fuerte** y *suave* y _otra_'), '<strong>fuerte</strong>', '<em>suave</em>', '<em>otra</em>'));
ok('no confunde guiones bajos de palabras', !renderBody('snake_case_name').includes('<em>'));
ok('cita con varios párrafos', has(renderBody('> Uno\n>\n> Dos'), '<blockquote><p>Uno</p><p>Dos</p></blockquote>'));
ok('lista', renderBody('- a\n- b') === '<ul><li>a</li><li>b</li></ul>');
ok('separador', renderBody('a\n\n---\n\nb').includes('<hr />'));
ok('enlace externo seguro', has(renderBody('[web](https://example.org/a?b=1&c=2)'), 'href="https://example.org/a?b=1&amp;c=2"', 'rel="noopener noreferrer"'));
ok('enlace interno', has(renderBody('[libro](/libro/x)'), '<a href="/libro/x">libro</a>'));
ok('javascript: no se enlaza', !renderBody('[x](javascript:alert(1))').includes('<a '));
ok('//dominio no se enlaza', !renderBody('[x](//evil.com)').includes('<a '));
ok('HTML escapado', !renderBody('<script>alert(1)</script> <img src=x onerror=alert(1)>').includes('<script') && !renderBody('<img src=x>').includes('<img'));
ok('comillas en enlaces no rompen el atributo', !/href="[^"]*"[^>]*onmouseover/.test(renderBody('[a](https://x.org/" onmouseover="alert(1))')));
ok('énfasis dentro de una URL no la altera', renderBody('[a](https://x.org/_b_/c)').includes('href="https://x.org/_b_/c"'));
ok('énfasis dentro del texto del enlace', renderBody('[**hola**](/x)').includes('<a href="/x"><strong>hola</strong></a>'));
ok('marcas incompletas no cuelgan', renderBody('###\n\n### \n\n> \n\n-').length >= 0);
ok('cuerpo vacío', renderBody('  \n ') === '');
ok('plainText', plainText('## T\n\n**a** [b](/c) *d*') === 'T a b d');
ok('excerpt manual', excerptOf({ excerpt: '  Hola  mundo ', body: 'x' }) === 'Hola mundo');
ok('excerpt desde el primer párrafo, sin títulos', excerptOf({ body: '## Título\n\nPrimer **párrafo** del texto.\n\nSegundo.' }) === 'Primer párrafo del texto.');
ok('excerpt recorta en palabra completa', (() => { const e = excerptOf({ body: 'palabra '.repeat(80) }, 50); return e.endsWith('…') && e.length <= 51 && !e.includes('palab…'); })());
ok('tiempo de lectura', readingMinutes('palabra '.repeat(1000)) === 5 && readingMinutes('corto') === 1);

if (fails) { console.error(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log('\nTodo correcto');
