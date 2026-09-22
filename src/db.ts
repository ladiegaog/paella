// ---------- tipos ----------

export interface PaellaRow {
  id: number;
  titulo: string;
  descripcion: string | null;
  r2_key: string;
  size: number | null;
  // Puntuación desglosada, 0–10. NULL = sin puntuar. La nota global no se
  // guarda: es la media de estas cuatro y se calcula donde se pinta.
  punto_arroz: number | null;
  sabor_caldo: number | null;
  socarrat: number | null;
  sinergia: number | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface FotoRow {
  id: number;
  paella_id: number;
  r2_key: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface Paella extends PaellaRow {
  hashtags: string[];
  fotos: FotoRow[];
}

// Las cuatro notas, en el orden en que se enseñan.
export const CRITERIOS = ["punto_arroz", "sabor_caldo", "socarrat", "sinergia"] as const;
export type Criterio = (typeof CRITERIOS)[number];
export type Notas = Record<Criterio, number | null>;

// D1 limita los parámetros vinculados por query (~100). Cualquier lista de ids
// en un `IN (?,?,…)` hay que trocearla por debajo de ese tope.
const D1_MAX_BIND = 90;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Trae de golpe una relación (hashtags, fotos…) de un lote de paellas: una
// query por lote en vez de una por paella.
async function selectByPaellaIds<T>(
  db: D1Database,
  ids: number[],
  sqlFor: (placeholders: string) => string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const res = await Promise.all(
    chunk(ids, D1_MAX_BIND).map((b) =>
      db.prepare(sqlFor(b.map(() => "?").join(","))).bind(...b).all<T>(),
    ),
  );
  return res.flatMap((r) => r.results);
}

function agrupar<T extends { paella_id: number }>(filas: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const fila of filas) {
    const arr = m.get(fila.paella_id) || [];
    arr.push(fila);
    m.set(fila.paella_id, arr);
  }
  return m;
}

// Carga hashtags y fotos de galería de un lote de paellas (dos queries en
// total, no dos por paella) y se los pega a cada fila.
async function attachExtras(db: D1Database, rows: PaellaRow[]): Promise<Paella[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [tagRows, fotoRows] = await Promise.all([
    selectByPaellaIds<{ paella_id: number; tag: string }>(
      db,
      ids,
      (ph) => `SELECT paella_id, tag FROM hashtags WHERE paella_id IN (${ph}) ORDER BY tag`,
    ),
    selectByPaellaIds<FotoRow>(
      db,
      ids,
      (ph) => `SELECT * FROM fotos WHERE paella_id IN (${ph}) ORDER BY paella_id, position, id`,
    ),
  ]);

  const tagsPorId = agrupar(tagRows);
  const fotosPorId = agrupar(fotoRows);

  return rows.map((r) => ({
    ...r,
    hashtags: (tagsPorId.get(r.id) || []).map((t) => t.tag),
    fotos: fotosPorId.get(r.id) || [],
  }));
}

// ---------- lecturas ----------

export async function listPaellas(
  db: D1Database,
  opts: { cursor?: string; tag?: string; q?: string; limit: number },
): Promise<{ paellas: Paella[]; nextCursor: string | null }> {
  const limit = Math.min(60, Math.max(1, opts.limit));
  const conds: string[] = ["p.deleted_at IS NULL"];
  const args: unknown[] = [];

  if (opts.tag) {
    conds.push(
      "EXISTS (SELECT 1 FROM hashtags h WHERE h.paella_id = p.id AND h.tag = ?)",
    );
    args.push(opts.tag.toLowerCase());
  }
  if (opts.q) {
    // Cap defensivo: truncar a 200 (no descartar el filtro). Escapar wildcards
    // para que un "%" escrito en la búsqueda no case con todo.
    const escaped = opts.q.slice(0, 200).replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    conds.push("(p.titulo LIKE ? ESCAPE '\\' OR p.descripcion LIKE ? ESCAPE '\\')");
    args.push(pattern, pattern);
  }
  if (opts.cursor) {
    // El cursor codifica (created_at|id) para desempatar paellas del mismo ms.
    const [cAt, cIdStr] = opts.cursor.split("|");
    const cId = parseInt(cIdStr || "0");
    if (cAt && Number.isFinite(cId)) {
      conds.push("(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
      args.push(cAt, cAt, cId);
    }
  }

  args.push(limit + 1);
  const res = await db
    .prepare(
      `SELECT p.* FROM paellas p WHERE ${conds.join(" AND ")} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    )
    .bind(...args)
    .all<PaellaRow>();

  const rows = res.results;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { paellas: [], nextCursor: null };

  const paellas = await attachExtras(db, page);
  const last = page[page.length - 1];
  return {
    paellas,
    nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null,
  };
}

export async function getPaella(db: D1Database, id: number): Promise<Paella | null> {
  const row = await db
    .prepare("SELECT * FROM paellas WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<PaellaRow>();
  if (!row) return null;
  const [conExtras] = await attachExtras(db, [row]);
  return conExtras;
}

export async function listHashtags(
  db: D1Database,
): Promise<Array<{ tag: string; count: number }>> {
  const res = await db
    .prepare(
      `SELECT h.tag, COUNT(*) AS count
         FROM hashtags h JOIN paellas p ON p.id = h.paella_id
        WHERE p.deleted_at IS NULL
        GROUP BY h.tag ORDER BY count DESC, h.tag ASC`,
    )
    .all<{ tag: string; count: number }>();
  return res.results;
}

// ---------- escrituras ----------

export async function createPaella(
  db: D1Database,
  fields: {
    titulo: string;
    descripcion: string | null;
    r2_key: string;
    size: number | null;
    notas: Notas;
  },
): Promise<PaellaRow> {
  const row = await db
    .prepare(
      `INSERT INTO paellas (titulo, descripcion, r2_key, size, punto_arroz, sabor_caldo, socarrat, sinergia, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING *`,
    )
    .bind(
      fields.titulo,
      fields.descripcion,
      fields.r2_key,
      fields.size,
      ...CRITERIOS.map((c) => fields.notas[c]),
    )
    .first<PaellaRow>();
  return row!;
}

// Actualiza una paella y sella edited_at. `r2_key`/`size` sólo se tocan si
// vienen (cambiar la foto es opcional al editar). false si no existe o está
// en la papelera.
export async function updatePaella(
  db: D1Database,
  id: number,
  fields: {
    titulo: string;
    descripcion: string | null;
    notas: Notas;
    r2_key?: string | null;
    size?: number | null;
  },
): Promise<boolean> {
  const sets = ["titulo = ?", "descripcion = ?"];
  const args: unknown[] = [fields.titulo, fields.descripcion];
  for (const c of CRITERIOS) {
    sets.push(`${c} = ?`);
    args.push(fields.notas[c]);
  }
  if (fields.r2_key) {
    sets.push("r2_key = ?", "size = ?");
    args.push(fields.r2_key, fields.size ?? null);
  }
  sets.push("edited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  args.push(id);
  const res = await db
    .prepare(`UPDATE paellas SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...args)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// Soft delete: marca deleted_at y conserva el objeto de R2, así que una paella
// borrada por error se recupera con un UPDATE ... SET deleted_at = NULL.
export async function deletePaella(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE paellas SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// Fija el conjunto exacto de fotos de galería de una paella: borra las filas
// anteriores y reinserta en el orden recibido. Los objetos de R2 que salen NO
// se borran del bucket — mismo criterio conservador que el borrado de paellas,
// para que un cambio por error se pueda deshacer.
export async function setFotos(
  db: D1Database,
  paellaId: number,
  items: Array<{ r2_key: string; width: number | null; height: number | null }>,
) {
  await db.prepare("DELETE FROM fotos WHERE paella_id = ?").bind(paellaId).run();
  if (items.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO fotos (paella_id, r2_key, width, height, position) VALUES (?, ?, ?, ?, ?)",
  );
  await db.batch(items.map((f, i) => stmt.bind(paellaId, f.r2_key, f.width, f.height, i)));
}

// ---------- export ----------

export async function exportAll(db: D1Database) {
  const [paellas, hashtags, fotos] = await Promise.all([
    db.prepare("SELECT * FROM paellas WHERE deleted_at IS NULL ORDER BY id").all(),
    db
      .prepare(
        "SELECT * FROM hashtags WHERE paella_id IN (SELECT id FROM paellas WHERE deleted_at IS NULL) ORDER BY paella_id, tag",
      )
      .all(),
    db
      .prepare(
        "SELECT * FROM fotos WHERE paella_id IN (SELECT id FROM paellas WHERE deleted_at IS NULL) ORDER BY paella_id, position",
      )
      .all(),
  ]);
  return {
    exported_at: new Date().toISOString(),
    paellas: paellas.results,
    hashtags: hashtags.results,
    fotos: fotos.results,
  };
}
