/**
 * Ventas por área para tiendas de mascotas y veterinarias (pedido de la
 * tienda de don Walter): al cerrar la caja cada área sale con su total y su
 * recibo (granel, peluquería, consultas, medicamentos, accesorios) y además
 * un consolidado con el total del día. La peluquería trae cada perro atendido,
 * para saber cuánto pagarle a la peluquera.
 *
 * Lo comparten la web (CierreCajaPage de pwa) y Electron (CierreCajaPage de
 * app). El área de cada ítem se toma, en este orden, de:
 *   1. `area` guardada en la venta (venta_items.area, migración 0134);
 *   2. el producto: granel, medicamento, accesorio, servicio de peluquería...;
 *   3. el nombre, para servicios viejos sin área ("Corte de Pelo: Toby").
 */

export type AreaVenta = 'granel' | 'alimentos' | 'peluqueria' | 'consultas' | 'medicamentos' | 'accesorios' | 'otros';

export const AREAS: Array<{ id: AreaVenta; nombre: string; recibo: string; color: string }> = [
  { id: 'granel', nombre: 'Alimentos a granel', recibo: 'GRANEL', color: '#10b981' },
  { id: 'alimentos', nombre: 'Alimentos empacados', recibo: 'ALIMENTOS', color: '#84cc16' },
  { id: 'peluqueria', nombre: 'Peluquería (baños y cortes)', recibo: 'PELUQUERIA', color: '#a855f7' },
  { id: 'consultas', nombre: 'Consultas y procedimientos', recibo: 'CONSULTAS', color: '#0ea5e9' },
  { id: 'medicamentos', nombre: 'Medicamentos', recibo: 'MEDICAMENTOS', color: '#ef4444' },
  { id: 'accesorios', nombre: 'Accesorios y juguetes', recibo: 'ACCESORIOS', color: '#f59e0b' },
  { id: 'otros', nombre: 'Otros productos', recibo: 'OTROS', color: '#64748b' },
];

/**
 * Veterinaria: se puede cobrar aunque no haya stock — los servicios (tipo
 * 'servicio') y lo de peluquería y consultas/procedimientos, que muchos
 * negocios crearon como productos normales (p. ej. "BAÑO # 10" con stock 0).
 * Si un producto de esas áreas sí tiene stock, se le sigue descontando.
 * La plataforma decide antes si el módulo Veterinaria está activo.
 */
export function seVendeSinStock(p: ItemParaArea): boolean {
  if (sinTildes(p.tipoProducto) === 'servicio') return true;
  const area = areaDeItem({ ...p, area: null });
  return area === 'peluqueria' || area === 'consultas';
}

/** Categorías que usan los servicios creados desde Veterinaria. */
export const CATEGORIA_PELUQUERIA = 'Peluquería';
export const CATEGORIA_CONSULTAS = 'Consultas y procedimientos';

const sinTildes = (t: unknown) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const ES_AREA = new Set<string>(AREAS.map((a) => a.id));

const PALABRAS_PELUQUERIA = /\b(bano|banos|corte|cortes|unas|peluquer|grooming|estetica|deslanad|motilad|spa|guarderia|hidratacion)/;
const PALABRAS_CONSULTAS = /\b(consulta|procedimiento|cirugi|vacun|honorario|ecograf|sutura|hospitaliz|control|curacion|eutanasia|radiograf|examen|laboratorio|esteriliz|castracion|veterinari)/;

export interface ItemParaArea {
  nombre?: string | null;
  area?: string | null;
  categoria?: string | null;
  tipoProducto?: string | null;
  pesable?: boolean | null;
  requiereReceta?: boolean | null;
}

