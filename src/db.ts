import { CRITERIOS } from "../public/js/comun/notas.js";

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

// Los criterios viven en public/js/comun/notas.js, compartido con el navegador.
const CLAVES = CRITERIOS.map((c) => c.clave);
export type Criterio = (typeof CRITERIOS)[number]["clave"];
export type Notas = Record<Criterio, number | null>;

export type FotoNueva = { r2_key: string; width: number | null; height: number | null };

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
  opts: { cursor?: string; tag?: string; limit: number },
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
//
// Cada escritura va en UN db.batch(), que en D1 es una transacción: o entra la
// paella con sus tags y sus fotos, o no entra nada. Antes eran varias queries
// sueltas, y si fallaba la de las fotos la paella se quedaba creada a medias,
// el navegador veía un error y al reintentar salía duplicada.

// A qué paella se refieren las filas de tags y fotos: al editar, un id
// conocido; al crear, la que se acaba de insertar en este mismo batch.
type RefPaella = { sql: string; args: unknown[] };

const porId = (id: number): RefPaella => ({ sql: "?", args: [id] });

// Dentro de la transacción del batch nadie más escribe, así que el id más alto
// es el de la paella recién insertada. (last_insert_rowid() no sirve: cambia
// con cada INSERT de hashtags.)
const LA_RECIEN_CREADA: RefPaella = { sql: "(SELECT MAX(id) FROM paellas)", args: [] };

// Sentencias que dejan exactamente estos tags en la paella.
function sentenciasTags(db: D1Database, ref: RefPaella, tags: string[]) {
  const unicos = [...new Set(tags.map((t) => t.toLowerCase()))].filter(Boolean);
  return [
    db.prepare(`DELETE FROM hashtags WHERE paella_id = ${ref.sql}`).bind(...ref.args),
    ...unicos.map((t) =>
      db
        .prepare(`INSERT OR IGNORE INTO hashtags (paella_id, tag) VALUES (${ref.sql}, ?)`)
        .bind(...ref.args, t),
    ),
  ];
}

// Sentencias que dejan exactamente estas fotos de galería, en este orden. Los
// objetos de R2 que salen NO se borran del bucket — mismo criterio conservador
// que el borrado de paellas, para que un cambio por error se pueda deshacer.
function sentenciasFotos(db: D1Database, ref: RefPaella, fotos: FotoNueva[]) {
  return [
    db.prepare(`DELETE FROM fotos WHERE paella_id = ${ref.sql}`).bind(...ref.args),
    ...fotos.map((f, i) =>
      db
        .prepare(
          `INSERT INTO fotos (paella_id, r2_key, width, height, position) VALUES (${ref.sql}, ?, ?, ?, ?)`,
        )
        .bind(...ref.args, f.r2_key, f.width, f.height, i),
    ),
  ];
}

export async function createPaella(
  db: D1Database,
  fields: {
    titulo: string;
    descripcion: string | null;
    r2_key: string;
    size: number | null;
    notas: Notas;
    tags: string[];
    fotos: FotoNueva[];
  },
): Promise<number> {
  const insert = db
    .prepare(
      `INSERT INTO paellas (titulo, descripcion, r2_key, size, ${CLAVES.join(", ")}, created_at)
       VALUES (?, ?, ?, ?, ${CLAVES.map(() => "?").join(", ")}, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       RETURNING id`,
    )
    .bind(
      fields.titulo,
      fields.descripcion,
      fields.r2_key,
      fields.size,
      ...CLAVES.map((c) => fields.notas[c]),
    );
  const [creada] = await db.batch<{ id: number }>([
    insert,
    ...sentenciasTags(db, LA_RECIEN_CREADA, fields.tags),
    ...sentenciasFotos(db, LA_RECIEN_CREADA, fields.fotos),
  ]);
  return creada.results[0].id;
}

// Actualiza una paella y sella edited_at. `r2_key`/`size` sólo se tocan si
// vienen (cambiar la foto es opcional al editar), y la galería sólo si `fotos`
// no es null. false si no existe o está en la papelera.
export async function updatePaella(
  db: D1Database,
  id: number,
  fields: {
    titulo: string;
    descripcion: string | null;
    notas: Notas;
    r2_key?: string | null;
    size?: number | null;
    tags: string[];
    fotos: FotoNueva[] | null;
  },
): Promise<boolean> {
  // Se comprueba antes y no con el `changes` del UPDATE: dentro del batch, las
  // fotos de una paella que no existe romperían la foreign key y la respuesta
  // sería un 500 en vez de un 404.
  const existe = await db
    .prepare("SELECT 1 FROM paellas WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first();
  if (!existe) return false;

  const sets = ["titulo = ?", "descripcion = ?"];
  const args: unknown[] = [fields.titulo, fields.descripcion];
  for (const c of CLAVES) {
    sets.push(`${c} = ?`);
    args.push(fields.notas[c]);
  }
  if (fields.r2_key) {
    sets.push("r2_key = ?", "size = ?");
    args.push(fields.r2_key, fields.size ?? null);
  }
  sets.push("edited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

  await db.batch([
    db.prepare(`UPDATE paellas SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    ...sentenciasTags(db, porId(id), fields.tags),
    ...(fields.fotos ? sentenciasFotos(db, porId(id), fields.fotos) : []),
  ]);
  return true;
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

// ---------- export ----------

// La copia lleva TODO, papelera incluida (las borradas llevan su deleted_at):
// una copia de seguridad que se deja fuera lo borrado por error no sirve para
// lo que más falta hace.
export async function exportAll(db: D1Database) {
  const [paellas, hashtags, fotos] = await db.batch([
    db.prepare("SELECT * FROM paellas ORDER BY id"),
    db.prepare("SELECT * FROM hashtags ORDER BY paella_id, tag"),
    db.prepare("SELECT * FROM fotos ORDER BY paella_id, position"),
  ]);
  return {
    exported_at: new Date().toISOString(),
    paellas: paellas.results,
    hashtags: hashtags.results,
    fotos: fotos.results,
  };
}
