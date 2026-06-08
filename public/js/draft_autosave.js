/**
 * DraftAutosave
 * -------------------------------------------------------------------------
 * Auto-guardado de borradores en el navegador (localStorage) para pantallas
 * de captura larga (traslados, ajustes, compras). Protege el avance del
 * usuario ante cortes de luz o de internet: si la sesion se interrumpe, al
 * volver a abrir la pantalla se ofrece restaurar lo capturado.
 *
 * - Funciona sin internet (todo es local).
 * - Sobrevive corte de luz (localStorage se persiste a disco).
 * - No requiere cambios en el servidor.
 *
 * Uso:
 *   DraftAutosave.init({
 *       key: 'draft_stock_transfer',                       // clave unica por pantalla
 *       form: '#stock_transfer_form',                      // selector del formulario
 *       tbody: 'table#stock_adjustment_product_table tbody',// cuerpo de la tabla de productos
 *       rowIndexInput: '#product_row_index',               // input con el indice de fila
 *       fields: ['#status', '#location_id', ...],          // campos de encabezado a persistir
 *       onRestore: function() { update_table_total(); },   // recalculo de totales al restaurar
 *       rowSelector: 'tr.product_row'                       // (opcional) selector de filas
 *   });
 * -------------------------------------------------------------------------
 */
