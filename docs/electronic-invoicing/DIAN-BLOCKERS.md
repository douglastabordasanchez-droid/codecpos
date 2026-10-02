# Estado de la integración real con la DIAN

> ## Revisión del 2026-10-02 — léase antes que el resto
>
> Una revisión contra las reglas de rechazo del Anexo Técnico v1.9 y una
> verificación **independiente** de la firma encontraron defectos que este
> documento daba por resueltos. Lo que sigue más abajo describe el diseño,
> pero donde diga «verificado» o «pendiente real: ninguno», prevalece esto:
>
> | Defecto que la DIAN habría rechazado | Regla | Corrección |
> |---|---|---|
> | Fragmentos de la firma (KeyInfo, SignedProperties, SignedInfo) canonizados sin los namespaces heredados de la raíz. El firmador se «autoverificaba» con el mismo error; xml-crypto rechazaba la firma. | ZE02 | `nsHeredados()` en `electron/dianXadesSigner.js` y `supabase/functions/dian-emision/xades.ts`; ambos tienen ahora una prueba con verificador independiente. |
> | El XML se enviaba sin comprimir; la DIAN recibe un ZIP. | §7.8 | `empaquetarZip()` en los dos clientes SOAP. |
> | Sobre SOAP sin WS-Addressing (`wsa:Action`, `wsa:To`). | WSDL (wsHttpBinding) | Cliente SOAP reescrito; firma `wsa:To`. La librería `soap` ya no se usa. |
> | Fecha del CUFE: se usaba el instante ISO completo como `FecFac`, y la hora local del equipo, mientras el XML llevaba la hora UTC rotulada `-05:00`. | FAD06 | `fechaColombia()`/`horaColombia()` únicos para XML y CUFE. |
> | Impuestos del encabezado sin desglose; sin `PaymentMeans`; emisor sin tipo de persona, dirección, responsabilidades ni prefijo; adquirente sin identificación; perfil/operación/ambiente ausentes; líneas sin unidad. | FAS, FAN, FAJ, FAK, FAD, FAV | `xmlBuilder.ts`, `notaAjusteXmlBuilder.ts`, `ublComun.ts`. |
> | Totales tomados del carrito (con propina) en vez de las líneas. | FAU | `documentoFiscal.ts`: todo se deriva de las líneas. |
> | Documento Equivalente POS emitido con encabezado de factura y sin `FabricanteSoftware`. | Anexo DE v1.0 | `xmlBuilder.ts`. |
> | Notas: `cbc:DiscrepancyResponse` (debe ser `cac:`), sin líneas (la factura leída de la base no trae ítems), con `InvoiceControl`. | — | `notaAjusteXmlBuilder.ts`, `itemsDeFactura()`. |
> | Certificado: se tomaba el primero del .p12, que puede ser la CA. | — | Se elige el que casa con la llave privada. |
> | Un perfil solo quedaba activo al pasar a producción, así que no se podían emitir los documentos del set de pruebas. | — | Queda activo al marcarlo «en pruebas». |
>
> **Sigue sin probarse contra la DIAN real.** Todo lo anterior se verificó
> contra el anexo y con pruebas automáticas; la aceptación solo la da la DIAN.
> Para comprobarla existe ahora **Facturación → Prueba de habilitación con la
> DIAN** (envía por `SendTestSetAsync` y muestra el veredicto regla por regla).
> Hasta que esa prueba pase con el certificado de un negocio real, no se debe
> afirmar que la DIAN acepta estos documentos.
>
> **Firma desde la web:** el certificado puede custodiarse cifrado en el
> servidor (tabla `dian_certificados_nube`, Edge Function `dian-emision`,
> secreto `DIAN_CERT_KEY`). Si ese secreto se pierde o se rota, los
> certificados guardados dejan de poder descifrarse y hay que volver a subirlos.

