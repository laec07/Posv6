-- =====================================================================
-- ROLLBACK - Optimizacion del listado de ventas (/sells)
-- =====================================================================
-- Revierte los indices creados por 2026_06_07_sells_listing_indexes.sql
-- y desregistra la migracion. Ejecutar completo en una sola sesion.
-- Es idempotente: no falla si los indices ya no existen.
-- =====================================================================

-- 1) Quitar indice compuesto de `transactions`
SET @idx_exists := (
    SELECT COUNT(1) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name  = 'transactions'
      AND index_name  = 'transactions_sells_listing_idx'
);
SET @sql := IF(@idx_exists > 0,
    'ALTER TABLE `transactions` DROP INDEX `transactions_sells_listing_idx`',
    'SELECT ''Indice transactions_sells_listing_idx no existe'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Quitar indice de `fel_facturas`
SET @idx_exists := (
    SELECT COUNT(1) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name  = 'fel_facturas'
      AND index_name  = 'fel_facturas_id_transaction_idx'
);
SET @sql := IF(@idx_exists > 0,
    'ALTER TABLE `fel_facturas` DROP INDEX `fel_facturas_id_transaction_idx`',
    'SELECT ''Indice fel_facturas_id_transaction_idx no existe'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Desregistrar la migracion
DELETE FROM `migrations`
WHERE `migration` = '2026_06_07_120000_add_sells_listing_performance_indexes';
