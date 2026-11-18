// Matemática de la paginación del lector (sin DOM: se prueba con tsx).
// El texto se coloca en columnas CSS de la altura de la página; «avanzar» = desplazar el bloque de columnas.
export const GAP_TWO = 56; // hueco central de un libro abierto (los dos márgenes interiores)
export const GAP_ONE = 40;
export type Geometry = { n: 1 | 2; gap: number; step: number; cols: number; spreads: number };

/** W = ancho visible; scrollWidth = ancho total de las columnas; n = páginas a la vista (1 móvil, 2 escritorio). */
export function geometry(W: number, scrollWidth: number, n: 1 | 2): Geometry {
  const gap = n === 2 ? GAP_TWO : GAP_ONE;
  const cw = (W - gap * (n - 1)) / n;
  const cols = Math.max(1, Math.round((scrollWidth + gap) / (cw + gap)));
  return { n, gap, step: W + gap, cols, spreads: Math.max(1, Math.ceil(cols / n)) };
}

export const clamp = (i: number, spreads: number) => Math.max(0, Math.min(spreads - 1, Math.round(i)));

/** Al cambiar el tamaño de letra o de ventana se conserva la posición relativa en el texto. */
export const keepPosition = (i: number, oldSpreads: number, newSpreads: number) =>
  clamp(oldSpreads > 1 ? (i / (oldSpreads - 1)) * (newSpreads - 1) : 0, newSpreads);

export function pageLabel(i: number, g: Geometry): { first: number; last: number; text: string } {
  const first = i * g.n + 1, last = Math.min(g.cols, first + g.n - 1);
  return { first, last, text: last > first ? `${first}–${last} / ${g.cols}` : `${first} / ${g.cols}` };
}