/** A qué área pertenece un ítem vendido. */
export function areaDeItem(it: ItemParaArea): AreaVenta {
  if (it.area && ES_AREA.has(it.area)) return it.area as AreaVenta;

  const cat = sinTildes(it.categoria);
  const tipo = sinTildes(it.tipoProducto);
  if (tipo === 'granel' || it.pesable || /granel|concentrado/.test(cat)) return 'granel';
  if (/peluquer|estetica|grooming/.test(cat)) return 'peluqueria';
  if (/consulta|procedimiento|servicios medicos/.test(cat)) return 'consultas';

  // Servicios sin categoría clara (o ventas viejas sin producto): por el nombre.
  if (tipo === 'servicio' || !cat || /servicio/.test(cat)) {
    const nombre = sinTildes(it.nombre);
    if (PALABRAS_PELUQUERIA.test(nombre) || /desparasitacion externa/.test(nombre)) return 'peluqueria';
    if (PALABRAS_CONSULTAS.test(nombre)) return 'consultas';
    if (tipo === 'servicio') return 'otros';
  }

  if (it.requiereReceta || /medicament|farmac|desparasit|vacuna|antipulga/.test(cat)) return 'medicamentos';
  // "VETERINARIA" (esterilización, test, nebulización…) son procedimientos del veterinario.
  if (/veterinari/.test(cat)) return 'consultas';
  if (/comida|alimento|concentrado|snack|premio|treat|galleta/.test(cat)) return 'alimentos';
  if (/accesorio|juguete|aseo|higiene|belleza|collar|cama|ropa|lazo|arena|pec|mascota/.test(cat)) return 'accesorios';
  return 'otros';
}

export interface ItemVendido {
  nombre: string;
  cantidad: number;
  total: number;
  area: AreaVenta;
  fecha?: string;
}

export interface ResumenArea {
  area: AreaVenta;
  nombre: string;
  recibo: string;
  color: string;
  total: number;
  /** Líneas vendidas (en peluquería, cada una es un perro atendido). */
  lineas: number;
  items: ItemVendido[];
}

/** Agrupa lo vendido por área. Solo devuelve áreas con ventas, en el orden de AREAS. */
export function agruparPorArea(items: ItemVendido[]): { areas: ResumenArea[]; total: number } {
  const porArea = new Map<AreaVenta, ResumenArea>();
  for (const it of items) {
    const info = AREAS.find((a) => a.id === it.area) || AREAS[AREAS.length - 1];
    const r = porArea.get(info.id) || { area: info.id, nombre: info.nombre, recibo: info.recibo, color: info.color, total: 0, lineas: 0, items: [] };
    r.total += Number(it.total) || 0;
    r.lineas += 1;
    r.items.push(it);
    porArea.set(info.id, r);
  }
  const areas = AREAS.map((a) => porArea.get(a.id)).filter((r): r is ResumenArea => !!r);
  return { areas, total: areas.reduce((s, a) => s + a.total, 0) };
}

/** Perros atendidos en peluquería: cada servicio cobrado es un perro (cantidad 2 = dos perros). */
export const perrosAtendidos = (r: ResumenArea) => r.items.reduce((s, it) => s + Math.max(1, Math.round(Number(it.cantidad) || 1)), 0);

// ── Recibos ────────────────────────────────────────────────────────────────

/** Línea de recibo, para HTML (Electron y diálogo del sistema) y para ESC/POS (impresora directa de la web). */
export interface LineaRecibo {
  texto: string;
  valor?: string;
  negrita?: boolean;
  centro?: boolean;
  separador?: boolean;
}

export interface DatosRecibo {
  negocio?: string;
  /** Logo del negocio (data URL o enlace): sale arriba de cada recibo, ajustado al papel. */
  logo?: string;
  cajero?: string;
  desde?: string;
  hasta?: string;
}

const pesos = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fechaCorta = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 24 horas y sin "p. m.": cabe en un renglón de la tirilla de 58 mm.
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

function encabezado(titulo: string, d: DatosRecibo): LineaRecibo[] {
  const l: LineaRecibo[] = [];
  if (d.negocio) l.push({ texto: d.negocio, negrita: true, centro: true });
  l.push({ texto: titulo, negrita: true, centro: true });
  l.push({ texto: '', separador: true });
  if (d.desde) l.push({ texto: `Desde: ${fechaCorta(d.desde)}` });
  l.push({ texto: `Hasta: ${fechaCorta(d.hasta || new Date().toISOString())}` });
  if (d.cajero) l.push({ texto: `Cajero: ${d.cajero}` });
  l.push({ texto: '', separador: true });
  return l;
}

