-- =====================================================================
-- Optimizacion del listado de ventas (/sells) - indices de rendimiento
-- =====================================================================
--
-- Ejecutar en el motor de base de datos de PRODUCCION (phpMyAdmin, HeidiSQL,
-- MySQL Workbench, etc.). Equivale a la migracion de Laravel:
--   2026_06_07_120000_add_sells_listing_performance_indexes
--
-- IMPORTANTE:
--  * Ejecutar TODO el script en UNA sola sesion/conexion (usa variables @).
--    En phpMyAdmin: pegarlo completo en la pestana "SQL" y "Continuar".
--  * Es IDEMPOTENTE: si un indice ya existe, no lo vuelve a crear ni falla.
--  * Usa ALGORITHM=INPLACE, LOCK=NONE para NO bloquear ventas mientras se
--    crea el indice (creacion en linea de InnoDB).
--  * Recomendado correrlo en horario de baja carga.
--
-- Que hace:
--  1. transactions(business_id, type, status, transaction_date): cubre el
--     filtro principal del listado + rango de fecha.
--  2. fel_facturas(id_transaction): evita escaneo completo en el leftJoin.
--  3. Registra la migracion en la tabla `migrations` (batch siguiente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Indice compuesto en `transactions`
-- ---------------------------------------------------------------------
SET @idx_exists := (
    SELECT COUNT(1) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name  = 'transactions'
      AND index_name  = 'transactions_sells_listing_idx'
);

SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE `transactions` ADD INDEX `transactions_sells_listing_idx` (`business_id`, `type`, `status`, `transaction_date`), ALGORITHM=INPLACE, LOCK=NONE',
    'SELECT ''Indice transactions_sells_listing_idx ya existe'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 2) Indice en `fel_facturas`.`id_transaction` (si la tabla y columna existen)
-- ---------------------------------------------------------------------
SET @tbl_exists := (
    SELECT COUNT(1) FROM information_schema.TABLES
    WHERE table_schema = DATABASE()
      AND table_name  = 'fel_facturas'
);

SET @col_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE table_schema = DATABASE()
      AND table_name  = 'fel_facturas'
      AND column_name = 'id_transaction'
);

SET @idx_exists := (
    SELECT COUNT(1) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name  = 'fel_facturas'
      AND index_name  = 'fel_facturas_id_transaction_idx'
);

SET @sql := IF(@tbl_exists = 1 AND @col_exists = 1 AND @idx_exists = 0,
    'ALTER TABLE `fel_facturas` ADD INDEX `fel_facturas_id_transaction_idx` (`id_transaction`), ALGORITHM=INPLACE, LOCK=NONE',
    'SELECT ''Indice fel_facturas_id_transaction_idx omitido (ya existe o tabla/columna ausente)'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 3) Registrar la migracion en la tabla `migrations` de Laravel
--    (para que `php artisan migrate` no la marque como pendiente)
-- ---------------------------------------------------------------------
SET @migration_name := '2026_06_07_120000_add_sells_listing_performance_indexes';
SET @already := (SELECT COUNT(1) FROM `migrations` WHERE `migration` = @migration_name);
SET @next_batch := (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);

SET @sql := IF(@already = 0,
    CONCAT('INSERT INTO `migrations` (`migration`, `batch`) VALUES (', QUOTE(@migration_name), ', ', @next_batch, ')'),
    'SELECT ''Migracion ya registrada en tabla migrations'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 4) Verificacion (opcional) - revisar resultados despues de ejecutar
-- ---------------------------------------------------------------------
SELECT VERSION() AS db_version;

SHOW VARIABLES LIKE 'max_statement_time';   -- limite de tiempo por consulta (MariaDB)

SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnas
FROM information_schema.STATISTICS
WHERE table_schema = DATABASE()
  AND table_name = 'transactions'
  AND index_name = 'transactions_sells_listing_idx'
GROUP BY index_name;

SELECT index_name, column_name
FROM information_schema.STATISTICS
WHERE table_schema = DATABASE()
  AND table_name = 'fel_facturas'
  AND index_name = 'fel_facturas_id_transaction_idx';

SELECT `migration`, `batch`
FROM `migrations`
WHERE `migration` = '2026_06_07_120000_add_sells_listing_performance_indexes';