**Los cuatro bloqueos originales (firma XAdES, transmisión SOAP, CUDE de notas, CUDE +
XML del Documento Equivalente POS) están implementados con lógica real, contra fuentes
oficiales descargadas y verificadas de dian.gov.co** (vendorizadas en
`docs/electronic-invoicing/dian-sources/` y `electron/dian-wsdl/`). Ninguno es una
simulación: no hay CUFE/CUDE falsos, XML "parecidos", firmas simuladas, endpoints
ficticios ni estados `ACCEPTED` inventados en ningún punto del sistema.

**Lo que SÍ se pudo verificar desde este entorno:**
- Las fórmulas de CUFE/CUDE reproducen EXACTO los ejemplos oficiales del Anexo Técnico
  (hash idéntico byte a byte contra el ejemplo publicado por la DIAN).
- La estructura XAdES-EPES (firma de factura/nota) coincide campo a campo con un
  documento real, firmado y públicamente verificable (Colombia Compra Eficiente) — mismo
  hash de política de firma, misma estructura de referencias.
- El firmador XAdES se autoverifica criptográficamente (firma con un certificado de
  prueba, luego valida la propia firma con la llave pública) y detecta manipulación del
  documento o de la firma — 7 tests automatizados (`electron/dianXadesSigner.test.js`).
- El cliente SOAP se probó de punta a punta contra un servidor local que sirve el WSDL
  REAL descargado de la DIAN: arma la llamada correcta, firma el sobre con WS-Security
  (Timestamp + referencia por thumbprint + RSA-SHA256), y esa firma se verifica
  criptográficamente con la librería `xml-crypto` de forma independiente — 2 tests
  automatizados (`electron/dianSoapClient.test.js`).

**Lo que NO se puede verificar desde este entorno:** que la DIAN real (ambiente de
habilitación) acepte estos documentos. Eso requiere el certificado digital real del
negocio, su inscripción como facturador electrónico, y ejecutar el set de pruebas
oficial (`SendTestSetAsync` con el `testSetId` que asigna la DIAN) — algo que solo el
negocio puede hacer, con sus propias credenciales. Esta es la única limitación
estructural que queda: no es falta de documentación ni de implementación, es que la
aceptación final la determina un sistema externo al que este entorno no tiene acceso.

---

## 1. Firma digital XAdES — IMPLEMENTADO Y AUTOVERIFICADO

**Archivos:** `electron/dianXadesSigner.js` (lógica), `electron/dianSigner.js`
(integración con `dianSecrets.js`), `electron/dianXadesSigner.test.js` (7 tests).

**Confirmado contra fuentes oficiales:** XMLDSig enveloped + XAdES-EPES, C14N estándar
(no exclusive), `rsa-sha256`/`sha256`, 3 referencias (documento, KeyInfo,
SignedProperties), hash de política de firma verificado exacto
(`dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=`) contra un documento real firmado.

**Implementado:** parseo de `.p12` (node-forge), construcción manual del `ds:Signature`
completo (canonicalización vía `xml-crypto`, firma RSA-SHA256 vía Node `crypto`),
inserción en el XML como `ext:UBLExtension` adicional, autoverificación (firma +
3 digests recalculados) antes de devolver el documento.

**Dependencias agregadas:** `node-forge`, `xml-crypto`, `@xmldom/xmldom`.

**Pendiente real:** ninguno de implementación. Solo falta la prueba contra DIAN real
(ver arriba).

---

## 2. Transmisión SOAP — IMPLEMENTADO Y AUTOVERIFICADO

**Archivos:** `electron/dianSoapClient.js` (cliente SOAP + WS-Security),
`electron/dian-wsdl/WcfDianCustomerServices.wsdl` (WSDL real vendorizado),
`electron/dianSoapClient.test.js` (2 tests contra un servidor SOAP local),
`src/app/lib/dian/dianService.ts` (interfaz consumida por el resto del sistema, ahora
real vía IPC en vez de lanzar error).

**Confirmado contra el WSDL real** (descargado de `vpfe-hab.dian.gov.co` y
`vpfe.dian.gov.co`): operaciones `SendBillSync`, `SendTestSetAsync`, `GetStatus`,
`GetNumberingRange` con su contrato exacto; política de seguridad WS-Security con X.509
por **thumbprint** (no BST directo — se reemplazó el comportamiento por defecto de la
librería `soap` para cumplir `sp:RequireThumbprintReference`), `Basic256Sha256Rsa15`
(RSA-SHA256 + SHA-256).

