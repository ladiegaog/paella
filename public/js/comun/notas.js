// ----- la puntuación, sin DOM: criterios, media y veredicto -----
//
// Cuatro criterios del 0 al 10. La nota global NO se guarda: es la media de los
// que estén puestos, y se calcula al pintarla. Así no puede quedarse
// desincronizada de sus partes cuando se edita una.
//
// Compartido con el Worker (ver reglas.js): el servidor lo usa para validar y
// para poner el veredicto en la vista previa de un enlace compartido.

// Las cuatro notas, en el orden en que se enseñan. El `@type {const}` hace que
// TypeScript (en src/) vea las claves como literales y no como string.
export const CRITERIOS = /** @type {const} */ ([
  { clave: 'punto_arroz', etiqueta: 'punto del arroz' },
  { clave: 'sabor_caldo', etiqueta: 'sabor del caldo' },
  { clave: 'socarrat', etiqueta: 'socarrat' },
  { clave: 'sinergia', etiqueta: 'sinergia' },
]);

export const MAX_NOTA = 10;

// Nota válida = entero de 0 a 10. Cualquier otra cosa se trata como "sin nota".
//
// El filtro de tipo de la primera línea no es decorativo: Number(null) y
// Number([]) valen 0, así que sin él una paella SIN puntuar se leía como cuatro
// ceros y salía con un 0 y su veredicto en vez de sin puntuación ninguna.
/** @param {unknown} v @returns {number | null} */
export function limpia(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_NOTA ? n : null;
}

// Media de las notas puestas, o null si no hay ninguna.
/** @param {Record<string, unknown> | null | undefined} notas @returns {number | null} */
export function media(notas) {
  const puestas = CRITERIOS.map(({ clave }) => limpia(notas?.[clave])).filter((n) => n !== null);
  if (puestas.length === 0) return null;
  return puestas.reduce((a, b) => a + b, 0) / puestas.length;
}

// "8,3" a la española; los enteros sin decimal ("9", no "9,0").
/** @param {number | null | undefined} n @returns {string} */
export function formatNota(n) {
  if (n === null || n === undefined) return '–';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

// El veredicto es la gracia de todo esto: la nota en palabras. Se elige por el
// primer umbral que la nota alcanza, así que el orden importa (de mayor a
// menor).
/** @type {Array<[number, string]>} */
const VEREDICTOS = [
  [10, 'para ponerle un marco'],
  [9.5, 'obra maestra del domingo'],
  [9, 'de las que se recuerdan'],
  [8.5, 'señora paella'],
  [8, 'muy buena, sin discusión'],
  [7, 'buena, y repetiría'],
  [6, 'cumplió de sobra'],
  [5, 'se dejó comer'],
  [4, 'ha habido mejores'],
  [3, 'menos mal que estaba el alioli'],
  [2, 'el vino estaba buenísimo'],
  [0, 'esto acabó siendo un arroz caldoso'],
];

/** @param {number | null} nota @returns {string} */
export function veredicto(nota) {
  if (nota === null) return '';
  return (VEREDICTOS.find(([umbral]) => nota >= umbral) ?? VEREDICTOS[VEREDICTOS.length - 1])[1];
}
