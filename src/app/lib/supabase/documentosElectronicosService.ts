/**
 * Recepción y causación de documentos electrónicos DIAN contra Supabase
 * (tabla documentos_electronicos, migración 0099).
 *
 * El análisis del XML NO ocurre aquí: lo hace el motor de
 * ../dian/recepcion (portado de Codec Document). Este archivo solo persiste
 * lo ya analizado y dispara la causación, que es atómica en la base de datos
 * (RPC causar_documento_electronico): gasto + proveedor + inventario o nada.
 */
import { getSupabaseClient } from './config';
import { marcarDireccion } from '../dian/recepcion/parser';
import type { ArchivoLeido } from '../dian/recepcion/archivos';
import type { Excepcion, Impuesto, LineaDocumento, TipoDocumento, Direccion } from '../dian/recepcion/types';

export type EstadoDocumentoElectronico = 'procesado' | 'revision' | 'invalido';

export interface DocumentoElectronico {
  id: string;
  tipo: TipoDocumento;
  direccion: Direccion;
  cufe: string | null;
  numeroCompleto: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  formaPago: string | null;
  emisorNit: string | null;
  emisorNombre: string | null;
  receptorNit: string | null;
  receptorNombre: string | null;
  subtotal: number;
  totalIva: number;
  totalInc: number;
  totalImpuestos: number;
  totalRetenciones: number;
  total: number;
  estado: EstadoDocumentoElectronico;
  excepciones: Excepcion[];
  lineas: LineaDocumento[];
  impuestos: Impuesto[];
  validadoDian: boolean;
  nombreArchivo: string | null;
  causado: boolean;
  causadoAt: string | null;
  causadoPorNombre: string | null;
  createdAt: string;
  /** Solo viene en obtenerDocumentoElectronico(): pesa ~50 KB por documento. */
  xml?: string | null;
}

// Todo menos `xml`: el listado puede traer cientos de filas.
const COLUMNAS_LISTADO =
  'id, tipo, direccion, cufe, numero_completo, fecha_emision, fecha_vencimiento, forma_pago, ' +
  'emisor_nit, emisor_nombre, receptor_nit, receptor_nombre, subtotal, total_iva, total_inc, ' +
  'total_impuestos, total_retenciones, total, estado, excepciones, lineas, impuestos, validado_dian, ' +
  'nombre_archivo, causado, causado_at, causado_por_nombre, created_at';

function filaADocumento(f: any): DocumentoElectronico {
  return {
    id: f.id,
    tipo: f.tipo,
    direccion: f.direccion,
    cufe: f.cufe,
    numeroCompleto: f.numero_completo,
    fechaEmision: f.fecha_emision,
    fechaVencimiento: f.fecha_vencimiento,
    formaPago: f.forma_pago,
    emisorNit: f.emisor_nit,
    emisorNombre: f.emisor_nombre,
    receptorNit: f.receptor_nit,
    receptorNombre: f.receptor_nombre,
    subtotal: Number(f.subtotal) || 0,
    totalIva: Number(f.total_iva) || 0,
    totalInc: Number(f.total_inc) || 0,
    totalImpuestos: Number(f.total_impuestos) || 0,
    totalRetenciones: Number(f.total_retenciones) || 0,
    total: Number(f.total) || 0,
    estado: f.estado,
    excepciones: f.excepciones || [],
    lineas: f.lineas || [],
    impuestos: f.impuestos || [],
    validadoDian: !!f.validado_dian,
    nombreArchivo: f.nombre_archivo,
    causado: !!f.causado,
    causadoAt: f.causado_at,
    causadoPorNombre: f.causado_por_nombre,
    createdAt: f.created_at,
    xml: f.xml,
  };
}

/** Postgres rechaza '' donde espera date: un campo vacío debe llegar NULL. */
const fecha = (v: string | undefined): string | null => v?.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const txt = (v: string | undefined): string | null => v?.trim() || null;

function estadoDe(leido: ArchivoLeido): EstadoDocumentoElectronico {
  const { documento, excepciones } = leido.resultado;
  if (!documento || excepciones.some((e) => e.severidad === 'error')) return 'invalido';
  if (excepciones.some((e) => e.severidad === 'revision')) return 'revision';
  return 'procesado';
}