/** Recibo de un área: cada venta con su valor y el total. */
export function lineasReciboArea(r: ResumenArea, d: DatosRecibo): LineaRecibo[] {
  const l = encabezado(`VENTAS ${r.recibo}`, d);
  // Productos repetidos se suman; en peluquería se deja cada perro aparte.
  const filas = r.area === 'peluqueria'
    ? r.items.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, total: it.total }))
    : [...r.items.reduce((m, it) => {
        const p = m.get(it.nombre) || { nombre: it.nombre, cantidad: 0, total: 0 };
        p.cantidad += Number(it.cantidad) || 0; p.total += Number(it.total) || 0;
        return m.set(it.nombre, p);
      }, new Map<string, { nombre: string; cantidad: number; total: number }>()).values()];
  for (const f of filas) {
    const cant = Number.isInteger(f.cantidad) ? String(f.cantidad) : `${Number(f.cantidad).toFixed(2)}kg`;
    l.push({ texto: `${cant} ${f.nombre}`, valor: pesos(f.total) });
  }
  l.push({ texto: '', separador: true });
  if (r.area === 'peluqueria') l.push({ texto: 'Perros atendidos', valor: String(perrosAtendidos(r)), negrita: true });
  else l.push({ texto: 'Ventas', valor: String(r.lineas) });
  l.push({ texto: `TOTAL ${r.recibo}`, valor: pesos(r.total), negrita: true });
  return l;
}

/** Consolidado: el total de cada área y el total del día. */
export function lineasConsolidado(areas: ResumenArea[], total: number, d: DatosRecibo): LineaRecibo[] {
  const l = encabezado('CONSOLIDADO DE VENTAS', d);
  for (const a of areas) {
    l.push({ texto: a.nombre, valor: pesos(a.total) });
    if (a.area === 'peluqueria') l.push({ texto: `  ${perrosAtendidos(a)} perros atendidos` });
  }
  l.push({ texto: '', separador: true });
  l.push({ texto: 'TOTAL VENTAS DEL DIA', valor: pesos(total), negrita: true });
  return l;
}

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** HTML de uno o varios recibos (cada uno en su propia hoja/corte), con el logo arriba si lo hay. */
export function htmlRecibos(recibos: LineaRecibo[][], anchoMm: 58 | 80 = 80, logo?: string): string {
  const imgLogo = logo ? `<img class="logo" src="${esc(logo)}" alt="">` : '';
  const cuerpo = recibos.map((lineas) => `<div class="recibo">${imgLogo}${lineas.map((x) => {
    if (x.separador) return '<div class="sep"></div>';
    const cls = `${x.negrita ? 'b ' : ''}${x.centro ? 'c' : ''}`;
    return x.valor !== undefined
      ? `<div class="fila ${cls}"><span>${esc(x.texto)}</span><span>${esc(x.valor)}</span></div>`
      : `<div class="${cls}">${esc(x.texto)}</div>`;
  }).join('')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ventas por área</title><style>
    @page { size: ${anchoMm}mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${anchoMm - 4}mm; font: 12px/1.35 'Courier New', monospace; color: #000; background: #fff; }
    .recibo { padding: 2mm 0 6mm; break-after: page; page-break-after: always; }
    .recibo:last-child { break-after: auto; page-break-after: auto; }
    .recibo > div { white-space: pre-wrap; }
    /* El logo se ajusta al papel sin deformarse: nunca más ancho que el 70 % ni más alto que 22 mm. */
    .logo { display: block; margin: 0 auto 4px; max-width: 70%; max-height: 22mm; object-fit: contain; }
    .b { font-weight: bold; } .c { text-align: center; }
    .fila { display: flex; justify-content: space-between; gap: 6px; }
    .fila span:first-child { overflow-wrap: anywhere; }
    .fila span:last-child { white-space: nowrap; }
    .sep { border-top: 1px dashed #000; margin: 4px 0; }
  </style></head><body>${cuerpo}</body></html>`;
}
