// Coincidencia y orden de resultados del buscador. Sin dependencias: se prueba con `npm run test:search`.
// Ignora mayúsculas, acentos y signos de puntuación; todas las palabras deben aparecer en título, autor,
// editorial, etiquetas o categoría. Los resultados se ordenan por relevancia (título > etiqueta > autor > categoría > editorial).

export type Searchable = {
  title: string; author: string; publisher: string | null; tags: string[] | null;
  category?: { name: string } | null;
};

export const fold = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const searchWords = (q: string): string[] => [...new Set(fold(q).split(' ').filter(Boolean))].slice(0, 6);

/** Puntuación del libro para la consulta, o 0 si alguna palabra no aparece en ningún campo. */
export function scoreBook(b: Searchable, words: string[]): number {
  if (!words.length) return 1;
  const title = fold(b.title), author = fold(b.author), publisher = fold(b.publisher), cat = fold(b.category?.name);
  const tags = (b.tags ?? []).map(fold);
  const titleWords = title.split(' ');
  let total = 0;
  for (const w of words) {
    let s = 0;
    if (titleWords.some((t) => t.startsWith(w))) s = 5;
    else if (title.includes(w)) s = 4;
    else if (tags.some((t) => t === w)) s = 4;
    else if (tags.some((t) => t.includes(w))) s = 3;
    else if (author.includes(w)) s = 3;
    else if (cat.includes(w)) s = 2;
    else if (publisher.includes(w)) s = 1;
    if (!s) return 0;
    total += s;
  }
  if (words.length > 1 && title.includes(words.join(' '))) total += 3; // frase completa en el título
  return total;
}

/** Filtra y ordena por relevancia; a igual puntuación se conserva el orden original (más recientes primero). */
export function rankBooks<T extends Searchable>(items: T[], q: string): T[] {
  const words = searchWords(q);
  if (!words.length) return items;
  return items
    .map((b, i) => ({ b, i, s: scoreBook(b, words) }))
    .filter((x) => x.s > 0)
    .sort((a, c) => c.s - a.s || a.i - c.i)
    .map((x) => x.b);
}