**Implementado:** `enviarFacturaSync`, `enviarSetPruebas`, `consultarEstado`,
`consultarRangoNumeracion` (esta última obtiene la Clave Técnica real de cada rango).
IPC completo (`dian:enviar-factura-sync`, `dian:enviar-set-pruebas`,
`dian:consultar-estado`, `dian:consultar-rango-numeracion`) expuesto en ambos
`preload.cjs`/`preload.js`. `emitirFacturaDian.ts` y `emitirNotaAjuste.ts` ahora firman
Y transmiten (antes se detenían en "signing").

**Dependencia agregada:** `soap`.

**Pendiente real:** ninguno de implementación. Solo falta la prueba contra DIAN real.

---

## 3. CUDE de notas de ajuste — IMPLEMENTADO Y VERIFICADO

Fórmula exacta del Anexo Técnico v1.9 §11.4 (usa **Software-PIN**, no Clave Técnica —
un credencial que no estaba modelado y se agregó como `FiscalProfile.softwarePin`,
migración `0023`). Verificado exacto contra el ejemplo oficial de nota crédito del
propio anexo. `calcularCudeNota.ts`, con tests que reproducen el vector de prueba oficial.

## 4. CUDE y XML del Documento Equivalente POS — IMPLEMENTADO Y VERIFICADO

Misma fórmula que notas (Software-PIN). Reutiliza el mismo root UBL `Invoice` que la
factura (`schemeName="CUDE-SHA384"`) — no es un esquema `AttachedDocument` propio como se
documentó por precaución antes de conseguir el anexo oficial. `calcularCudeDocumentoEquivalente.ts`.

## Bloque `sts:DianExtensions` (SoftwareSecurityCode + QR) — IMPLEMENTADO Y VERIFICADO

Confirmado campo a campo contra el mismo documento real usado para verificar la firma.
`dianExtensionsBlock.ts` (compartido entre factura, documento equivalente y notas),
`softwareSecurityCode.ts`. El NIT de la DIAN como `AuthorizationProvider` (800197268) es
un valor fijo, verificado independientemente.

---

## Qué falta para producción (no son bloqueos de documentación/implementación)

1. **Certificado digital real del negocio** — cargarlo en el asistente
   (Configuración → Facturación electrónica).
2. **Inscripción como facturador electrónico** ante la DIAN y activación del software en
   su catálogo de participantes (de ahí salen `identificadorSoftware` y `softwarePin`).
3. **Ejecutar el set de pruebas de habilitación** (`SendTestSetAsync`, ya implementado)
   con el `testSetId` que asigna la DIAN, y confirmar que los documentos son aceptados.
4. Solo después de (3): activar `ambiente = 'produccion'` en el perfil fiscal.

Nada de esto lo puede hacer este entorno de desarrollo — son pasos que le corresponden
al negocio, con sus propias credenciales, tal como ya lo prevé el asistente de
configuración (`AsistenteConfiguracionDian.tsx`, paso "Pruebas").

## Punto de integración (ya conectado de punta a punta)

```text
Codec POS (carrito / venta)
   ↓
emitirFacturaDian.ts / emitirNotaAjuste.ts
   ↓
xmlBuilder.ts / notaAjusteXmlBuilder.ts  (con sts:DianExtensions + QR + SoftwareSecurityCode)
   ↓
signatureProvider.ts → electron/dianSigner.js → dianXadesSigner.js   (firma real, autoverificada)
   ↓
dianService.ts → IPC → electron/dianSoapClient.js   (SOAP + WS-Security real, autoverificado)
   ↓
DianResponse (mapeado del contrato real del WSDL)
   ↓
facturas_electronicas / notas_*_electronicas (estado 'accepted' | 'rejected' | 'contingency')
   ↓
deliveryProvider.ts (ManualDeliveryProvider) → WhatsApp / Email
```
