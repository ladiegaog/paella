-- ============================================================================
-- 0002 — un índice que sirva de verdad a la lista
--
-- La consulta de la portada es siempre "las no borradas, de la más nueva a la
-- más vieja". idx_paellas_deleted (sólo deleted_at) no la ayudaba en nada, y
-- idx_paellas_created incluía también las de la papelera. Un índice parcial
-- con sólo las visibles, en el orden de la lista, las cubre las dos.
-- ============================================================================

DROP INDEX IF EXISTS idx_paellas_deleted;
DROP INDEX IF EXISTS idx_paellas_created;

CREATE INDEX IF NOT EXISTS idx_paellas_visibles
    ON paellas(created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
