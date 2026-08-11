/**
 * Operaciones del Taller desde el celular.
 *
 * Escribe directo sobre `taller_ordenes` (migración 0024) marcando
 * `actualizado_en: 'pwa'`, que es la señal que usa Electron para bajarse el
 * cambio sin confundirlo con su propio push — ver tallerSyncService y
 * useSyncModulosNube.
 *
 * Regla que se respeta en todas las mutaciones: la columna `datos` guarda la
 * OrdenServicio completa tal como la maneja Electron, y las columnas sueltas
 * (estado, saldo_pendiente, …) son un espejo para poder filtrar y ordenar sin
 * abrir el jsonb. Si se actualiza una sin la otra, el Kanban de la caja y la
 * lista del celular empiezan a contar cosas distintas.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import type { EstadoOrden, OrdenServicio, PagoOrden, Prioridad, TipoDispositivo } from '../../app/types/taller';

export interface FilaOrdenTaller {
  id: string;
  local_id: string;
  numero_orden: string;
  estado: EstadoOrden;
  prioridad: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  dispositivo_tipo: string | null;
  dispositivo_marca: string | null;
  dispositivo_modelo: string | null;
  tecnico_asignado: string | null;
  fecha_recepcion: string;
  fecha_estimada_entrega: string | null;
  costo_estimado: number;
  costo_final: number;
  anticipo: number;
  saldo_pendiente: number;
  datos: OrdenServicio;
}

interface Autor {
  clienteId: string;
  nombre: string;
}

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Sin conexión con la nube');
  return c;
}

/** Espejo de las columnas sueltas a partir de la orden completa. */
function columnasDesde(orden: OrdenServicio) {
  return {
    numero_orden: orden.numeroOrden,
    estado: orden.estado,
    prioridad: orden.prioridad || 'normal',
    cliente_nombre: orden.cliente?.nombre ?? null,
    cliente_telefono: orden.cliente?.telefono ?? null,
    dispositivo_tipo: orden.dispositivo?.tipo ?? null,
    dispositivo_marca: orden.dispositivo?.marca ?? null,
    dispositivo_modelo: orden.dispositivo?.modelo ?? null,
    tecnico_asignado: orden.tecnicoAsignado ?? null,
    fecha_recepcion: orden.fechaRecepcion,
    fecha_estimada_entrega: orden.fechaEstimadaEntrega || null,
    fecha_entrega: orden.fechaEntrega || null,
    costo_estimado: Number(orden.costoEstimado) || 0,
    costo_final: Number(orden.costoFinal) || 0,
    anticipo: Number(orden.anticipo) || 0,
    saldo_pendiente: Number(orden.saldoPendiente) || 0,
  };
}

/**
 * Siguiente número de orden del negocio.
 *
 * Electron numera con su propio contador en IndexedDB (OS-AAAA-0001). Como el
 * celular no puede ver ese contador, se deduce del máximo ya publicado en la
 * nube. Puede haber colisión si dos personas crean una orden en el mismo
 * segundo desde equipos distintos; el `local_id` sigue siendo único, así que
 * lo peor que pasa es que dos órdenes compartan número visible — se corrige
 * renumerando desde la caja, y nunca se pierde ni se sobrescribe una orden.
 */