var DraftAutosave = (function () {
    'use strict';

    var cfg = null;
    var saveTimer = null;
    var suppress = false; // evita guardar mientras se restaura
    var SAVE_DEBOUNCE_MS = 800;
    var SAVE_INTERVAL_MS = 5000;

    // Traduccion con respaldo en espanol (locale por defecto del sistema)
    function t(key, fallback) {
        if (typeof LANG !== 'undefined' && LANG && LANG[key]) {
            return LANG[key];
        }
        return fallback;
    }

    // Copia los valores "vivos" (escritos por el usuario) a los atributos del
    // DOM, para que innerHTML los capture al serializar.
    function syncValuesToAttributes($scope) {
        $scope.find('input').each(function () {
            var $i = $(this);
            var type = ($i.attr('type') || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                if ($i.prop('checked')) {
                    $i.attr('checked', 'checked');
                } else {
                    $i.removeAttr('checked');
                }
            } else {
                $i.attr('value', $i.val());
            }
        });
        $scope.find('textarea').each(function () {
            $(this).text($(this).val());
        });
        $scope.find('select').each(function () {
            var val = $(this).val();
            $(this).find('option').each(function () {
                if (this.value === val) {
                    $(this).attr('selected', 'selected');
                } else {
                    $(this).removeAttr('selected');
                }
            });
        });
    }

    // Elimina los artefactos que select2 inyecta, para guardar un <select> limpio.
    function cleanSelect2($scope) {
        $scope.find('span.select2-container').remove();
        $scope.find('select')
            .removeClass('select2-hidden-accessible')
            .removeAttr('data-select2-id')
            .removeAttr('aria-hidden')
            .removeAttr('tabindex')
            .css('display', '');
        $scope.find('[data-select2-id]').removeAttr('data-select2-id');
    }

    function countRows(html) {
        var rowSel = (cfg && cfg.rowSelector) || 'tr';
        try {
            return $('<tbody>' + html + '</tbody>').find(rowSel).length;
        } catch (e) {
            return 0;
        }
    }

    function save() {
        if (!cfg || suppress) {
            return;
        }
        var $tbody = $(cfg.tbody);
        if ($tbody.length === 0) {
            return;
        }
        var rowSel = cfg.rowSelector || 'tr';
        if ($tbody.find(rowSel).length === 0) {
            // Sin productos capturados: descartamos cualquier borrador previo.
            clear();
            return;
        }

        // 1) Volcar valores vivos a atributos
        syncValuesToAttributes($tbody);
        // 2) Clonar y limpiar select2 (no tocar el DOM vivo)
        var $clone = $tbody.clone();
        cleanSelect2($clone);

        // 3) Capturar campos de encabezado
        var fields = {};
        (cfg.fields || []).forEach(function (sel) {
            var $f = $(sel);
            if (!$f.length) {
                return;
            }
            var entry = { v: $f.val() };
            if ($f.is('select')) {
                // Guardamos el texto para reconstruir selects cargados por AJAX
                entry.t = $f.find('option:selected').text();
            }
            fields[sel] = entry;
        });

        var data = {
            ts: Date.now(),
            rowsHtml: $clone.html(),
            rowIndex: $(cfg.rowIndexInput).val(),
            fields: fields
        };

        try {
            localStorage.setItem(cfg.key, JSON.stringify(data));
        } catch (e) {
            // Cuota excedida o almacenamiento deshabilitado: ignorar.
        }
    }

    function scheduleSave() {
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
    }

    function load() {
        var raw;
        try {
            raw = localStorage.getItem(cfg.key);
        } catch (e) {
            return null;
        }
        if (!raw) {
            return null;
        }
        try {
            var data = JSON.parse(raw);
            if (!data || !data.rowsHtml) {
                return null;
            }
            return data;
        } catch (e) {
            clear();
            return null;
        }
    }

    function clear() {
        try {
            localStorage.removeItem(cfg.key);
        } catch (e) {
            // ignorar
        }
    }

    function restore(data) {
        suppress = true;

        // 1) Restaurar encabezado primero (algunos handlers de cambio de
        //    ubicacion limpian la tabla; en este punto aun esta vacia).
        if (data.fields) {
            Object.keys(data.fields).forEach(function (sel) {
                var $f = $(sel);
                var entry = data.fields[sel];
                if (!$f.length || entry == null) {
                    return;
                }
                var v = entry.v;
                if (v === null || v === undefined || v === '') {
                    return;
                }
                if ($f.is('select')) {
                    // Si la opcion no existe (select cargado por AJAX), crearla.
                    var exists = $f.find('option').filter(function () {
                        return this.value == v;
                    }).length > 0;
                    if (!exists && entry.t) {
                        $f.append(
                            $('<option>', { value: v, text: entry.t }).attr('selected', 'selected')
                        );
                    }
                }
                $f.val(v).trigger('change');
            });
        }

        // 2) Inyectar las filas de productos
        $(cfg.tbody).html(data.rowsHtml);

        // 3) Reinicializar select2 dentro de las filas (p.ej. impuesto en compras)
        if ($.fn.select2) {
            $(cfg.tbody).find('select.select2').each(function () {
                try {
                    $(this).select2();
                } catch (e) {
                    // ignorar
                }
            });
        }

        // 4) Restaurar el indice de fila
        if (data.rowIndex !== undefined && data.rowIndex !== null) {
            $(cfg.rowIndexInput).val(data.rowIndex);
        }

        // 5) Recalcular totales
        if (typeof cfg.onRestore === 'function') {
            try {
                cfg.onRestore();
            } catch (e) {
                // ignorar
            }
        }

        suppress = false;
        save(); // persistir el estado restaurado con marca de tiempo nueva
    }

    function promptRestore(data) {
        var count = countRows(data.rowsHtml);
        var when = '';
        try {
            when = new Date(data.ts).toLocaleString();
        } catch (e) {
            when = '';
        }

        var title = t('draft_found_title', 'Avance sin guardar encontrado');
        var text = t('draft_found_text', 'Se encontro una captura anterior sin guardar') +
            ' (' + count + ' ' + t('draft_products', 'productos') + ')' +
            (when ? (' - ' + when) : '') + '. ' +
            t('draft_found_question', 'Deseas restaurarla?');

        if (typeof swal === 'function') {
            swal({
                title: title,
                text: text,
                icon: 'info',
                buttons: [
                    t('draft_discard', 'No, descartar'),
                    t('draft_restore', 'Si, restaurar')
                ],
                dangerMode: false
            }).then(function (willRestore) {
                if (willRestore) {
                    restore(data);
                    if (typeof toastr !== 'undefined') {
                        toastr.success(t('draft_restored', 'Avance restaurado correctamente'));
                    }
                } else {
                    clear();
                }
            });
        } else {
            if (window.confirm(text)) {
                restore(data);
            } else {
                clear();
            }
        }
    }

    function init(config) {
        cfg = config;
        if (!cfg || !cfg.key || !cfg.form || !cfg.tbody) {
            return;
        }
        if (typeof localStorage === 'undefined') {
            return;
        }
        if ($(cfg.form).length === 0) {
            return; // el formulario no esta en esta pagina (p.ej. pagina de edicion)
        }

        // Ofrecer restaurar si hay un borrador (tras un tick para que el resto
        // del JS de la pantalla este listo).
        var existing = load();
        if (existing) {
            setTimeout(function () {
                promptRestore(existing);
            }, 400);
        }

        // Guardar ante cambios dentro del formulario (delegado).
        $(cfg.form).on('change keyup', 'input, select, textarea', function () {
            scheduleSave();
        });

        // Red de seguridad: guardado periodico (cubre alta/baja de filas que
        // no disparan un change directo).
        setInterval(save, SAVE_INTERVAL_MS);

        // Guardado de ultimo recurso al salir de la pagina.
        $(window).on('beforeunload', function () {
            save();
        });

        // Al enviar el formulario (el usuario decide guardar), limpiar borrador.
        $(cfg.form).on('submit', function () {
            clear();
        });
    }

    return {
        init: init,
        save: save,
        clear: clear
    };
})();
