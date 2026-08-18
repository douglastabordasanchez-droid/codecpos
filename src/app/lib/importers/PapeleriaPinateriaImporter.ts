/**
 * Motor de carga masiva por lotes — Papelería y Piñatería.
 *
 * Pensado para catálogos de 15,000 a 30,000+ referencias sin congelar la UI:
 * el archivo se lee una sola vez, pero se procesa en lotes (chunks) de 300
 * filas, cediendo el hilo entre uno y otro (`setTimeout(0)`) para que
 * Electron/el navegador sigan respondiendo y la barra de progreso se vea
 * avanzar en vivo en vez de congelarse hasta el final.
 *
 * Escritura dual por lote:
 *   1) `pos-productos` (localStorage) — disponibilidad INMEDIATA en caja,
 *      apenas termina ese lote, sin esperar a que termine todo el archivo.
 *   2) Supabase, best-effort — si hay internet, sube el lote de una vez
 *      (upsert por cliente_id+local_id). Si falla (sin red, RLS, lo que
 *      sea), NO se aborta el lote: el producto ya quedó disponible
 *      localmente, y el motor de sincronización periódico existente
 *      (syncService.ts → pushProductosLocalStorage, comparación por hash)
 *      lo termina de subir solo en su próximo ciclo. Es la misma cola de
 *      pendientes que ya usa todo el inventario — no hace falta una nueva.
 *
 * No construye un catálogo aparte: escribe en el MISMO `pos-productos` que
 * usa el resto del POS, marcando `esPapeleriaPinateria: true` para que la
 * pantalla del módulo y los filtros rápidos de caja lo puedan encontrar.
 */
import { getSupabaseClient } from '../supabase/config';
import { getLinkedClienteId } from '../supabase/tenantLink';
import type { TipoPlantillaPapeleria } from './papeleriaPinateriaTemplates';

const TAMANO_LOTE = 300;

export interface ProgresoImportacion {
  loteActual: number;
  totalLotes: number;
  procesados: number;
  total: number;
  creados: number;
  actualizados: number;
  errores: string[];
}

function generarCodigoInterno(prefijo: string, indice: number): string {
  return `${prefijo}-${Date.now().toString(36).toUpperCase()}-${indice}`;
}

function leerBool(v: unknown, porDefecto: boolean): boolean {
  if (v === undefined || v === null || v === '') return porDefecto;
  const s = String(v).trim().toLowerCase();
  return ['si', 'sí', 'true', '1', 'yes', 'x'].includes(s);
}

/** Convierte una fila cruda del Excel (según su plantilla) en un producto del formato `pos-productos`. */
function mapearFila(
  tipo: TipoPlantillaPapeleria,
  fila: Record<string, unknown>,
  indice: number,
  porCodigo: Map<string, any>
): { producto: any; esNuevo: boolean } | null {
  const nombre = String(fila.nombre || '').trim();
  if (!nombre) return null;

  let codigo = String(fila.codigo || '').trim();
  const necesitaCodigoAuto = !codigo && (tipo === 'dulceria_jugueteria');
  if (necesitaCodigoAuto) codigo = generarCodigoInterno('JUG', indice);
  if (!codigo) codigo = generarCodigoInterno('PAP', indice);

  const existente = porCodigo.get(codigo.toLowerCase());
  const base = existente || { id: `pp-${Date.now()}-${indice}-${Math.random().toString(36).slice(2, 8)}` };

  const producto: any = {
    ...base,
    codigo,
    nombre,
    precio: Number(fila.precio) || 0,
    costo: Number(fila.costo) || 0,
    stock: Number(fila.stock) || 0,
    minStock: base.minStock ?? 5,
    stockMinimo: base.stockMinimo ?? 5,
    categoria: String(fila.categoria_especifica || base.categoria || 'Papelería y Piñatería'),
    categoriaEspecifica: fila.categoria_especifica ? String(fila.categoria_especifica).trim() : base.categoriaEspecifica,
    activo: true,
    esPapeleriaPinateria: true,
    unidad: String(fila.unidad || base.unidad || 'unidad'),
  };

  switch (tipo) {
    case 'papeleria_servicios': {
      const esServicio = leerBool(fila.servicio, false);
      producto.servicio = esServicio;
      if (esServicio) producto.ventaPorUnidad = true;
      break;
    }
    case 'globos_decoracion': {
      producto.calibreGlobo = fila.calibre_globo ? String(fila.calibre_globo).trim() : undefined;
      producto.colorAcabado = fila.color_acabado ? String(fila.color_acabado).trim() : undefined;
      producto.marca = fila.marca ? String(fila.marca).trim() : undefined;
      producto.unidadesPorBolsa = fila.unidades_por_bolsa ? Number(fila.unidades_por_bolsa) : undefined;
      producto.ventaPorUnidad = leerBool(fila.venta_por_unidad, true);
      producto.categoria = producto.categoria === 'Papelería y Piñatería' ? 'Globos y Decoración' : producto.categoria;
      break;
    }
    case 'dulceria_jugueteria': {
      producto.esDulceria = String(fila.categoria_especifica || '').toLowerCase().includes('dulce');
      producto.ventaPorUnidad = leerBool(fila.venta_por_unidad, true);
      producto.permitirFraccion = leerBool(fila.permitir_fraccion, false);
      producto.lote = fila.lote ? String(fila.lote).trim() : undefined;
      producto.fechaVencimiento = fila.fecha_vencimiento ? String(fila.fecha_vencimiento).trim() : undefined;
      break;
    }
    case 'fiestas_tematicas_desechables': {
      producto.tematica = fila.tematica ? String(fila.tematica).trim() : undefined;
      break;
    }
    case 'combos_kits_sorpresas': {
      const codigosRaw = String(fila.componentes_codigos || '').split(';').map((s) => s.trim()).filter(Boolean);
      const cantidadesRaw = String(fila.componentes_cantidades || '').split(';').map((s) => s.trim());
      producto.componentesCombo = codigosRaw.map((codComponente, i) => {
        const comp = porCodigo.get(codComponente.toLowerCase());
        return {
          productoId: comp?.id || codComponente,
          nombre: comp?.nombre || codComponente,
          cantidad: Number(cantidadesRaw[i]) || 1,
        };
      });
      producto.categoria = producto.categoria === 'Papelería y Piñatería' ? 'Combos y Sorpresas' : producto.categoria;
      break;
    }
  }

  return { producto, esNuevo: !existente };
}

