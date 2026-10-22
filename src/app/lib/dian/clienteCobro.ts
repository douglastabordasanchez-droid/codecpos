/**
 * Datos del comprador que el cajero llena en el cobro con factura
 * electrónica, iguales en Electron, la web y el celular, y su paso a
 * AdquirenteDian (lo que va en la factura) y a la base de clientes.
 */
import { digitoVerificacionNit } from './ublComun';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, type AdquirenteDian } from './types';
import type { ClienteFacturaGuardado } from './clientesFactura';

export interface DatosClienteCobro {
  /** 13 cédula, 31 NIT (empresa). */
  tipo: string;
  documento: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
}

export const CLIENTE_COBRO_VACIO: DatosClienteCobro = { tipo: '13', documento: '', nombre: '', email: '', telefono: '', direccion: '' };

/** Solo los dígitos del documento, sin puntos ni dígito de verificación. */
export function numeroDocumento(documento: string): string {
  return (documento || '').split('-')[0].replace(/\D/g, '');
}

/** DV del NIT, calculado (nunca lo escribe el cajero). */
export function dvDe(datos: Pick<DatosClienteCobro, 'tipo' | 'documento'>): string | undefined {
  const numero = numeroDocumento(datos.documento);
  return datos.tipo === '31' && numero.length >= 6 ? digitoVerificacionNit(numero) : undefined;
}

/**
 * El error de la DBM1507: el NIT escrito con el DV pegado (8300515738 en
 * vez de 830051573-8). Si los primeros dígitos dan exactamente el último
 * como DV, casi seguro es eso: se propone el NIT sin el último dígito.
 */
export function nitConDvPegado(datos: Pick<DatosClienteCobro, 'tipo' | 'documento'>): string | null {
  if (datos.documento.includes('-')) return null;
  const numero = numeroDocumento(datos.documento);
  if (numero.length !== 10 || !/^[89]/.test(numero)) return null;
  const base = numero.slice(0, 9);
  return digitoVerificacionNit(base) === numero.slice(9) ? base : null;
}

/** Lo que va en la factura. Sin documento: consumidor final. */
export function adquirenteDesdeCobro(datos: DatosClienteCobro): AdquirenteDian {
  const numero = numeroDocumento(datos.documento);
  if (!numero) return { tipoDocumento: '13', numeroDocumento: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, nombreORazonSocial: 'Consumidor final' };
  return {
    tipoDocumento: datos.tipo || '13',
    numeroDocumento: numero,
    digitoVerificacion: dvDe(datos),
    nombreORazonSocial: datos.nombre.trim() || 'Consumidor final',
    email: datos.email.trim() || undefined,
    telefono: datos.telefono.trim() || undefined,
    direccion: datos.direccion.trim() || undefined,
  };
}

/** Para Facturación › Clientes y el recuerdo del equipo: el NIT va con su DV. */
export function clienteParaGuardar(datos: DatosClienteCobro) {
  const numero = numeroDocumento(datos.documento);
  const dv = dvDe(datos);
  return {
    documento: dv ? `${numero}-${dv}` : numero,
    tipoDocumento: datos.tipo || '13',
    nombre: datos.nombre.trim(),
    email: datos.email.trim(),
    telefono: datos.telefono.trim(),
    direccion: datos.direccion.trim(),
  };
}

/** Llena con un cliente conocido; lo que el cajero ya escribió se respeta solo si se pide. */
export function conClienteConocido(datos: DatosClienteCobro, c: ClienteFacturaGuardado, reemplazar: boolean): DatosClienteCobro {
  const elegir = (actual: string, nuevo?: string) => (reemplazar ? nuevo || '' : actual.trim() || nuevo || '');
  const tipo = c.tipoDocumento || (c.documento.includes('-') ? '31' : datos.tipo);
  return {
    tipo: reemplazar ? tipo : datos.tipo === '13' && tipo === '31' ? '31' : datos.tipo,
    documento: reemplazar ? numeroDocumento(c.documento) : datos.documento,
    nombre: elegir(datos.nombre, c.nombre),
    email: elegir(datos.email, c.email),
    telefono: elegir(datos.telefono, c.telefono),
    direccion: elegir(datos.direccion, c.direccion),
  };
}
