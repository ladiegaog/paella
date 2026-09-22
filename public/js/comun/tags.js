// ----- los #hashtags: qué cuenta como tag y cómo se leen -----
//
// Compartido con el Worker (ver reglas.js): el servidor extrae los tags con
// estas mismas funciones con las que el navegador los pinta como enlaces.

// Un tag son letras (con acentos y ñ), números y guión bajo. La regex es global
// para usarla con matchAll, que la clona: compartirla no arrastra lastIndex.
export const TAG_RE = /#([\p{L}\p{N}_]+)/gu;

// Extrae los #tags embebidos en un texto libre (título o descripción).
/** @param {string | null | undefined} text @returns {string[]} */
export function extractHashtags(text) {
  if (!text) return [];
  const tags = /** @type {Set<string>} */ (new Set());
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1].toLowerCase());
  return [...tags];
}

// Normaliza el campo dedicado "hashtags" del formulario. Acepta tanto
// "#marisco #leña" como "marisco, leña": separa por espacios/comas, quita el #
// inicial y se queda con los caracteres válidos de tag (letras/números/_).
/** @param {string | null | undefined} raw @returns {string[]} */
export function parseHashtagsField(raw) {
  if (!raw) return [];
  const tags = /** @type {Set<string>} */ (new Set());
  for (const token of raw.split(/[\s,]+/)) {
    const m = token.match(/^#?([\p{L}\p{N}_]+)/u);
    if (m) tags.add(m[1].toLowerCase());
  }
  return [...tags];
}