async function siguienteNumeroOrden(clienteId: string): Promise<string> {
  const anio = new Date().getFullYear();
  const { data } = await cliente()
    .from('taller_ordenes')
    .select('numero_orden')
    .eq('cliente_id', clienteId)
    .like('numero_orden', `OS-${anio}-%`)
    .order('numero_orden', { ascending: false })
    .limit(1);

  const ultimo = (data as { numero_orden: string }[] | null)?.[0]?.numero_orden;
  const consecutivo = ultimo ? (parseInt(ultimo.split('-')[2] || '0', 10) || 0) + 1 : 1;
  return `OS-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

export interface DatosNuevaOrden {
  clienteNombre: string;
  clienteTelefono: string;
  clienteCedula?: string;
  tipo: TipoDispositivo;
  marca: string;
  modelo: string;
  condicionFisica?: string;
  problema: string;
  prioridad: Prioridad;
  costoEstimado: number;
  anticipo: number;
  tecnicoAsignado?: string;
}

export async function crearOrdenDesdePwa(autor: Autor, d: DatosNuevaOrden): Promise<FilaOrdenTaller> {
  const ahora = new Date().toISOString();
  const numeroOrden = await siguienteNumeroOrden(autor.clienteId);
  const localId = `orden_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const costoEstimado = Number(d.costoEstimado) || 0;
  const anticipo = Number(d.anticipo) || 0;

  const pagos: PagoOrden[] = anticipo > 0
    ? [{
        id: `pago_${Date.now()}`,
        fecha: ahora,
        monto: anticipo,
        metodoPago: 'efectivo',
        recibidoPor: autor.nombre,
        referencia: 'Anticipo al recibir (app móvil)',
      }]
    : [];

  // Misma forma que produce `tallerService.crearOrden()` en Electron, para que
  // `upsertOrdenRemota` la acepte tal cual cuando baje por Realtime.
  const orden: OrdenServicio = {
    id: localId,
    numeroOrden,
    fechaRecepcion: ahora,
    cliente: {
      nombre: d.clienteNombre.trim(),
      telefono: d.clienteTelefono.trim(),
      cedula: d.clienteCedula?.trim() || undefined,
    },
    dispositivo: {
      tipo: d.tipo,
      marca: d.marca.trim(),
      modelo: d.modelo.trim(),
      accesorios: [],
      condicionFisica: d.condicionFisica?.trim() || 'Sin observaciones',
    },
    problemaReportado: {
      descripcion: d.problema.trim(),
      sintomas: [],
      reproduceProblema: false,
    },
    estado: 'recibido',
    prioridad: d.prioridad,
    tecnicoAsignado: d.tecnicoAsignado || undefined,
    costoEstimado,
    costoFinal: 0,
    valorCobrado: 0,
    anticipo,
    saldoPendiente: Math.max(0, costoEstimado - anticipo),
    insumos: [],
    sinRepuestos: false,
    costoInsumos: 0,
    utilidadNeta: 0,
    pagos,
    historialEstados: [{
      id: `cambio_${Date.now()}`,
      fecha: ahora,
      estadoAnterior: 'recibido',
      estadoNuevo: 'recibido',
      usuario: autor.nombre,
      notas: 'Orden creada desde la app móvil',
    }],
    notasInternas: [],
    creadoPor: autor.nombre,
    fechaCreacion: ahora,
    ultimaActualizacion: ahora,
    notificarCliente: false,
    urgente: d.prioridad === 'urgente',
  };

  const { data, error } = await cliente()
    .from('taller_ordenes')
    .insert({
      cliente_id: autor.clienteId,
      local_id: localId,
      ...columnasDesde(orden),
      datos: orden,
      actualizado_por: autor.nombre,
      actualizado_en: 'pwa',
      updated_at: ahora,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as FilaOrdenTaller;
}

/** Aplica cambios sobre la orden completa y refresca el espejo de columnas. */
async function mutar(
  fila: FilaOrdenTaller,
  autor: Autor,
  aplicar: (orden: OrdenServicio, ahora: string) => OrdenServicio
): Promise<FilaOrdenTaller> {
  const ahora = new Date().toISOString();
  const base: OrdenServicio = { ...(fila.datos || ({} as OrdenServicio)) };
  const actualizada = aplicar(base, ahora);
  actualizada.ultimaActualizacion = ahora;

  const { data, error } = await cliente()
    .from('taller_ordenes')
    .update({
      ...columnasDesde(actualizada),
      datos: actualizada,
      actualizado_por: autor.nombre,
      actualizado_en: 'pwa',
      updated_at: ahora,
    })
    .eq('id', fila.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as FilaOrdenTaller;
}

export function cambiarEstadoOrden(fila: FilaOrdenTaller, autor: Autor, nuevo: EstadoOrden) {
  return mutar(fila, autor, (o, ahora) => {
    const historial = Array.isArray(o.historialEstados) ? o.historialEstados : [];
    return {
      ...o,
      estado: nuevo,
      // Entregar cierra la orden: se sella la fecha para los reportes de la caja.
      fechaEntrega: nuevo === 'entregado' ? ahora : o.fechaEntrega,
      historialEstados: [...historial, {
        id: `cambio_${Date.now()}`,
        fecha: ahora,
        estadoAnterior: o.estado,
        estadoNuevo: nuevo,
        usuario: autor.nombre,
        notas: 'Actualizado desde la app móvil',
      }],
    };
  });
}

export function agregarNotaOrden(
  fila: FilaOrdenTaller,
  autor: Autor,
  texto: string,
  tipo: 'info' | 'alerta' | 'problema' = 'info'
) {
  return mutar(fila, autor, (o, ahora) => {
    const notas = Array.isArray(o.notasInternas) ? o.notasInternas : [];
    return {
      ...o,
      // 🛡️ El campo se llama `nota`, no `texto` (ver types/taller.ts). Con el
      // nombre equivocado la nota se guardaba pero salía en blanco en Electron.
      notasInternas: [...notas, {
        id: `nota_${Date.now()}`,
        fecha: ahora,
        usuario: autor.nombre,
        nota: texto,
        tipo,
      }],
    };
  });
}

export interface DatosCobro {
  monto: number;
  metodoPago: PagoOrden['metodoPago'];
  referencia?: string;
  /** Fija el costo final de la reparación si aún no estaba definido. */
  costoFinal?: number;
}

/**
 * Registra un abono o el pago total. Recalcula anticipo y saldo a partir de la
 * SUMA REAL de pagos, no sumando sobre el valor anterior: así un pago repetido
 * por doble toque no descuadra la cuenta.
 */
export function registrarPagoOrden(fila: FilaOrdenTaller, autor: Autor, cobro: DatosCobro) {
  return mutar(fila, autor, (o, ahora) => {
    const pagos = Array.isArray(o.pagos) ? o.pagos : [];
    const nuevoPago: PagoOrden = {
      id: `pago_${Date.now()}`,
      fecha: ahora,
      monto: Number(cobro.monto) || 0,
      metodoPago: cobro.metodoPago,
      referencia: cobro.referencia || undefined,
      recibidoPor: autor.nombre,
    };
    const todosLosPagos = [...pagos, nuevoPago];
    const pagado = todosLosPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);

    const costoFinal = Number(cobro.costoFinal ?? o.costoFinal) || Number(o.costoEstimado) || 0;
    const costoInsumos = Array.isArray(o.insumos)
      ? o.insumos.reduce((s, i) => s + (Number(i.costoAdquisicion) || 0), 0)
      : 0;

    return {
      ...o,
      pagos: todosLosPagos,
      costoFinal,
      valorCobrado: costoFinal,
      anticipo: pagado,
      saldoPendiente: Math.max(0, costoFinal - pagado),
      costoInsumos,
      utilidadNeta: costoFinal - costoInsumos,
    };
  });
}

export function asignarTecnicoOrden(fila: FilaOrdenTaller, autor: Autor, tecnico: string) {
  return mutar(fila, autor, (o) => ({ ...o, tecnicoAsignado: tecnico || undefined }));
}

/** Fija el presupuesto de la reparación (lo que se le cotiza al cliente). */
export function actualizarPresupuestoOrden(fila: FilaOrdenTaller, autor: Autor, costoFinal: number) {
  return mutar(fila, autor, (o) => {
    const pagado = Array.isArray(o.pagos)
      ? o.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
      : Number(o.anticipo) || 0;
    const valor = Number(costoFinal) || 0;
    return {
      ...o,
      costoFinal: valor,
      valorCobrado: valor,
      saldoPendiente: Math.max(0, valor - pagado),
    };
  });
}