/**
 * Lee el archivo completo (una vez), lo divide en lotes y los procesa
 * secuencialmente. `onProgreso` se invoca después de cada lote — úsalo para
 * la barra de progreso ("Lote 4/12 — 2,000 referencias procesadas").
 */
export async function importarPapeleriaPinateriaDesdeExcel(
  file: File,
  tipo: TipoPlantillaPapeleria,
  onProgreso?: (p: ProgresoImportacion) => void
): Promise<ProgresoImportacion> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws) as Array<Record<string, unknown>>;

  const resultado: ProgresoImportacion = {
    loteActual: 0, totalLotes: Math.max(1, Math.ceil(filas.length / TAMANO_LOTE)),
    procesados: 0, total: filas.length, creados: 0, actualizados: 0, errores: [],
  };

  if (filas.length === 0) {
    resultado.errores.push('El archivo está vacío');
    return resultado;
  }

  let productosLocales: any[];
  try {
    productosLocales = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    if (!Array.isArray(productosLocales)) productosLocales = [];
  } catch {
    productosLocales = [];
  }
  const porCodigo = new Map<string, any>(
    productosLocales.filter((p) => p?.codigo).map((p) => [String(p.codigo).toLowerCase(), p])
  );

  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();

  for (let inicio = 0; inicio < filas.length; inicio += TAMANO_LOTE) {
    const lote = filas.slice(inicio, inicio + TAMANO_LOTE);
    const productosDelLote: any[] = [];

    lote.forEach((fila, i) => {
      try {
        const mapeado = mapearFila(tipo, fila, inicio + i, porCodigo);
        if (!mapeado) { resultado.errores.push(`Fila ${inicio + i + 2}: sin nombre, se omitió`); return; }
        const { producto, esNuevo } = mapeado;
        porCodigo.set(String(producto.codigo).toLowerCase(), producto);
        productosDelLote.push(producto);
        if (esNuevo) resultado.creados++; else resultado.actualizados++;
      } catch (e) {
        resultado.errores.push(`Fila ${inicio + i + 2}: ${e instanceof Error ? e.message : 'error desconocido'}`);
      }
    });

    // 1) Disponibilidad inmediata en caja — se aplica el lote completo de una vez.
    for (const p of productosDelLote) {
      const idx = productosLocales.findIndex((x) => x.id === p.id);
      if (idx >= 0) productosLocales[idx] = p; else productosLocales.push(p);
    }
    localStorage.setItem('pos-productos', JSON.stringify(productosLocales));

    // 2) Best-effort a Supabase — si falla, el ciclo normal de sync lo reintenta solo.
    if (client && clienteId && productosDelLote.length > 0) {
      try {
        await client.from('productos').upsert(
          productosDelLote.map((p) => ({
            cliente_id: clienteId,
            local_id: p.id,
            codigo_barras: p.codigo || null,
            nombre: p.nombre,
            categoria: p.categoria || null,
            precio_venta: p.precio ?? 0,
            costo: p.costo ?? 0,
            stock: p.stock ?? 0,
            stock_minimo: p.minStock ?? null,
            unidad: p.unidad || null,
            activo: true,
            es_papeleria_pinateria: true,
            categoria_especifica: p.categoriaEspecifica || null,
            tematica: p.tematica || null,
            calibre_globo: p.calibreGlobo || null,
            color_acabado: p.colorAcabado || null,
            marca: p.marca || null,
            es_dulceria: !!p.esDulceria,
            permitir_fraccion: !!p.permitirFraccion,
            componentes_combo: p.componentesCombo || null,
            unidades_por_bolsa: p.unidadesPorBolsa ?? null,
            venta_por_unidad: p.ventaPorUnidad !== false,
            lote: p.lote || null,
            fecha_vencimiento: p.fechaVencimiento || null,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'cliente_id,local_id' }
        );
        productosDelLote.forEach((p) => { p._supabaseSynced = true; });
      } catch (e) {
        resultado.errores.push(`Lote ${resultado.loteActual + 1}: no se pudo subir a la nube todavía (${e instanceof Error ? e.message : 'sin conexión'}) — quedó en cola local`);
      }
    }

    resultado.loteActual++;
    resultado.procesados += lote.length;
    onProgreso?.({ ...resultado, errores: [...resultado.errores] });

    // Cede el hilo antes del siguiente lote — mantiene la UI respondiendo.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Persistencia final (por si el último lote quedó con _supabaseSynced actualizado).
  localStorage.setItem('pos-productos', JSON.stringify(productosLocales));

  return resultado;
}
