/**
 * Clientes de factura electrónica recordados: al escribir el NIT o la cédula
 * de alguien que ya compró con factura, se llenan solos su nombre, correo y
 * dirección.
 *
 * Primero se busca en la base de clientes del negocio (Facturación ›
 * Clientes, tabla clientes_facturacion), luego en este equipo (localStorage)
 * y por último en las facturas electrónicas que ya se le hicieron en la nube.
 * Las tres sirven igual en web, celular y Electron.
 */
import { getSupabaseClient } from '../supabase/config';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from './types';

export interface ClienteFacturaGuardado {
  documento: string;
  nombre: string;
  email?: string;
  direccion?: string;
  /** Solo los que vienen de la base de clientes. */
  tipoDocumento?: string;
  telefono?: string;
  agenteRetencionFuente?: boolean;
  agenteRetencionIca?: boolean;
}

const CLAVE = 'codecpos_clientes_factura';
const MAXIMO = 3000;

/** "900.123.456-7" y "900123456" son el mismo cliente. */
export function normalizarDocumento(doc: string): string {
  return (doc || '').split('-')[0].replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

function leer(): Record<string, ClienteFacturaGuardado & { usadoEl: number }> {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; }
}

export function recordarClienteFactura(cliente: ClienteFacturaGuardado): void {
  const clave = normalizarDocumento(cliente.documento);
  if (!clave || clave === NUMERO_DOCUMENTO_CONSUMIDOR_FINAL || !cliente.nombre.trim()) return;
  const todos = leer();
  const anterior = todos[clave];
  todos[clave] = {
    documento: cliente.documento.trim(),
    nombre: cliente.nombre.trim(),
    // Un campo que esta vez quedó vacío no borra lo que ya se sabía.
    email: cliente.email?.trim() || anterior?.email,
    direccion: cliente.direccion?.trim() || anterior?.direccion,
    usadoEl: Date.now(),
  };
  const claves = Object.keys(todos);
  if (claves.length > MAXIMO) {
    claves.sort((a, b) => todos[a].usadoEl - todos[b].usadoEl)
      .slice(0, claves.length - MAXIMO)
      .forEach((k) => delete todos[k]);
  }
  try { localStorage.setItem(CLAVE, JSON.stringify(todos)); } catch { /* sin espacio: solo no se recuerda */ }
}

/** Aviso para el cajero cuando el cliente es agente de retención. */
export function avisoAgenteRetencion(c: ClienteFacturaGuardado | null | undefined): string {
  const cuales = [c?.agenteRetencionFuente ? 'ReteFuente' : '', c?.agenteRetencionIca ? 'ReteICA' : ''].filter(Boolean);
  return cuales.length ? `Agente de retención: la factura lleva ${cuales.join(' y ')} si aplica.` : '';
}

export async function buscarClienteFactura(clienteId: string | null | undefined, documento: string): Promise<ClienteFacturaGuardado | null> {
  const clave = normalizarDocumento(documento);
  if (clave.length < 5 || clave === NUMERO_DOCUMENTO_CONSUMIDOR_FINAL) return null;

  const client = getSupabaseClient();
  if (client && clienteId) {
    try {
      const { data } = await client
        .from('clientes_facturacion')
        .select('tipo_documento, numero_documento, digito_verificacion, nombre, email, telefono, direccion, agente_retencion_fuente, agente_retencion_ica')
        .eq('cliente_id', clienteId)
        .eq('numero_documento', clave)
        .maybeSingle();
      if (data?.nombre) {
        return {
          documento: data.digito_verificacion ? `${data.numero_documento}-${data.digito_verificacion}` : data.numero_documento,
          nombre: data.nombre,
          email: data.email || undefined,
          direccion: data.direccion || undefined,
          tipoDocumento: data.tipo_documento || undefined,
          telefono: data.telefono || undefined,
          agenteRetencionFuente: data.agente_retencion_fuente === true,
          agenteRetencionIca: data.agente_retencion_ica === true,
        };
      }
    } catch { /* sin red: se sigue con lo del equipo */ }
  }

  const local = leer()[clave];
  if (local) return local;

  if (!client || !clienteId) return null;
  try {
    const { data } = await client
      .from('facturas_electronicas')
      .select('cliente_nit, cliente_nombre, cliente_email')
      .eq('cliente_id', clienteId)
      .in('cliente_nit', Array.from(new Set([documento.trim(), clave])))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.cliente_nombre) return null;
    return { documento: data.cliente_nit || documento, nombre: data.cliente_nombre, email: data.cliente_email || undefined };
  } catch {
    return null;
  }
}
