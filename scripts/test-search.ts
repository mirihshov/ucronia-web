// Pruebas del buscador (sin red): npm run test:search
import { rankBooks, searchWords, fold } from '../src/lib/search-match';

let fails = 0;
const ok = (name: string, cond: boolean) => { if (!cond) fails++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

const mk = (title: string, author: string, tags: string[], cat: string | null = null, publisher: string | null = null) =>
  ({ title, author, tags, publisher, category: cat ? { name: cat } : null });
const books = [
  mk('Cien años de soledad', 'Gabriel García Márquez', ['realismo mágico', 'colombia'], 'Novela', 'Sudamericana'),
  mk('El amor en los tiempos del cólera', 'Gabriel García Márquez', ['amor'], 'Novela'),
  mk('Ficciones', 'Jorge Luis Borges', ['cuento', 'ciencia ficción'], 'Literatura'),
  mk('Meditaciones', 'Marco Aurelio', ['estoicismo'], 'Filosofía'),
  mk('Poemas de amor', 'Pablo Neruda', ['poesía'], 'Poesía'),
];
const t = (q: string) => rankBooks(books, q).map((b) => b.title);

ok('por nombre (sin acentos)', t('cien anos')[0] === 'Cien años de soledad');
ok('por nombre (con acentos y mayúsculas)', t('CÓLERA')[0] === 'El amor en los tiempos del cólera');
ok('por autor sin tilde', t('garcia marquez').length === 2);
ok('por etiqueta', t('estoicismo').join() === 'Meditaciones');
ok('etiqueta con varias palabras', t('ciencia ficcion').join() === 'Ficciones');
ok('etiqueta parcial', t('realismo').join() === 'Cien años de soledad');
ok('por categoría', t('poesia').join() === 'Poemas de amor');
ok('por editorial', t('sudamericana').join() === 'Cien años de soledad');
ok('todas las palabras deben coincidir', t('borges neruda').length === 0);
ok('relevancia: título antes que etiqueta/autor', t('amor')[0] === 'El amor en los tiempos del cólera' || t('amor')[0] === 'Poemas de amor');
ok('sin resultados', t('xyzzy').length === 0);
ok('consulta vacía devuelve todo', rankBooks(books, '   ').length === books.length);
ok('puntuación ignorada', t('garcía-márquez').length === 2);
ok('palabras repetidas', searchWords('amor amor Amor').length === 1);
ok('fold', fold('  Ñandú, Árbol!! ') === 'nandu arbol');
ok('tags nulos no rompen', rankBooks([{ title: 'X', author: 'Y', publisher: null, tags: null }], 'x').length === 1);

if (fails) { console.error(`\n${fails} prueba(s) fallaron`); process.exit(1); }
console.log('\nTodo correcto');
