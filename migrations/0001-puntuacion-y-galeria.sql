-- ============================================================================
-- 0001 — puntuación desglosada + galería de fotos
--
-- Hasta aquí una paella era título + foto circular + descripción + hashtags.
-- Esta migración añade:
--   · cuatro notas del 0 al 10 (la nota global es su media, no se guarda:
--     calcularla al vuelo evita que se quede desincronizada de sus partes)
--   · una galería de fotos sueltas, aparte de la cenital circular
--
-- Se aplica con:
--   npm run db:migrate:0001          (D1 LOCAL)
--   npm run db:migrate:0001:remote   (producción)
--
-- SQLite no tiene ADD COLUMN IF NOT EXISTS: re-aplicar esto da error de
-- "duplicate column name", que es inofensivo pero no es idempotente. Se aplica
-- UNA vez por base de datos. Las instalaciones nuevas no lo necesitan: el
-- schema.sql ya trae las columnas.
-- ============================================================================

ALTER TABLE paellas ADD COLUMN punto_arroz INTEGER;
ALTER TABLE paellas ADD COLUMN sabor_caldo INTEGER;
ALTER TABLE paellas ADD COLUMN socarrat INTEGER;
ALTER TABLE paellas ADD COLUMN sinergia INTEGER;

-- Fotos de la galería. NO incluye la cenital circular, que vive en
-- paellas.r2_key: esa es la portada y siempre hay exactamente una.
CREATE TABLE IF NOT EXISTS fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paella_id INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (paella_id) REFERENCES paellas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fotos_paella ON fotos(paella_id, position);
