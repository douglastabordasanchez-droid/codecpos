/**
 * Parser de documentos electrónicos DIAN (UBL 2.1).
 *
 * Convierte el XML crudo en el modelo de types.ts. TypeScript puro, sin
 * dependencias de entorno, para que el mismo archivo corra en un Web Worker
 * del navegador y en una Edge Function de Deno — la decisión que permite
 * mover el procesamiento de un lado al otro sin reescribir nada.
 *
 * ── Lo aprendido de documentos reales ───────────────────────────────────
 * Verificado contra 8 documentos de emisores distintos:
 *
 * 1. Lo que entrega la DIAN es un AttachedDocument con DOS bloques CDATA:
 *    la factura y un ApplicationResponse con el acuse de validación. No uno.
 *    Quien asuma un solo CDATA se pierde la mitad de la información.
 *
 * 2. Cada tipo nombra distinto lo mismo: la cantidad es InvoicedQuantity en
 *    factura, CreditedQuantity en nota crédito y DebitedQuantity en nota
 *    débito. Igual el contenedor de líneas. Por eso el parser se organiza
 *    por tipo y no por un camino único.
 *
 * 3. Los impuestos se distinguen por el código del esquema tributario, no
 *    por el nombre, y las retenciones viven en un nodo aparte
 *    (WithholdingTaxTotal) del de los impuestos (TaxTotal).
 *
 * 4. Aparecen códigos que no son un impuesto concreto: ZZ (No aplica) y
 *    ZA (IVA e INC). Entran igual, sin caso especial.
 */

import {
  parseXml, XmlError, hijo, hijos, ruta, texto, atributo, buscar, buscarTodos,
  type XmlNode,
} from './xml';
import {
  IMPUESTOS_DIAN, ES_RETENCION,
  type DocumentoNormalizado, type Direccion, type Excepcion, type Impuesto,
  type LineaDocumento, type ResultadoParseo, type ResumenImpuestos,
  type Tercero, type TipoDocumento, type TotalesDocumento,
} from './types';

export const VERSION_MOTOR = '1.0.0';

/** Tolerancia al comparar totales. Los emisores redondean distinto y el
 *  propio anexo técnico admite diferencias de centavos; marcar un descuadre
 *  de $0,50 como excepción llenaría la bandeja de ruido y el contador
 *  dejaría de mirarla, que es el único fallo que no se puede permitir. */
const TOLERANCIA = 1;

/** Identificaciones que la DIAN reserva para el comprador que no se
 *  identifica (Res. 000042 de 2020). Se listan las dos longitudes porque los
 *  emisores escriben una u otra. */
const CONSUMIDOR_FINAL = new Set(['222222222222', '22222222222']);

// ── Utilidades ────────────────────────────────────────────────────────────

/** Convierte a número siendo tolerante con el formato. Devuelve 0 y no NaN:
 *  un campo ausente vale cero, y así la aritmética de arriba nunca propaga
 *  NaN silenciosamente por todo el documento. */
