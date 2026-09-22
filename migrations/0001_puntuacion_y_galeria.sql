-- ============================================================================
-- 0001 — puntuación desglosada + galería de fotos
--
-- Hasta aquí una paella era título + foto circular + descripción + hashtags.
-- Esta migración añade:
--   · cuatro notas del 0 al 10, cada una opcional (NULL = sin puntuar ese
--     criterio). La nota global es la media de las puestas y no se guarda:
--     calcularla al vuelo evita que se quede desincronizada de sus partes.
--   · una galería de fotos sueltas, aparte de la cenital circular
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