function construirFila(leido: ArchivoLeido, clienteId: string, empleadoId: string | null, nitPropio: string) {
  const base = {
    cliente_id: clienteId,
    hash_sha256: leido.hash,
    nombre_archivo: leido.nombre,
    xml: leido.xml,
    estado: estadoDe(leido),
    excepciones: leido.resultado.excepciones,
    validado_dian: leido.resultado.validacionDian?.validado ?? false,
    subido_por: empleadoId,
  };
  if (!leido.resultado.documento) return base;

  const d = marcarDireccion(leido.resultado.documento, nitPropio);
  const impuestosDocumento = d.impuestos.filter((i) => i.alcance === 'documento');
  return {
    ...base,
    tipo: d.tipo,
    tipo_codigo: txt(d.tipoCodigo),
    direccion: d.direccion,
    cufe: txt(d.cufe),
    prefijo: txt(d.prefijo),
    numero: txt(d.numero),
    numero_completo: txt(d.numeroCompleto),
    fecha_emision: fecha(d.fechaEmision),
    fecha_vencimiento: fecha(d.fechaVencimiento),
    moneda: d.moneda || 'COP',
    forma_pago: txt(d.formaPago),
    emisor_nit: txt(d.emisor.nit),
    emisor_dv: txt(d.emisor.dv),
    emisor_nombre: txt(d.emisor.razonSocial) || txt(d.emisor.nombreComercial),
    receptor_nit: txt(d.receptor.nit),
    receptor_nombre: txt(d.receptor.razonSocial) || txt(d.receptor.nombreComercial),
    subtotal: d.totales.brutoLineas,
    total_iva: d.resumen.iva,
    total_inc: d.resumen.inc,
    total_impuestos: d.resumen.totalImpuestos,
    total_retenciones: d.resumen.totalRetenciones,
    total: d.totales.total,
    lineas: d.lineas,
    impuestos: impuestosDocumento.length > 0 ? impuestosDocumento : d.impuestos,
    version_motor: d.versionMotor,
  };
}

export interface ResumenCarga {
  nuevos: number;
  duplicados: number;
  invalidos: number;
  enRevision: number;
  fallidos: Array<{ nombre: string; mensaje: string }>;
}

const partir = <T,>(lista: T[], tam: number): T[][] => {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) salida.push(lista.slice(i, i + tam));
  return salida;
};

/**
 * Guarda los documentos ya analizados, saltándose los que el negocio ya
 * tenía (mismo archivo o mismo CUFE). `nitPropio` es el NIT del perfil
 * fiscal del negocio: decide si cada documento es recibido o emitido.
 */
