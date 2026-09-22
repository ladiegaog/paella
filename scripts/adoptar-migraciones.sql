-- ============================================================================
-- Se ejecuta UNA vez, en una base de datos que ya existía antes de usar las
-- migraciones nativas de D1 (la de producción y la local de antes de 0002).
--
-- Esas bases de datos se montaron a mano con el antiguo schema.sql y la
-- migración 0001, así que ya tienen todo lo de 0000 y 0001, pero D1 no lo
-- sabe. Esto crea la tabla donde wrangler apunta lo aplicado y marca esas dos
-- como hechas; después `npm run db:migrate:remote` aplicará sólo de la 0002 en
-- adelante. Ejecutarlo dos veces no hace nada (INSERT OR IGNORE).
--
--   npx wrangler d1 execute paella-db --remote --file=scripts/adoptar-migraciones.sql
--
-- La tabla es la misma que crea wrangler (ver su código: migrations/helpers).
-- ============================================================================

CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES
    ('0000_inicial.sql'),
    ('0001_puntuacion_y_galeria.sql');
