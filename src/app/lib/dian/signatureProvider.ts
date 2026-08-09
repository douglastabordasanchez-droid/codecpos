/**
 * Firma digital del documento electrónico (XAdES sobre el XML UBL) — la
 * llave privada del certificado NUNCA debe llegar al renderer. La firma
 * real ocurre en el proceso principal de Electron (ver
 * electron/dianSigner.js), este archivo solo define el contrato y el
 * puente IPC hacia allá.
 *
 * ⚠️ PENDIENTE (no implementado a propósito, ver electron/dianSigner.js):
 * la política de firma exacta que exige la DIAN (perfil XAdES — BES/EPES,
 * algoritmo de canonicalización XML, si la firma es enveloped o detached,
 * requisitos de sello de tiempo) no está confirmada. Firmar con un perfil
 * incorrecto produce un documento que la DIAN rechaza. Falta: la sección
 * "política de firma" del Anexo Técnico v1.9 o un ejemplo de XML firmado
 * ya aceptado por la DIAN en ambiente de habilitación.
 */

export interface ElectronicSignatureProvider {
  /** Firma el documento (XML ya serializado a bytes) y devuelve el
   * documento firmado. Implementación real: proceso principal + certificado
   * descifrado en memoria únicamente durante la operación de firma. */
  signDocument(document: Uint8Array): Promise<Uint8Array>;
}

/** Implementación puente: delega la firma real al proceso principal vía IPC.
 * El renderer nunca ve la llave privada — solo envía el XML a firmar y
 * recibe el XML firmado de vuelta. */
export class ElectronMainProcessSignatureProvider implements ElectronicSignatureProvider {
  constructor(private readonly perfilFiscalId: string) {}

  async signDocument(document: Uint8Array): Promise<Uint8Array> {
    const electronApi = (window as any).electron;
    if (!electronApi?.dian?.firmarDocumento) {
      throw new Error(
        'La firma digital todavía no está implementada (falta la política de firma XAdES exacta de la DIAN — ver comentario en signatureProvider.ts). ' +
        'No se puede facturar en DIAN directo hasta completar esto.'
      );
    }
    const base64 = btoa(String.fromCharCode(...document));
    const resultado = await electronApi.dian.firmarDocumento(this.perfilFiscalId, base64);
    if (!resultado?.success) {
      throw new Error(resultado?.error || 'No se pudo firmar el documento');
    }
    const bin = atob(resultado.base64Firmado);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
}
