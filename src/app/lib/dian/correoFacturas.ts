/**
 * Envío de facturas por correo desde la cuenta del propio negocio (Gmail con
 * contraseña de aplicación u otro SMTP), a través de la Edge Function
 * correo-facturas. Sin proveedor pagado: cada negocio usa el cupo de su
 * cuenta. Sirve igual en Electron, la web y el celular.
 */
import { getSupabaseClient } from '../supabase/config';
import { prepararPaqueteEntrega } from './paqueteEntrega';
import { obtenerFacturaPorId, obtenerFacturaPorVenta } from '../supabase/facturaElectronicaDianService';
import type { FacturaElectronicaDian } from './types';

export interface EstadoCorreoNegocio {
  configurado: boolean;
  proveedor?: string;
  servidor?: string;
  puerto?: number;
  usuario?: string;
  remitenteNombre?: string | null;
  verificadoEl?: string;
  enviadosHoy?: number;
  maximoDiario?: number;
}

async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { data, error } = await client.functions.invoke('correo-facturas', { body: cuerpo });
  if (error) {
    // supabase-js envuelve los errores HTTP: el mensaje útil viene en el cuerpo.
    let detalle = error.message;
    try {
      const cuerpoError = await (error as any).context?.json?.();
      if (cuerpoError?.error) detalle = cuerpoError.error;
    } catch { /* se queda el mensaje genérico */ }
    throw new Error(detalle);
  }
  return data as T;
}

export const estadoCorreoNegocio = () => invocar<EstadoCorreoNegocio>({ accion: 'estado' });

export const guardarCorreoNegocio = (datos: { proveedor: string; usuario: string; clave: string; remitenteNombre?: string; servidor?: string; puerto?: number }) => {
  correoConectado = null;
  return invocar<{ ok: true }>({ accion: 'guardar', ...datos });
};

export const eliminarCorreoNegocio = () => {
  correoConectado = null;
  return invocar<{ ok: true }>({ accion: 'eliminar' });
};

const aBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Manda la factura aprobada al cliente: el ZIP que pide la DIAN (XML y PDF) y el PDF suelto. */
export async function enviarFacturaPorCorreoNegocio(factura: FacturaElectronicaDian, destino: string): Promise<{ enviadosHoy: number }> {
  const paquete = await prepararPaqueteEntrega(factura);
  const negocio = factura.emisor.nombreComercial || factura.emisor.nombreORazonSocial || '';
  const texto = [
    `Señores ${factura.adquirente.nombreORazonSocial}:`,
    '',
    `Adjuntamos la factura electrónica de venta ${factura.numeroFactura} por $${Math.round(factura.total).toLocaleString('es-CO')}.`,
    'El archivo ZIP contiene la factura con la validación de la DIAN (XML) y su representación gráfica (PDF).',
    factura.cufe ? `\nCUFE: ${factura.cufe}` : '',
    '',
    'Gracias por su compra.',
    negocio,
  ].join('\n');
  return invocar<{ ok: true; enviadosHoy: number }>({
    accion: 'enviar',
    facturaId: factura.id,
    destino,
    // Asunto con el formato de la DIAN: Evento;Número;NIT emisor;Emisor;Número;Código;Línea de negocio.
    asunto: `Factura Electrónica;${factura.numeroFactura};${factura.emisor.nit};${negocio};${factura.numeroFactura};01;`,
    texto,
    adjuntos: [
      { nombre: paquete.nombre, base64: await aBase64(paquete.archivo), tipo: 'application/zip' },
      { nombre: paquete.nombrePdf, base64: await aBase64(paquete.pdf), tipo: 'application/pdf' },
    ],
  });
}

// Una consulta por sesión basta: el botón del cobro solo aparece si hay correo conectado.
let correoConectado: Promise<boolean> | null = null;
export function correoNegocioConectado(): Promise<boolean> {
  if (!correoConectado) {
    correoConectado = estadoCorreoNegocio().then((e) => e.configurado).catch(() => {
      correoConectado = null;
      return false;
    });
  }
  return correoConectado;
}

/** Desde el cobro: busca la factura de la venta y se la manda al cliente. */
export async function enviarFacturaDeVentaPorCorreo(clienteId: string, ventaReferencia: string, destino: string): Promise<void> {
  const factura = await obtenerFacturaPorVenta(clienteId, ventaReferencia);
  if (!factura) throw new Error('No se encontró la factura de esta venta');
  await enviarFacturaPorCorreoNegocio(factura, destino);
}

const enviadasAlAprobar = new Set<string>();

/**
 * Apenas la DIAN aprueba una factura de producción, se le manda sola al
 * correo del comprador (el que dio en el cobro o el de su ficha en
 * Facturación › Clientes) si el negocio conectó su correo. Sirve para el
 * cobro, Facturar de nuevo y las que aprueba después la cola. Si falla,
 * el aviso deja reintentar; también queda el envío a mano en Facturas de venta.
 */
export async function enviarCorreoAlAprobar(facturaId: string): Promise<void> {
  if (enviadasAlAprobar.has(facturaId) || !(await correoNegocioConectado())) return;
  const factura = await obtenerFacturaPorId(facturaId);
  const destino = factura?.adquirente.email?.trim() || '';
  if (!factura || factura.estado !== 'accepted' || factura.emisor.ambiente !== 'produccion' || !destino.includes('@')) return;
  enviadasAlAprobar.add(facturaId);
  const { toast } = await import('sonner');
  const enviar = () => {
    const id = toast.loading(`Enviando la factura ${factura.numeroFactura} a ${destino}...`);
    enviarFacturaPorCorreoNegocio(factura, destino)
      .then(() => toast.success(`Factura ${factura.numeroFactura} enviada a ${destino}`, { id }))
      .catch((e) => toast.error(`No se envió la factura ${factura.numeroFactura} por correo`, {
        id, description: e?.message, duration: 30000, action: { label: 'Reintentar', onClick: enviar },
      }));
  };
  enviar();
}
