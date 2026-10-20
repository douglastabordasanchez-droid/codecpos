/**
 * Clientes de factura electrónica recordados: al escribir el NIT o la cédula
 * de alguien que ya compró con factura, se llenan solos su nombre, correo y
 * dirección.
 *
 * Primero se busca en este equipo (localStorage, guarda también la
 * dirección) y, si no está, en las facturas electrónicas que ya se le
 * hicieron en la nube, que sirven igual en web, celular y Electron. No hay
 * tabla aparte: la factura ya es el registro del cliente.
 */
import { getSupabaseClient } from '../supabase/config';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from './types';

export interface ClienteFacturaGuardado {
  documento: string;
  nombre: string;
  email?: string;
  direccion?: string;
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

export async function buscarClienteFactura(clienteId: string | null | undefined, documento: string): Promise<ClienteFacturaGuardado | null> {
  const clave = normalizarDocumento(documento);
  if (clave.length < 5 || clave === NUMERO_DOCUMENTO_CONSUMIDOR_FINAL) return null;

  const local = leer()[clave];
  if (local) return local;

  const client = getSupabaseClient();
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
