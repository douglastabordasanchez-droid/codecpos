/**
 * Impresora térmica y cajón monedero desde la web y el celular.
 *
 * Usa el MISMO generador de tickets de Electron (src/app/lib/thermalPrinter.ts,
 * comandos ESC/POS), y solo cambia por dónde salen los bytes:
 *   · USB        → WebUSB (Chrome/Edge en computador y Android con cable OTG).
 *   · Serie      → Web Serial (Chrome/Edge en computador: impresoras por COM o USB-serie).
 *   · Bluetooth  → Web Bluetooth (Chrome en Android y computador; impresoras BLE).
 *   · Sistema    → el diálogo de impresión del navegador (cualquier impresora
 *                  instalada; en iPhone, AirPrint). Sin ESC/POS: el cajón no abre.
 * El cajón monedero se abre con el pulso ESC/POS que manda la impresora a la
 * que está conectado (RJ11), así que funciona con USB, serie y Bluetooth.
 *
 * La configuración es de ESTE dispositivo (localStorage).
 */
import { ThermalPrinter, type TicketData } from '../../app/lib/thermalPrinter';

export type TipoConexion = 'usb' | 'serial' | 'bluetooth' | 'sistema';

export interface ConfigDispositivos {
  impresora: {
    tipo: TipoConexion | null;
    nombre: string;
    ancho: 58 | 80;
    usb?: { vendorId: number; productId: number; serial?: string };
    serial?: { usbVendorId?: number; usbProductId?: number; baudRate: number };
    bluetooth?: { id: string };
  };
  imprimirAlVender: boolean;
  copias: number;
  cajon: { abrirConEfectivo: boolean; abrirSiempre: boolean };
}

const CLAVE = 'codecpos_dispositivos_web';
export const EVENTO_DISPOSITIVOS = 'codecpos:dispositivos-web';
const POR_DEFECTO: ConfigDispositivos = {
  impresora: { tipo: null, nombre: '', ancho: 80 },
  imprimirAlVender: false,
  copias: 1,
  cajon: { abrirConEfectivo: true, abrirSiempre: false },
};

export function obtenerDispositivos(): ConfigDispositivos {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return { ...POR_DEFECTO, ...g, impresora: { ...POR_DEFECTO.impresora, ...g.impresora }, cajon: { ...POR_DEFECTO.cajon, ...g.cajon } };
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarDispositivos(cambios: Partial<ConfigDispositivos>): ConfigDispositivos {
  const nueva = { ...obtenerDispositivos(), ...cambios };
  try { localStorage.setItem(CLAVE, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EVENTO_DISPOSITIVOS));
  return nueva;
}

// ── Qué permite este navegador ─────────────────────────────────────────────
const nav = () => (typeof navigator !== 'undefined' ? (navigator as any) : {});
export const soporte = {
  usb: () => !!nav().usb,
  serial: () => !!nav().serial,
  bluetooth: () => !!nav().bluetooth,
};

// ── USB ────────────────────────────────────────────────────────────────────
let usbActual: any = null;
let usbSalida: number | null = null;

async function abrirUsb(dispositivo: any) {
  if (!dispositivo.opened) await dispositivo.open();
  if (dispositivo.configuration === null) await dispositivo.selectConfiguration(1);
  for (const interfaz of dispositivo.configuration.interfaces) {
    for (const alterna of interfaz.alternates) {
      const salida = alterna.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
      if (salida) {
        if (!interfaz.claimed) await dispositivo.claimInterface(interfaz.interfaceNumber);
        usbActual = dispositivo;
        usbSalida = salida.endpointNumber;
        return;
      }
    }
  }
  throw new Error('La impresora USB no tiene una salida de datos disponible.');
}

async function enviarUsb(bytes: Uint8Array): Promise<boolean> {
  const cfg = obtenerDispositivos().impresora.usb;
  if (!usbActual) {
    const conocidos: any[] = await nav().usb.getDevices();
    const d = conocidos.find((x) => x.vendorId === cfg?.vendorId && x.productId === cfg?.productId);
    if (!d) throw new Error('No se encuentra la impresora USB. Conéctala o vuelve a elegirla en Dispositivos.');
    await abrirUsb(d);
  }
  for (let i = 0; i < bytes.length; i += 4096) {
    await usbActual.transferOut(usbSalida, bytes.slice(i, i + 4096));
  }
  return true;
}

// ── Serie ──────────────────────────────────────────────────────────────────
async function enviarSerial(bytes: Uint8Array): Promise<boolean> {
  const cfg = obtenerDispositivos().impresora.serial;
  const puertos: any[] = await nav().serial.getPorts();
  const puerto = puertos.find((p) => {
    const info = p.getInfo?.() || {};
    return !cfg?.usbVendorId || (info.usbVendorId === cfg.usbVendorId && info.usbProductId === cfg.usbProductId);
  }) || puertos[0];
  if (!puerto) throw new Error('No se encuentra la impresora por puerto serie. Vuelve a elegirla en Dispositivos.');
  if (!puerto.writable) await puerto.open({ baudRate: cfg?.baudRate || 9600 });
  const escritor = puerto.writable.getWriter();
  try { await escritor.write(bytes); } finally { escritor.releaseLock(); }
  return true;
}

// ── Bluetooth ──────────────────────────────────────────────────────────────
// Servicios de las impresoras térmicas Bluetooth más comunes (genéricas chinas, Xprinter, MPT, etc.).
const SERVICIOS_BT = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
];
let btCaracteristica: any = null;

