/**
 * Verifica si el perfil fiscal ACTIVO cumple todo lo obligatorio para
 * habilitar facturación electrónica en producción. No decide nada por sí
 * mismo — solo reporta qué falta, para que la UI (asistente/Configuración)
 * bloquee el botón "Activar producción" hasta que `ready` sea true.
 *
 * No valida contra la DIAN en sí (eso lo hace el ambiente de habilitación al
 * enviar documentos de prueba) — valida que la CONFIGURACIÓN LOCAL esté
 * completa para poder intentarlo.
 */
import type { FiscalProfile, ResolucionDian, CertificadoDianMeta } from './types';
import type { ResultadoValidacionFiscal } from './types';

export interface InsumosValidacionFiscal {
  perfil: FiscalProfile | null;
  resolucionActiva: ResolucionDian | null;
  certificado: CertificadoDianMeta | null;
  pinConfigurado: boolean;
}

const HOY = () => new Date().toISOString().slice(0, 10);

export function validateFiscalConfiguration(insumos: InsumosValidacionFiscal): ResultadoValidacionFiscal {
  const missing: string[] = [];
  const { perfil, resolucionActiva, certificado, pinConfigurado } = insumos;

  if (!perfil) {
    return { ready: false, missing: ['FISCAL_PROFILE'] };
  }

  if (!perfil.nombreORazonSocial?.trim()) missing.push('NOMBRE_O_RAZON_SOCIAL');
  if (!perfil.nit?.trim()) missing.push('NIT');
  if (perfil.tipoPersona === 'juridica' && !perfil.digitoVerificacion?.trim()) missing.push('DIGITO_VERIFICACION');
  if (!perfil.direccionFiscal?.trim()) missing.push('DIRECCION_FISCAL');
  if (!perfil.municipioCodigo?.trim()) missing.push('MUNICIPIO');
  if (!perfil.departamentoCodigo?.trim()) missing.push('DEPARTAMENTO');
  if (!perfil.responsabilidadesFiscales || perfil.responsabilidadesFiscales.length === 0) missing.push('RESPONSABILIDADES_FISCALES');
  if (!perfil.identificadorSoftware?.trim()) missing.push('IDENTIFICADOR_SOFTWARE');
  if (!perfil.claveTecnica?.trim()) missing.push('CLAVE_TECNICA');
  if (!perfil.softwarePin?.trim()) missing.push('SOFTWARE_PIN');

  if (!resolucionActiva) {
    missing.push('NUMERACION');
  } else {
    if (resolucionActiva.estado !== 'activa') missing.push('NUMERACION_VENCIDA_O_AGOTADA');
    if (resolucionActiva.vigenciaHasta && resolucionActiva.vigenciaHasta < HOY()) missing.push('NUMERACION_VENCIDA_O_AGOTADA');
    if (resolucionActiva.consecutivoActual >= (resolucionActiva.rangoHasta - resolucionActiva.rangoDesde + 1)) missing.push('NUMERACION_VENCIDA_O_AGOTADA');
  }

  if (!certificado) {
    missing.push('CERTIFICATE');
  } else {
    if (certificado.estado !== 'activo') missing.push('CERTIFICATE_VENCIDO_O_REVOCADO');
    if (certificado.fechaVencimiento && certificado.fechaVencimiento < HOY()) missing.push('CERTIFICATE_VENCIDO_O_REVOCADO');
  }

  if (!pinConfigurado) missing.push('PIN_FIRMA');

  return { ready: missing.length === 0, missing };
}

/** Etiquetas legibles para mostrar al admin exactamente qué le falta. */
export const ETIQUETAS_FALTANTES: Record<string, string> = {
  FISCAL_PROFILE: 'No hay un perfil fiscal creado todavía',
  NOMBRE_O_RAZON_SOCIAL: 'Nombre o razón social',
  NIT: 'NIT',
  DIGITO_VERIFICACION: 'Dígito de verificación',
  DIRECCION_FISCAL: 'Dirección fiscal',
  MUNICIPIO: 'Municipio',
  DEPARTAMENTO: 'Departamento',
  RESPONSABILIDADES_FISCALES: 'Responsabilidades fiscales',
  IDENTIFICADOR_SOFTWARE: 'Identificador de software (asignado por la DIAN)',
  CLAVE_TECNICA: 'Clave técnica (ClTec, asignada por la DIAN en la habilitación)',
  SOFTWARE_PIN: 'PIN del software (asignado al activar el software en el catálogo DIAN)',
  NUMERACION: 'Resolución de numeración DIAN',
  NUMERACION_VENCIDA_O_AGOTADA: 'La numeración está vencida o agotada — solicitar una nueva resolución',
  CERTIFICATE: 'Certificado digital',
  CERTIFICATE_VENCIDO_O_REVOCADO: 'El certificado digital está vencido o revocado — cargar uno nuevo',
  PIN_FIRMA: 'PIN de firma del certificado',
  DIAN_CONFIGURATION: 'Configuración DIAN (ambiente / identificador de software)',
};
