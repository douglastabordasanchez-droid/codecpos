/**
 * Descarga en Excel de la sección Mascotas (Electron, web y celular): cada
 * opción es un libro (hoja) y "Todo" los pone juntos en un solo archivo.
 * Todo sale de la nube, así los tres sistemas descargan lo mismo.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { listarMascotas } from '../../app/lib/supabase/mascotasService';
import { listarCitasGrooming } from '../../app/lib/supabase/citasGroomingService';
import { traerTodo } from './nubeConsultas';
import { AREAS, areaDeItem, type AreaVenta } from './ventasPorArea';

export type LibroMascotas = 'historias' | 'peluqueria' | 'ventas';

export const LIBROS_MASCOTAS: Array<{ id: LibroMascotas; nombre: string; detalle: string }> = [
  { id: 'historias', nombre: 'Historias clínicas', detalle: 'Mascotas, vacunas, consultas y pesos' },
  { id: 'peluqueria', nombre: 'Peluquería', detalle: 'Cobros de peluquería y citas' },
  { id: 'ventas', nombre: 'Ventas por área', detalle: 'Cada venta con su área y el resumen' },
];

const nombreArea = (a: AreaVenta) => AREAS.find((x) => x.id === a)?.nombre ?? a;
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO') : '');
const fechaHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const TIPO_EVENTO: Record<string, string> = { vacuna: 'Vacuna', desparasitacion: 'Desparasitación', consulta: 'Consulta', cirugia: 'Cirugía', otro: 'Otro' };

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

type ItemVenta = { factura: string; fecha: string; pago: string; nombre: string; cantidad: number; total: number; area: AreaVenta };

async function itemsVendidos(clienteId: string, desde: Date, hasta: Date): Promise<ItemVenta[]> {
  const c = cliente();
  const ventas = await traerTodo<any>((i, j) => c.from('ventas').select('id, numero, created_at, metodo_pago')
    .eq('cliente_id', clienteId).eq('estado', 'completada')
    .gte('created_at', desde.toISOString()).lt('created_at', hasta.toISOString())
    .order('created_at').range(i, j));
  const porId = new Map(ventas.map((v) => [v.id, v]));
  const ids = ventas.map((v) => v.id);
  const PRODUCTO = 'productos(categoria, tipo_producto, requiere_receta)';
  const filas: any[] = [];
  let conArea = true;
  for (let k = 0; k < ids.length; k += 200) {
    const lote = ids.slice(k, k + 200);
    let r: any = await c.from('venta_items').select(`venta_id, nombre, cantidad, subtotal, ${conArea ? 'area, ' : ''}${PRODUCTO}`).in('venta_id', lote);
    // Sin la columna "area" (migración 0134) se deduce por el producto, igual que el cierre.
    if (r.error && conArea && /area/i.test(r.error.message)) {
      conArea = false;
      r = await c.from('venta_items').select(`venta_id, nombre, cantidad, subtotal, ${PRODUCTO}`).in('venta_id', lote);
    }
    if (r.error) throw new Error(r.error.message);
    filas.push(...(r.data || []));
  }
  return filas.map((f) => {
    const v = porId.get(f.venta_id);
    return {
      factura: String(v?.numero ?? ''),
      fecha: v?.created_at ?? '',
      pago: String(v?.metodo_pago ?? ''),
      nombre: String(f.nombre || 'Producto'),
      cantidad: Number(f.cantidad) || 0,
      total: Number(f.subtotal) || 0,
      area: areaDeItem({
        nombre: f.nombre, area: f.area, categoria: f.productos?.categoria,
        tipoProducto: f.productos?.tipo_producto, requiereReceta: f.productos?.requiere_receta,
      }),
    };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function hojasHistorias(clienteId: string) {
  const mascotas = await listarMascotas('', clienteId);
  const ids = mascotas.map((m) => m.id);
  const c = cliente();
  const eventos: any[] = [];
  const pesos: any[] = [];
  for (let k = 0; k < ids.length; k += 200) {
    const lote = ids.slice(k, k + 200);
    const [e, p] = await Promise.all([
      c.from('mascota_eventos').select('mascota_id, tipo, descripcion, fecha, proxima_fecha, veterinario, notas').in('mascota_id', lote).order('fecha'),
      c.from('mascota_peso').select('mascota_id, peso, fecha').in('mascota_id', lote).order('fecha'),
    ]);
    if (e.error) throw new Error(e.error.message);
    if (p.error) throw new Error(p.error.message);
    eventos.push(...(e.data || []));
    pesos.push(...(p.data || []));
  }
  const m = new Map(mascotas.map((x) => [x.id, x]));
  return {
    'Mascotas': mascotas.map((x) => ({
      'Mascota': x.nombre, 'Especie': x.especie ?? '', 'Raza': x.raza ?? '', 'Sexo': x.sexo ?? '',
      'Nacimiento': fecha(x.fechaNacimiento), 'Color': x.color ?? '', 'Peso actual (kg)': x.pesoActual ?? '',
      'Alergias': x.alergias ?? '', 'Dueño': x.propietarioNombre, 'Teléfono': x.propietarioTelefono ?? '',
      'Notas': x.notas ?? '', 'Registrada': fecha(x.createdAt),
    })),
    'Historias clínicas': eventos.map((e) => ({
      'Fecha': fecha(e.fecha), 'Mascota': m.get(e.mascota_id)?.nombre ?? '', 'Dueño': m.get(e.mascota_id)?.propietarioNombre ?? '',
      'Tipo': TIPO_EVENTO[e.tipo] ?? e.tipo, 'Descripción': e.descripcion ?? '', 'Próxima fecha': fecha(e.proxima_fecha),
      'Veterinario': e.veterinario ?? '', 'Notas': e.notas ?? '',
    })),
    'Pesos': pesos.map((p) => ({
      'Fecha': fecha(p.fecha), 'Mascota': m.get(p.mascota_id)?.nombre ?? '', 'Peso (kg)': Number(p.peso),
    })),
  };
}

const filaVenta = (it: ItemVenta) => ({
  'Fecha': fechaHora(it.fecha), 'Factura': it.factura, 'Producto o servicio': it.nombre, 'Área': nombreArea(it.area),
  'Cantidad': it.cantidad, 'Total': it.total, 'Pago': it.pago,
});

/** Arma y descarga el Excel. Devuelve el nombre del archivo. */
export async function descargarExcelMascotas(p: { clienteId: string; libros: LibroMascotas[]; desde: Date; hasta: Date }): Promise<string> {
  if (!p.clienteId) throw new Error('No se encontró el negocio. Inicia sesión otra vez.');
  const hojas: Record<string, Record<string, unknown>[]> = {};
  const necesitaVentas = p.libros.includes('peluqueria') || p.libros.includes('ventas');
  const [historias, items, citas] = await Promise.all([
    p.libros.includes('historias') ? hojasHistorias(p.clienteId) : null,
    necesitaVentas ? itemsVendidos(p.clienteId, p.desde, p.hasta) : null,
    p.libros.includes('peluqueria') ? listarCitasGrooming(p.desde, p.hasta, p.clienteId) : null,
  ]);
  if (historias) Object.assign(hojas, historias);
  if (items && p.libros.includes('peluqueria')) {
    hojas['Peluquería'] = items.filter((it) => it.area === 'peluqueria').map(filaVenta);
    hojas['Citas'] = (citas || []).map((ci) => ({
      'Fecha': fechaHora(ci.fechaHora), 'Mascota': ci.mascotaNombre, 'Dueño': ci.tutorNombre, 'Teléfono': ci.tutorTelefono ?? '',
      'Servicio': ci.servicio, 'Precio': ci.precio, 'Estado': ci.estado, 'Observaciones': ci.observaciones ?? '',
    }));
  }
  if (items && p.libros.includes('ventas')) {
    hojas['Resumen por área'] = AREAS.map((a) => {
      const del = items.filter((it) => it.area === a.id);
      return { 'Área': a.nombre, 'Productos vendidos': del.length, 'Total': del.reduce((s, it) => s + it.total, 0) };
    }).concat([{ 'Área': 'TOTAL', 'Productos vendidos': items.length, 'Total': items.reduce((s, it) => s + it.total, 0) }]);
    hojas['Ventas'] = items.map(filaVenta);
  }

  // Se carga solo al descargar: no pesa al abrir la pantalla.
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([['Sin datos en este periodo']]);
    const cols = filas.length ? Object.keys(filas[0]) : ['x'];
    hoja['!cols'] = cols.map((c) => ({ wch: Math.min(45, Math.max(c.length + 2, ...filas.slice(0, 200).map((f) => String(f[c] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const archivo = `Mascotas_${p.libros.length === LIBROS_MASCOTAS.length ? 'todo' : p.libros.join('_')}_${dia(p.desde)}_a_${dia(new Date(p.hasta.getTime() - 1))}.xlsx`;
  XLSX.writeFile(libro, archivo);
  return archivo;
}
