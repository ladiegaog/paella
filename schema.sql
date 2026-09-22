-- ============================================================================
-- paella — schema (D1 / SQLite). Una sola fuente de verdad, sin carpeta
-- migrations/. Se aplica entero con:
--   npm run db:migrate          (D1 LOCAL, en .wrangler/)
--   npm run db:migrate:remote   (D1 de producción)
-- Todo es CREATE ... IF NOT EXISTS, así que re-aplicarlo es seguro.
-- ============================================================================

-- Una fila = una paella. `r2_key` apunta a la foto cenital ya recortada en
-- cuadrado (se muestra circular por CSS; guardamos el cuadrado para no perder
-- información si algún día cambia la forma).
CREATE TABLE IF NOT EXISTS paellas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    r2_key TEXT NOT NULL,
    -- Lado del cuadrado en píxeles (la imagen siempre es cuadrada).
    size INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    -- edited_at: NULL = nunca editada.
    edited_at TEXT,
    -- Soft delete: NULL = visible; ISO timestamp = en la papelera. El objeto de
    -- R2 se conserva para poder restaurar.
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS hashtags (
    paella_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (paella_id, tag),
    FOREIGN KEY (paella_id) REFERENCES paellas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paellas_created ON paellas(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_paellas_deleted ON paellas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON hashtags(tag);
