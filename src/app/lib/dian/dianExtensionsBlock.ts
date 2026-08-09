/**
 * Bloque `ext:UBLExtensions/sts:DianExtensions` — compartido por factura,
 * documento equivalente y notas de ajuste (todas usan el mismo root UBL y
 * la misma extensión DIAN). Confirmado campo a campo contra un documento
 * real, firmado y públicamente verificable (ver
 * docs/electronic-invoicing/dian-sources/), no solo contra la tabla de
 * datos del anexo. Ver xmlBuilder.ts para el detalle de cada campo.
 */
import type { EmisorSnapshot } from './types';

export interface DianExtensionData {
  invoiceAuthorization: string;
  authorizationStartDate?: string;
  authorizationEndDate?: string;
  prefix: string;
  rangoDesde: number;
  rangoHasta: number;
  softwareSecurityCode: string;
  softwareId: string;
  qrUrl: string;
}

function escapeXml(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function construirBloqueDianExtensions(emisor: EmisorSnapshot, extension: DianExtensionData): string {
  return `  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${escapeXml(extension.invoiceAuthorization)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${escapeXml(extension.authorizationStartDate || '')}</cbc:StartDate>
              <cbc:EndDate>${escapeXml(extension.authorizationEndDate || '')}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${escapeXml(extension.prefix)}</sts:Prefix>
              <sts:From>${extension.rangoDesde}</sts:From>
              <sts:To>${extension.rangoHasta}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)" schemeID="${escapeXml(emisor.digitoVerificacion)}" schemeName="31">${escapeXml(emisor.nit)}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)">${escapeXml(extension.softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)">${escapeXml(extension.softwareSecurityCode)}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)" schemeID="4" schemeName="31">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${escapeXml(extension.qrUrl)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <!-- La firma XAdES (ds:Signature) se agrega como un ext:UBLExtension
         adicional aquí, sobre este XML ya construido — ver
         electron/dianSigner.js / signatureProvider.ts. -->
  </ext:UBLExtensions>`;
}

export const NAMESPACES_DIAN =
  `xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"\n` +
  `         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"\n` +
  `         xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"\n` +
  `         xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"`;
