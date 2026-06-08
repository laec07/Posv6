<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Indices para optimizar el listado de ventas (pantalla Ventas / /sells).
 *
 * Motivo: en produccion (MariaDB) la consulta del listado para el usuario
 * admin (todas las bodegas, rango anual) se aborta por max_statement_time.
 * En local funciona porque no hay limite de tiempo y/o por diferencias de
 * indices. Estos indices permiten al motor filtrar y agrupar de forma
 * eficiente en lugar de escanear/agrupar toda la tabla.
 *
 * - transactions(business_id, type, status, transaction_date): cubre el
 *   filtro principal del listado (business + tipo + estado) y el rango de
 *   fecha, evitando escaneos completos y filesort.
 * - fel_facturas(id_transaction): la tabla fue creada manualmente (sin
 *   migracion) por lo que el indice puede no existir en produccion; sin el,
 *   el leftJoin con fel_facturas hace un escaneo completo por cada fila.
 */
return new class extends Migration
{
    /**
     * Verifica si un indice existe en una tabla (MySQL / MariaDB).
     */
    private function indexExists(string $table, string $indexName): bool
    {
        try {
            $indexes = DB::select("SHOW INDEXES FROM `{$table}`");
        } catch (\Throwable $e) {
            return false;
        }

        foreach ($indexes as $index) {
            if (isset($index->Key_name) && $index->Key_name === $indexName) {
                return true;
            }
        }

        return false;
    }

    public function up()
    {
        // Indice compuesto para el filtro principal del listado de ventas.
        if (Schema::hasTable('transactions') &&
            ! $this->indexExists('transactions', 'transactions_sells_listing_idx')) {
            Schema::table('transactions', function (Blueprint $table) {
                $table->index(
                    ['business_id', 'type', 'status', 'transaction_date'],
                    'transactions_sells_listing_idx'
                );
            });
        }

        // Indice para el leftJoin con fel_facturas (tabla creada fuera de migraciones).
        if (Schema::hasTable('fel_facturas') &&
            Schema::hasColumn('fel_facturas', 'id_transaction') &&
            ! $this->indexExists('fel_facturas', 'fel_facturas_id_transaction_idx')) {
            Schema::table('fel_facturas', function (Blueprint $table) {
                $table->index('id_transaction', 'fel_facturas_id_transaction_idx');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('transactions') &&
            $this->indexExists('transactions', 'transactions_sells_listing_idx')) {
            Schema::table('transactions', function (Blueprint $table) {
                $table->dropIndex('transactions_sells_listing_idx');
            });
        }

        if (Schema::hasTable('fel_facturas') &&
            $this->indexExists('fel_facturas', 'fel_facturas_id_transaction_idx')) {
            Schema::table('fel_facturas', function (Blueprint $table) {
                $table->dropIndex('fel_facturas_id_transaction_idx');
            });
        }
    }
};