export async function guardarDocumentosLeidos(
  leidos: ArchivoLeido[],
  contexto: { clienteId: string; empleadoId: string | null; nitPropio: string },
): Promise<ResumenCarga> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const resumen: ResumenCarga = { nuevos: 0, duplicados: 0, invalidos: 0, enRevision: 0, fallidos: [] };
  if (leidos.length === 0) return resumen;

  const hashesExistentes = new Set<string>();
  const cufesExistentes = new Set<string>();
  for (const grupo of partir(leidos, 150)) {
    const hashes = grupo.map((l) => l.hash);
    const cufes = grupo.map((l) => l.resultado.documento?.cufe).filter((c): c is string => !!c);
    const [porHash, porCufe] = await Promise.all([
      client.from('documentos_electronicos').select('hash_sha256').eq('cliente_id', contexto.clienteId).in('hash_sha256', hashes),
      cufes.length
        ? client.from('documentos_electronicos').select('cufe').eq('cliente_id', contexto.clienteId).in('cufe', cufes)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (porHash.error) throw new Error(porHash.error.message);
    if (porCufe.error) throw new Error(porCufe.error.message);
    for (const f of (porHash.data as any[]) || []) hashesExistentes.add(f.hash_sha256);
    for (const f of (porCufe.data as any[]) || []) cufesExistentes.add(f.cufe);
  }

  const pendientes: ArchivoLeido[] = [];
  for (const l of leidos) {
    const cufe = l.resultado.documento?.cufe;
    if (hashesExistentes.has(l.hash) || (cufe && cufesExistentes.has(cufe))) {
      resumen.duplicados++;
      continue;
    }
    // Mismo CUFE dos veces dentro de la misma carga (XML suelto + el mismo
    // dentro de su AttachedDocument): gana el primero.
    if (cufe) cufesExistentes.add(cufe);
    pendientes.push(l);
  }

  const contar = (l: ArchivoLeido) => {
    resumen.nuevos++;
    const estado = estadoDe(l);
    if (estado === 'invalido') resumen.invalidos++;
    if (estado === 'revision') resumen.enRevision++;
  };

  // Lotes pequeños: cada fila lleva su XML (~50 KB).
  for (const grupo of partir(pendientes, 20)) {
    const filas = grupo.map((l) => construirFila(l, contexto.clienteId, contexto.empleadoId, contexto.nitPropio));
    const { error } = await client.from('documentos_electronicos').insert(filas);
    if (!error) { grupo.forEach(contar); continue; }

    // Si el lote falla (p. ej. otra pestaña subió uno de estos a la vez), se
    // reintenta de a uno para no perder los demás por un solo duplicado.
    for (let i = 0; i < grupo.length; i++) {
      const { error: errorUno } = await client.from('documentos_electronicos').insert(filas[i]);
      if (!errorUno) contar(grupo[i]);
      else if (errorUno.code === '23505') resumen.duplicados++;
      else resumen.fallidos.push({ nombre: grupo[i].nombre, mensaje: errorUno.message });
    }
  }

  return resumen;
}

export interface FiltrosDocumentos {
  clienteId: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

export async function listarDocumentosElectronicos(filtros: FiltrosDocumentos): Promise<DocumentoElectronico[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from('documentos_electronicos')
    .select(COLUMNAS_LISTADO)
    .eq('cliente_id', filtros.clienteId)
    .order('fecha_emision', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(filtros.limite ?? 500);

  if (filtros.desde) query = query.gte('fecha_emision', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha_emision', filtros.hasta);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map(filaADocumento);
}

export async function obtenerDocumentoElectronico(id: string): Promise<DocumentoElectronico | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.from('documentos_electronicos').select(`${COLUMNAS_LISTADO}, xml`).eq('id', id).maybeSingle();
  return data ? filaADocumento(data) : null;
}

export interface LineaInventarioCausacion {
  productoId: string;
  cantidad: number;
  costoUnitario: number;
}

export interface DatosCausacion {
  documentoId: string;
  categoria: string;
  medioPago: string;
  aCredito: boolean;
  /** Fecha con la que queda el gasto (por defecto, la de emisión de la factura). */
  fecha: string;
  /** uuid de `empleados`; null cuando opera un usuario local de Electron. */
  empleadoId: string | null;
  empleadoNombre: string;
  lineasInventario: LineaInventarioCausacion[];
}

export async function causarDocumentoElectronico(datos: DatosCausacion): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.rpc('causar_documento_electronico', {
    p_documento_id: datos.documentoId,
    p_categoria: datos.categoria,
    p_medio_pago: datos.medioPago,
    p_a_credito: datos.aCredito,
    p_fecha: datos.fecha,
    p_empleado_id: datos.empleadoId,
    p_empleado_nombre: datos.empleadoNombre,
    p_lineas_inventario: datos.lineasInventario.map((l) => ({
      producto_id: l.productoId,
      cantidad: l.cantidad,
      costo_unitario: l.costoUnitario,
    })),
  });
  if (error) throw new Error(error.message);
}

export async function revertirCausacionDocumento(documentoId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.rpc('revertir_causacion_documento', { p_documento_id: documentoId });
  if (error) throw new Error(error.message);
}

/** Solo documentos sin causar: borrar uno causado dejaría el gasto huérfano. */
export async function eliminarDocumentoElectronico(documentoId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.from('documentos_electronicos').delete().eq('id', documentoId).eq('causado', false);
  if (error) throw new Error(error.message);
}
