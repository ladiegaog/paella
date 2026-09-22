const TAG_RE = /#([\p{L}\p{N}_]+)/gu;

// Extrae los #tags embebidos en un texto libre (título o descripción).
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1].toLowerCase());
  return [...tags];
}

// Normaliza el campo dedicado "hashtags" del formulario. Acepta tanto
// "#marisco #leña" como "marisco, leña": separa por espacios/comas, quita el #
// inicial y se queda con los caracteres válidos de tag (letras/números/_).
export function parseHashtagsField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const tags = new Set<string>();
  for (const token of raw.split(/[\s,]+/)) {
    const m = token.match(/^#?([\p{L}\p{N}_]+)/u);
    if (m) tags.add(m[1].toLowerCase());
  }
  return [...tags];
}

// Fija el conjunto exacto de tags de una paella (borra los previos y reinserta).
export async function setHashtags(db: D1Database, paellaId: number, tags: string[]) {
  await db.prepare("DELETE FROM hashtags WHERE paella_id = ?").bind(paellaId).run();
  const unique = [...new Set(tags.map((t) => t.toLowerCase()))].filter(Boolean);
  if (unique.length === 0) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO hashtags (paella_id, tag) VALUES (?, ?)",
  );
  await db.batch(unique.map((t) => stmt.bind(paellaId, t)));
}
