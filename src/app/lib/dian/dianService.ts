/**
 * Transmisión a los servicios web oficiales de la DIAN — implementación
 * real vía IPC hacia el proceso principal de Electron (electron/dianSoapClient.js),
 * el único lugar donde la llave privada y el PIN existen descifrados.
 *
 * Endpoints y contrato SOAP confirmados descargando el WSDL real
 * directamente de la DIAN (vendorizado en electron/dian-wsdl/ y en
 * docs/electronic-invoicing/dian-sources/):
 *   - Habilitación: https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
 *   - Producción: https://vpfe.dian.gov.co/WcfDianCustomerServices.svc
 *
 * La firma WS-Security del sobre SOAP (X.509 por thumbprint, RSA-SHA256) ya
 * está implementada y autoverificada contra un servidor SOAP local que
 * sirve el mismo WSDL real — ver electron/dianSoapClient.test.js.
 *
 * ⚠️ NO PROBADO CONTRA LA DIAN REAL: la autoverificación confirma que el
 * cliente arma un sobre SOAP correctamente firmado según el contrato real;
 * la aceptación efectiva por el ambiente de habilitación de la DIAN
 * requiere las credenciales reales del negocio y no se puede probar desde
 * aquí. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 */

import type { FacturaElectronicaDian, NotaAjusteDian, DianResponse, AmbienteDian } from './types';

export const DIAN_ENDPOINTS: Record<AmbienteDian, string> = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

export interface DianService {
  sendInvoice(invoice: FacturaElectronicaDian): Promise<DianResponse>;
  sendCreditNote(note: NotaAjusteDian): Promise<DianResponse>;
  sendDebitNote(note: NotaAjusteDian): Promise<DianResponse>;
  checkStatus(trackId: string): Promise<DianResponse>;
}

function mapearRespuestaDian(cruda: any): DianResponse {
  const isValid = Boolean(cruda?.IsValid);
  const mensajes: string[] = Array.isArray(cruda?.ErrorMessage?.string)
    ? cruda.ErrorMessage.string
    : Array.isArray(cruda?.ErrorMessage)
      ? cruda.ErrorMessage
      : cruda?.ErrorMessage
        ? [String(cruda.ErrorMessage)]
        : [];
  return {
    ok: isValid,
    estado: isValid ? 'accepted' : mensajes.length > 0 ? 'rejected' : 'error',
    mensajes: [cruda?.StatusDescription, cruda?.StatusMessage, ...mensajes].filter(Boolean),
    cune: cruda?.XmlDocumentKey,
    crudo: cruda,
  };
}

/** Implementación real — delega la firma WS-Security y la llamada SOAP al
 * proceso principal vía IPC (electron/dianSoapClient.js), que es el único
 * lugar donde el certificado y el PIN existen descifrados. */
export class DianSoapService implements DianService {
  constructor(private readonly perfilFiscalId: string, private readonly ambiente: AmbienteDian) {}

  private get electronApi() {
    const api = (window as any).electron?.dian;
    if (!api?.enviarFacturaSync) {
      throw new Error('La transmisión a la DIAN solo está disponible en la aplicación de escritorio.');
    }
    return api;
  }

  async sendInvoice(invoice: FacturaElectronicaDian): Promise<DianResponse> {
    if (!invoice.xml) throw new Error('La factura no tiene XML firmado — no se puede transmitir.');
    const resultado = await this.electronApi.enviarFacturaSync(this.perfilFiscalId, invoice.numeroFactura + '.xml', invoice.xml, this.ambiente);
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo transmitir la factura a la DIAN');
    return mapearRespuestaDian(resultado.respuesta);
  }

  async sendCreditNote(note: NotaAjusteDian): Promise<DianResponse> {
    return this.enviarNota(note);
  }

  async sendDebitNote(note: NotaAjusteDian): Promise<DianResponse> {
    return this.enviarNota(note);
  }

  private async enviarNota(note: NotaAjusteDian): Promise<DianResponse> {
    if (!note.xml) throw new Error('La nota no tiene XML firmado — no se puede transmitir.');
    const resultado = await this.electronApi.enviarFacturaSync(this.perfilFiscalId, note.numeroNota + '.xml', note.xml, this.ambiente);
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo transmitir la nota a la DIAN');
    return mapearRespuestaDian(resultado.respuesta);
  }

  async checkStatus(trackId: string): Promise<DianResponse> {
    const resultado = await this.electronApi.consultarEstado(this.perfilFiscalId, trackId, this.ambiente);
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo consultar el estado en la DIAN');
    return mapearRespuestaDian(resultado.respuesta);
  }
}