function num(v: string | undefined): number {
  if (!v) return 0;
  const limpio = v.trim().replace(/\s/g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

/** Nombres de elemento que cambian según el tipo de documento. */
interface DialectoTipo {
  contenedorLinea: string;
  cantidad: string;
}

const DIALECTOS: Record<string, DialectoTipo> = {
  Invoice: { contenedorLinea: 'InvoiceLine', cantidad: 'InvoicedQuantity' },
  CreditNote: { contenedorLinea: 'CreditNoteLine', cantidad: 'CreditedQuantity' },
  DebitNote: { contenedorLinea: 'DebitNoteLine', cantidad: 'DebitedQuantity' },
};

function tipoDesdeRaiz(raiz: string, codigo: string): TipoDocumento {
  if (raiz === 'CreditNote') return 'nota_credito';
  if (raiz === 'DebitNote') return 'nota_debito';
  if (raiz === 'ApplicationResponse') return 'evento';
  if (raiz === 'NominaIndividual' || raiz === 'NominaIndividualDeAjuste') return 'nomina';
  if (raiz === 'Invoice') {
    // El código de tipo distingue factura de documento equivalente y de
    // documento soporte, que comparten la raíz Invoice.
    if (codigo === '05') return 'documento_soporte';
    if (['04', '91', '92', '96'].includes(codigo)) return 'documento_equivalente';
    return 'factura';
  }
  return 'desconocido';
}

// ── Terceros ──────────────────────────────────────────────────────────────

function leerTercero(parte: XmlNode | undefined): Tercero {
  const party = hijo(parte, 'Party');
  const taxScheme = hijo(party, 'PartyTaxScheme');
  const legal = hijo(party, 'PartyLegalEntity');
  const contacto = hijo(party, 'Contact');

  // La dirección puede colgar de PhysicalLocation o de RegistrationAddress
  // según el emisor; se toma la primera que exista.
  const dir = ruta(party, 'PhysicalLocation', 'Address') ?? ruta(taxScheme, 'RegistrationAddress');

  const companyId = hijo(taxScheme, 'CompanyID') ?? hijo(legal, 'CompanyID');
  const identificacion = ruta(party, 'PartyIdentification', 'ID');

  const nit = texto(companyId) || texto(identificacion);

  return {
    nit,
    dv: atributo(companyId, 'schemeID') || atributo(identificacion, 'schemeID'),
    razonSocial: texto(taxScheme, 'RegistrationName') || texto(legal, 'RegistrationName'),
    nombreComercial: texto(ruta(party, 'PartyName', 'Name')),
    tipoIdentificacion: atributo(companyId, 'schemeName') || atributo(identificacion, 'schemeName'),
    regimen: texto(taxScheme, 'TaxLevelCode'),
    ciudad: texto(dir, 'CityName'),
    departamento: texto(dir, 'CountrySubentity'),
    direccion: texto(ruta(dir, 'AddressLine', 'Line')),
    pais: texto(ruta(dir, 'Country', 'IdentificationCode')),
    email: texto(contacto, 'ElectronicMail'),
    telefono: texto(contacto, 'Telephone'),
  };
}

// ── Impuestos ─────────────────────────────────────────────────────────────

/** Lee un bloque TaxTotal (o WithholdingTaxTotal) y devuelve sus subtotales
 *  ya normalizados. `forzarRetencion` cubre el caso de WithholdingTaxTotal,
 *  donde el código puede repetirse con el de un impuesto normal. */
function leerImpuestos(
  contenedor: XmlNode | undefined,
  alcance: 'documento' | 'linea',
  linea: number | null,
  forzarRetencion: boolean,
): Impuesto[] {
  const salida: Impuesto[] = [];
  for (const sub of hijos(contenedor, 'TaxSubtotal')) {
    const categoria = hijo(sub, 'TaxCategory');
    const esquema = hijo(categoria, 'TaxScheme');
    const codigo = texto(esquema, 'ID');
    const unidades = hijo(sub, 'BaseUnitMeasure');

    salida.push({
      alcance,
      linea,
      codigo,
      nombre: texto(esquema, 'Name') || IMPUESTOS_DIAN[codigo] || codigo,
      baseGravable: num(texto(sub, 'TaxableAmount')),
      // Lo normal es TaxCategory/Percent; algunos emisores (incluido el XML
      // que genera este mismo POS) lo ponen directo en TaxSubtotal, que UBL
      // también admite.
      tarifa: num(texto(categoria, 'Percent')) || num(texto(sub, 'Percent')),
      valor: num(texto(sub, 'TaxAmount')),
      esRetencion: forzarRetencion || ES_RETENCION.has(codigo),
      unidades: unidades ? num(texto(unidades)) : null,
    });
  }
  return salida;
}

function impuestosDe(nodo: XmlNode | undefined, alcance: 'documento' | 'linea', linea: number | null): Impuesto[] {
  const salida: Impuesto[] = [];
  for (const tt of hijos(nodo, 'TaxTotal')) salida.push(...leerImpuestos(tt, alcance, linea, false));
  for (const wt of hijos(nodo, 'WithholdingTaxTotal')) salida.push(...leerImpuestos(wt, alcance, linea, true));
  return salida;
}

// ── Líneas ────────────────────────────────────────────────────────────────

function leerLineas(raiz: XmlNode, dialecto: DialectoTipo): LineaDocumento[] {
  return hijos(raiz, dialecto.contenedorLinea).map((ln, idx) => {
    const item = hijo(ln, 'Item');
    const precio = hijo(ln, 'Price');
    const cantidadNodo = hijo(ln, dialecto.cantidad);

    let descuento = 0;
    let recargo = 0;
    for (const ac of hijos(ln, 'AllowanceCharge')) {
      const monto = num(texto(ac, 'Amount'));
      // ChargeIndicator distingue recargo (true) de descuento (false).
      if (texto(ac, 'ChargeIndicator').toLowerCase() === 'true') recargo += monto;
      else descuento += monto;
    }

    const impuestos = impuestosDe(ln, 'linea', idx + 1);

    return {
      numero: num(texto(ln, 'ID')) || idx + 1,
      codigoVendedor: texto(ruta(item, 'SellersItemIdentification', 'ID')),
      codigoEstandar: texto(ruta(item, 'StandardItemIdentification', 'ID')),
      descripcion: texto(item, 'Description'),
      nota: texto(ln, 'Note'),
      cantidad: num(texto(cantidadNodo)),
      unidadMedida: atributo(cantidadNodo, 'unitCode'),
      precioUnitario: num(texto(precio, 'PriceAmount')),
      descuento: redondear(descuento),
      recargo: redondear(recargo),
      valorBruto: num(texto(ln, 'LineExtensionAmount')),
      impuestos,
      totalImpuestos: redondear(
        impuestos.filter((i) => !i.esRetencion).reduce((a, i) => a + i.valor, 0),
      ),
    };
  });
}

// ── Resumen ───────────────────────────────────────────────────────────────

/** Agrega los impuestos del documento a las cifras que consumen el
 *  dashboard, el Excel y las columnas denormalizadas. Se calcula una vez
 *  aquí, no en cada consulta. */
function resumir(impuestos: Impuesto[], totales: TotalesDocumento): ResumenImpuestos {
  const r: ResumenImpuestos = {
    base: totales.baseImponible,
    iva: 0, inc: 0, ica: 0, bolsas: 0, otros: 0,
    reteRenta: 0, reteIva: 0, reteIca: 0,
    totalImpuestos: 0, totalRetenciones: 0,
    baseIvaPorTarifa: {},
  };

  // Sólo los impuestos a nivel documento: los de línea son el mismo dinero
  // desglosado, y sumar ambos duplicaría todos los totales.
  //
  // Excepción (no está en Codec Document): si el documento no desglosa
  // ningún impuesto a nivel documento —pasa con el XML que emite este POS,
  // que sólo declara el TaxAmount total— se toman los de línea, que entonces
  // son la única fuente y no hay nada que duplicar.
  const deDocumento = impuestos.filter((x) => x.alcance === 'documento');
  const fuente = deDocumento.length > 0 ? deDocumento : impuestos.filter((x) => x.alcance === 'linea');

  for (const i of fuente) {
    if (i.esRetencion) {
      r.totalRetenciones += i.valor;
      if (i.codigo === '06') r.reteRenta += i.valor;
      else if (i.codigo === '05') r.reteIva += i.valor;
      else if (i.codigo === '07') r.reteIca += i.valor;
      continue;
    }

    r.totalImpuestos += i.valor;
    switch (i.codigo) {
      case '01':
        r.iva += i.valor;
        // El clasificador por tarifa (0 %, 5 %, 19 %, excluido) es una de
        // las salidas que el contador realmente usa.
        r.baseIvaPorTarifa[String(i.tarifa)] = redondear(
          (r.baseIvaPorTarifa[String(i.tarifa)] ?? 0) + i.baseGravable,
        );
        break;
      case '04': r.inc += i.valor; break;
      case '03': r.ica += i.valor; break;
      case '22': r.bolsas += i.valor; break;
      default: r.otros += i.valor; break;
    }
  }

  for (const k of ['iva', 'inc', 'ica', 'bolsas', 'otros', 'reteRenta', 'reteIva', 'reteIca', 'totalImpuestos', 'totalRetenciones'] as const) {
    r[k] = redondear(r[k]);
  }
  return r;
}

// ── Validación ────────────────────────────────────────────────────────────

function validar(doc: DocumentoNormalizado): Excepcion[] {
  const ex: Excepcion[] = [];
  const falta = (codigo: string, campo: string, mensaje: string) =>
    ex.push({ codigo, severidad: 'revision', mensaje, campo });

  if (!doc.cufe) falta('CUFE_AUSENTE', 'cufe', 'El documento no trae CUFE ni CUDE.');
  if (!doc.numero) falta('NUMERO_AUSENTE', 'numero', 'El documento no trae número.');
  if (!doc.fechaEmision) falta('FECHA_AUSENTE', 'fechaEmision', 'El documento no trae fecha de emisión.');
  if (!doc.emisor.nit) falta('EMISOR_SIN_NIT', 'emisor.nit', 'No se pudo leer el NIT del emisor.');
  if (!doc.receptor.nit) falta('RECEPTOR_SIN_NIT', 'receptor.nit', 'No se pudo leer el NIT del receptor.');

  if (doc.tipo !== 'evento' && doc.lineas.length === 0) {
    falta('SIN_LINEAS', 'lineas', 'El documento no tiene líneas de detalle.');
  }

  // Documento equivalente POS sin adquiriente identificado.
  //
  // El artículo 16 de la Resolución 000165 de 2023 sólo reconoce el documento
  // equivalente electrónico como soporte de IVA descontable, costos y
  // deducciones cuando el adquiriente queda plenamente identificado con su
  // nombre o razón social y su número de identificación. Si el vendedor lo
  // expidió a «Consumidor final» —NIT 222222222222, según la Resolución
  // 000042 de 2020— no sirve para descontar nada.
  //
  // Es el hallazgo más caro que puede dar esta herramienta y no se ve por
  // ninguna parte al abrir el archivo: el documento es perfectamente válido,
  // está firmado y la DIAN lo validó. Sólo que descontarle el IVA es un
  // rechazo seguro en una revisión. Quien no lo sepa lo descuenta.
  if (doc.tipo === 'documento_equivalente'
      && (!doc.receptor.nit || CONSUMIDOR_FINAL.has(doc.receptor.nit))) {
    ex.push({
      codigo: 'POS_SIN_ADQUIRIENTE',
      severidad: 'revision',
      mensaje:
        'Este documento equivalente salió a nombre de «Consumidor final», sin identificar '
        + 'al comprador. Así no sirve para descontar IVA ni para soportar costos ni '
        + 'deducciones (Res. 000165 de 2023, art. 16). Pídele al proveedor que lo reexpida '
        + 'con el NIT y la razón social, o que te dé factura electrónica.',
      campo: 'receptor.nit',
      encontrado: doc.receptor.nit || '(vacío)',
    });
  }

  // Cuadre 1: la suma de las líneas contra el bruto declarado.
  if (doc.lineas.length > 0 && doc.totales.brutoLineas > 0) {
    const suma = redondear(doc.lineas.reduce((a, l) => a + l.valorBruto, 0));
    if (Math.abs(suma - doc.totales.brutoLineas) > TOLERANCIA) {
      ex.push({
        codigo: 'DESCUADRE_LINEAS',
        severidad: 'revision',
        mensaje: 'La suma de las líneas no coincide con el subtotal declarado.',
        campo: 'totales.brutoLineas',
        esperado: String(doc.totales.brutoLineas),
        encontrado: String(suma),
      });
    }
  }

  // Cuadre 2: valor de las líneas + impuestos contra el total.
  //
  // Se compara contra brutoLineas (LineExtensionAmount), NO contra
  // baseImponible (TaxExclusiveAmount). Confirmado sobre documentos reales:
  // TaxExclusiveAmount es la base GRAVABLE, no el total antes de impuestos.
  // Una línea excluida de IVA suma en LineExtensionAmount y no aparece en
  // TaxExclusiveAmount, así que la fórmula ingenua marca como descuadrada
  // toda factura que mezcle productos gravados y excluidos — que en un
  // supermercado son casi todas.
  if (doc.totales.totalConImpuestos > 0 && doc.totales.brutoLineas > 0) {
    const calculado = redondear(
      doc.totales.brutoLineas
      - doc.totales.descuentos
      + doc.totales.recargos
      + doc.resumen.totalImpuestos,
    );
    if (Math.abs(calculado - doc.totales.totalConImpuestos) > TOLERANCIA) {
      ex.push({
        codigo: 'DESCUADRE_IMPUESTOS',
        severidad: 'revision',
        mensaje: 'El valor de las líneas más los impuestos no coincide con el total declarado.',
        campo: 'totales.totalConImpuestos',
        esperado: String(doc.totales.totalConImpuestos),
        encontrado: String(calculado),
      });
    }
  }

  if (doc.fechaVencimiento && doc.fechaEmision && doc.fechaVencimiento < doc.fechaEmision) {
    ex.push({
      codigo: 'FECHAS_INCOHERENTES',
      severidad: 'revision',
      mensaje: 'La fecha de vencimiento es anterior a la de emisión.',
      campo: 'fechaVencimiento',
    });
  }

  if (doc.tipo === 'desconocido') {
    ex.push({
      codigo: 'TIPO_NO_SOPORTADO',
      severidad: 'revision',
      mensaje: 'Codec no reconoce este tipo de documento todavía.',
      campo: 'tipo',
      encontrado: doc.tipoCodigo,
    });
  }

  return ex;
}

// ── Desanidado ────────────────────────────────────────────────────────────

/** Un AttachedDocument guarda los documentos reales dentro de bloques CDATA.
 *  Si el parser no desanida esto, el 100 % de los archivos que entrega el
 *  portal de la DIAN queda como "inválido". Es el error número uno del
 *  dominio y la razón por la que este parser existe.
 *
 *  Trae DOS, y no en el mismo sitio — verificado sobre documentos reales:
 *
 *    la factura   cac:Attachment/cac:ExternalReference/cbc:Description
 *    el acuse     cac:ParentDocumentLineReference/cac:DocumentReference/
 *                 cac:Attachment/cac:ExternalReference/cbc:Description
 *
 *  Por eso se buscan todos los Description del árbol en vez de recorrer una
 *  ruta fija: un emisor podría colocarlos en un tercer sitio y el resultado
 *  seguiría siendo correcto. */
function desanidar(raiz: XmlNode): { documentos: XmlNode[]; envoltura: XmlNode | null } {
  if (raiz.name !== 'AttachedDocument') return { documentos: [raiz], envoltura: null };

  const documentos: XmlNode[] = [];
  for (const ref of buscarTodos(raiz, 'ExternalReference')) {
    const interior = hijo(ref, 'Description')?.text?.trim();
    if (!interior || !interior.includes('<')) continue;
    try {
      documentos.push(parseXml(interior));
    } catch {
      // Un CDATA ilegible no invalida el resto: puede ser el acuse, no la
      // factura. Si lo que falta es la factura, validar() lo reportará.
    }
  }
  return { documentos, envoltura: raiz };
}

// ── Entrada principal ─────────────────────────────────────────────────────

export function parseDianXml(xml: string): ResultadoParseo {
  let raiz: XmlNode;
  try {
    raiz = parseXml(xml);
  } catch (e) {
    const err = e as XmlError;
    return {
      ok: false,
      documento: null,
      validacionDian: null,
      excepciones: [{
        codigo: err.code ?? 'XML_INVALIDO',
        severidad: 'error',
        mensaje: err.message || 'El archivo no es un XML válido.',
      }],
    };
  }

  const { documentos, envoltura } = desanidar(raiz);

  const principal = documentos.find((d) => d.name !== 'ApplicationResponse');
  const respuesta = documentos.find((d) => d.name === 'ApplicationResponse');

  const validacionDian = respuesta
    ? {
        validado: true,
        fecha: texto(respuesta, 'IssueDate'),
        descripcion:
          texto(buscar(respuesta, 'Description')) ||
          texto(buscar(respuesta, 'ResponseCode')),
      }
    : null;

  if (!principal) {
    return {
      ok: false,
      documento: null,
      validacionDian,
      excepciones: [{
        codigo: 'SIN_DOCUMENTO',
        severidad: 'error',
        mensaje: 'El archivo no contiene ningún documento electrónico legible.',
      }],
    };
  }

  const documento = construir(principal, envoltura);
  const excepciones = validar(documento);

  return {
    ok: !excepciones.some((e) => e.severidad === 'error'),
    documento,
    validacionDian,
    excepciones,
  };
}

function construir(raiz: XmlNode, envoltura: XmlNode | null): DocumentoNormalizado {
  const dialecto = DIALECTOS[raiz.name] ?? DIALECTOS.Invoice;

  const tipoCodigo =
    texto(raiz, 'InvoiceTypeCode') ||
    texto(raiz, 'CreditNoteTypeCode') ||
    texto(raiz, 'DebitNoteTypeCode');

  const uuid = hijo(raiz, 'UUID');
  const numeroCompleto = texto(raiz, 'ID');

  // El prefijo viene declarado en la extensión DIAN; si falta, se deduce de
  // la parte alfabética del número, que es como lo lee un humano.
  const dianExt = buscar(envoltura ?? raiz, 'DianExtensions') ?? buscar(raiz, 'DianExtensions');
  const control = hijo(dianExt, 'InvoiceControl');
  const autorizados = hijo(control, 'AuthorizedInvoices');
  const prefijo = texto(autorizados, 'Prefix') || (numeroCompleto.match(/^[A-Za-z]+/)?.[0] ?? '');

  const lineas = leerLineas(raiz, dialecto);
  const impuestosDoc = impuestosDe(raiz, 'documento', null);
  const impuestos = [...impuestosDoc, ...lineas.flatMap((l) => l.impuestos)];

  const lmt = hijo(raiz, 'LegalMonetaryTotal') ?? hijo(raiz, 'RequestedMonetaryTotal');
  const totales: TotalesDocumento = {
    brutoLineas: num(texto(lmt, 'LineExtensionAmount')),
    baseImponible: num(texto(lmt, 'TaxExclusiveAmount')),
    totalConImpuestos: num(texto(lmt, 'TaxInclusiveAmount')),
    descuentos: num(texto(lmt, 'AllowanceTotalAmount')),
    recargos: num(texto(lmt, 'ChargeTotalAmount')),
    anticipos: num(texto(lmt, 'PrepaidAmount')),
    redondeo: num(texto(lmt, 'PayableRoundingAmount')),
    total: num(texto(lmt, 'PayableAmount')),
  };

  const pago = hijo(raiz, 'PaymentMeans');
  const referencia =
    ruta(raiz, 'BillingReference', 'InvoiceDocumentReference') ??
    hijo(raiz, 'DiscrepancyResponse');

  const doc: DocumentoNormalizado = {
    tipo: tipoDesdeRaiz(raiz.name, tipoCodigo),
    tipoCodigo,
    direccion: 'desconocido' as Direccion,

    cufe: texto(uuid),
    cufeEsquema: atributo(uuid, 'schemeName'),
    prefijo,
    numero: numeroCompleto.replace(/^[A-Za-z]+/, ''),
    numeroCompleto,

    fechaEmision: texto(raiz, 'IssueDate'),
    horaEmision: texto(raiz, 'IssueTime'),
    fechaVencimiento: texto(raiz, 'DueDate') || texto(ruta(raiz, 'PaymentMeans', 'PaymentDueDate')),

    moneda: texto(raiz, 'DocumentCurrencyCode') || 'COP',
    formaPago: texto(pago, 'ID'),
    medioPago: texto(pago, 'PaymentMeansCode'),

    emisor: leerTercero(hijo(raiz, 'AccountingSupplierParty')),
    receptor: leerTercero(hijo(raiz, 'AccountingCustomerParty')),

    lineas,
    impuestos,
    totales,
    resumen: resumir(impuestos, totales),

    autorizacion: {
      resolucion: texto(control, 'InvoiceAuthorization'),
      vigenciaDesde: texto(ruta(control, 'AuthorizationPeriod', 'StartDate')),
      vigenciaHasta: texto(ruta(control, 'AuthorizationPeriod', 'EndDate')),
      prefijo: texto(autorizados, 'Prefix'),
      rangoDesde: texto(autorizados, 'From'),
      rangoHasta: texto(autorizados, 'To'),
      proveedorTecnologicoNit: texto(ruta(dianExt, 'SoftwareProvider', 'ProviderID')),
      softwareId: texto(ruta(dianExt, 'SoftwareProvider', 'SoftwareID')),
      qr: texto(dianExt, 'QRCode'),
    },

    notas: hijos(raiz, 'Note').map((n) => n.text.trim()).filter(Boolean),
    documentoReferencia: referencia
      ? {
          numero: texto(referencia, 'ID'),
          cufe: texto(referencia, 'UUID'),
          fecha: texto(referencia, 'IssueDate'),
        }
      : null,

    versionMotor: VERSION_MOTOR,
  };

  return doc;
}

/** Marca el documento como recibido o emitido según el NIT de la empresa
 *  que lo importa. Se hace fuera del parser porque depende del contexto del
 *  usuario, no del archivo: el mismo XML es "emitido" para quien lo generó
 *  y "recibido" para su cliente. */
export function marcarDireccion(doc: DocumentoNormalizado, nitPropio: string): DocumentoNormalizado {
  const limpio = nitPropio.replace(/\D/g, '');
  if (!limpio) return doc;
  if (doc.emisor.nit.replace(/\D/g, '') === limpio) return { ...doc, direccion: 'emitido' };
  if (doc.receptor.nit.replace(/\D/g, '') === limpio) return { ...doc, direccion: 'recibido' };
  return doc;
}