async function conectarCaracteristicaBt(dispositivo: any) {
  const servidor = dispositivo.gatt.connected ? dispositivo.gatt : await dispositivo.gatt.connect();
  for (const uuid of SERVICIOS_BT) {
    try {
      const servicio = await servidor.getPrimaryService(uuid);
      for (const c of await servicio.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) { btCaracteristica = c; return; }
      }
    } catch { /* este servicio no existe en la impresora */ }
  }
  throw new Error('La impresora Bluetooth no aceptó datos. Prueba con otra o usa USB.');
}

async function enviarBluetooth(bytes: Uint8Array): Promise<boolean> {
  if (!btCaracteristica || !btCaracteristica.service.device.gatt.connected) {
    const cfg = obtenerDispositivos().impresora.bluetooth;
    const conocidos: any[] = nav().bluetooth.getDevices ? await nav().bluetooth.getDevices() : [];
    const d = conocidos.find((x) => x.id === cfg?.id);
    if (!d) throw new Error('Vuelve a conectar la impresora Bluetooth en Dispositivos (el navegador pide permiso en cada sesión).');
    await conectarCaracteristicaBt(d);
  }
  for (let i = 0; i < bytes.length; i += 180) {
    const trozo = bytes.slice(i, i + 180);
    if (btCaracteristica.properties.writeWithoutResponse) await btCaracteristica.writeValueWithoutResponse(trozo);
    else await btCaracteristica.writeValue(trozo);
  }
  return true;
}

// ── Elegir impresora (debe llamarse desde un toque) ────────────────────────
export async function elegirImpresora(tipo: TipoConexion): Promise<ConfigDispositivos> {
  const actual = obtenerDispositivos();
  if (tipo === 'usb') {
    const d = await nav().usb.requestDevice({ filters: [] });
    await abrirUsb(d);
    return guardarDispositivos({ impresora: { ...actual.impresora, tipo, nombre: d.productName || 'Impresora USB', usb: { vendorId: d.vendorId, productId: d.productId, serial: d.serialNumber } } });
  }
  if (tipo === 'serial') {
    const p = await nav().serial.requestPort();
    const info = p.getInfo?.() || {};
    return guardarDispositivos({ impresora: { ...actual.impresora, tipo, nombre: 'Impresora por puerto serie', serial: { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId, baudRate: actual.impresora.serial?.baudRate || 9600 } } });
  }
  if (tipo === 'bluetooth') {
    const d = await nav().bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BT });
    await conectarCaracteristicaBt(d);
    return guardarDispositivos({ impresora: { ...actual.impresora, tipo, nombre: d.name || 'Impresora Bluetooth', bluetooth: { id: d.id } } });
  }
  return guardarDispositivos({ impresora: { ...actual.impresora, tipo: 'sistema', nombre: 'Impresora del sistema' } });
}

export function olvidarImpresora() {
  usbActual = null;
  btCaracteristica = null;
  return guardarDispositivos({ impresora: { ...POR_DEFECTO.impresora, ancho: obtenerDispositivos().impresora.ancho } });
}

// ── Enviar ─────────────────────────────────────────────────────────────────
async function enviar(bytes: Uint8Array): Promise<boolean> {
  const tipo = obtenerDispositivos().impresora.tipo;
  if (tipo === 'usb') return enviarUsb(bytes);
  if (tipo === 'serial') return enviarSerial(bytes);
  if (tipo === 'bluetooth') return enviarBluetooth(bytes);
  throw new Error('Esta impresora no recibe comandos directos.');
}

function impresora(): ThermalPrinter {
  return new ThermalPrinter({ puerto: 'web', ancho: obtenerDispositivos().impresora.ancho, transporte: enviar });
}

export const tieneImpresoraDirecta = () => ['usb', 'serial', 'bluetooth'].includes(obtenerDispositivos().impresora.tipo || '');

export async function abrirCajon(): Promise<boolean> {
  if (!tieneImpresoraDirecta()) return false;
  return impresora().openDrawer();
}

export async function imprimirPrueba(): Promise<boolean> {
  if (obtenerDispositivos().impresora.tipo === 'sistema') { imprimirHtml(htmlPrueba()); return true; }
  return impresora().printTestTicket();
}

/** Imprime el ticket de una venta con la impresora configurada (o el diálogo del sistema). */
export async function imprimirTicket(datos: TicketData): Promise<boolean> {
  const cfg = obtenerDispositivos();
  if (cfg.impresora.tipo === 'sistema' || !cfg.impresora.tipo) {
    imprimirHtml(htmlTicket(datos, cfg.impresora.ancho));
    return true;
  }
  const p = impresora();
  let ok = true;
  for (let i = 0; i < Math.max(1, cfg.copias); i++) ok = (await p.printTicket(datos)) && ok;
  return ok;
}

// ── Diálogo de impresión del sistema (cualquier impresora, AirPrint en iPhone) ──
function imprimirHtml(html: string) {
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(marco);
  const doc = marco.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  const lanzar = () => {
    marco.contentWindow!.focus();
    marco.contentWindow!.print();
    setTimeout(() => marco.remove(), 60_000);
  };
  // Espera a que cargue el logo antes de imprimir.
  if (doc.readyState === 'complete') setTimeout(lanzar, 300);
  else marco.onload = () => setTimeout(lanzar, 300);
}

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const pesos = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

function marcoHtml(cuerpo: string, ancho: 58 | 80) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>
    @page { size: ${ancho}mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${ancho - 4}mm; font: 11px/1.35 'Courier New', monospace; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 15px; } .r { text-align: right; }
    .l { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    img { max-width: 60%; max-height: 22mm; display: block; margin: 0 auto 4px; }
  </style></head><body>${cuerpo}</body></html>`;
}

function htmlTicket(d: TicketData, ancho: 58 | 80) {
  const filas = d.items.map((it) => `<tr><td>${it.cantidad} ${esc(it.nombre)}</td><td class="r">${pesos(it.total)}</td></tr>`).join('');
  const fecha = d.fecha ? new Date(d.fecha) : new Date();
  return marcoHtml(`
    ${d.logoUrl ? `<img src="${esc(d.logoUrl)}">` : ''}
    <div class="c b g">${esc(d.header || '')}</div>
    ${d.razonSocial && d.razonSocial !== d.header ? `<div class="c">${esc(d.razonSocial)}</div>` : ''}
    ${d.nit ? `<div class="c">NIT ${esc(d.nit)}</div>` : ''}
    ${d.direccion ? `<div class="c">${esc(d.direccion)}${d.ciudad ? `, ${esc(d.ciudad)}` : ''}</div>` : ''}
    ${d.telefono ? `<div class="c">Tel: ${esc(d.telefono)}</div>` : ''}
    <div class="l"></div>
    <div class="c b">FACTURA DE VENTA</div>
    <div class="c">No. ${esc(d.numeroFactura || '')}</div>
    <div>Fecha: ${fecha.toLocaleDateString('es-CO')} ${fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
    ${d.cajero ? `<div>Atendió: ${esc(d.cajero)}</div>` : ''}
    <div class="l"></div>
    <table>${filas}</table>
    <div class="l"></div>
    <table>
      ${d.descuento ? `<tr><td>Descuento</td><td class="r">${pesos(d.descuento)}</td></tr>` : ''}
      ${d.impuestos ? `<tr><td>IVA</td><td class="r">${pesos(d.impuestos)}</td></tr>` : ''}
      ${d.propina ? `<tr><td>Propina</td><td class="r">${pesos(d.propina)}</td></tr>` : ''}
      <tr class="b g"><td>TOTAL</td><td class="r">${pesos(d.total)}</td></tr>
      ${d.metodoPago ? `<tr><td>Pago</td><td class="r">${esc(d.metodoPago)}</td></tr>` : ''}
      ${d.cambio ? `<tr><td>Cambio</td><td class="r">${pesos(d.cambio)}</td></tr>` : ''}
    </table>
    <div class="l"></div>
    ${d.mensajeTirillaBajo ? `<div class="c">${esc(d.mensajeTirillaBajo)}</div>` : '<div class="c">¡Gracias por su compra!</div>'}
    <div class="c" style="font-size:9px;margin-top:4px">Codec POS</div>
  `, ancho);
}

function htmlPrueba() {
  return marcoHtml(`<div class="c b g">PRUEBA DE IMPRESIÓN</div><div class="l"></div><div class="c">Codec POS</div><div class="c">${new Date().toLocaleString('es-CO')}</div><div class="l"></div><div class="c">Si lees esto, la impresora quedó lista.</div>`, obtenerDispositivos().impresora.ancho);
}
