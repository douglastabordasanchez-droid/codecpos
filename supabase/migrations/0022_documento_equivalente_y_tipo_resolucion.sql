-- Regla de negocio (Resolución 000165 de 2023): una venta con comprador
-- IDENTIFICADO (NIT/cédula) se factura como Factura Electrónica (CUFE);
-- una venta SIN identificar al comprador debe emitirse como Documento
-- Equivalente Electrónico POS (CUDE) — son dos tipos de documento
-- distintos, cada uno con su propia numeración/resolución autorizada por
-- la DIAN. facturas_electronicas ya cubre casi todos los campos que
-- necesita un documento equivalente (mismo emisor/adquirente/items/
-- totales), así que se reutiliza la misma tabla con un discriminador en
-- vez de duplicar el esquema completo.
--
-- Además: perfiles_fiscales_resoluciones no distinguía para QUÉ tipo de
-- documento era cada numeración — la DIAN autoriza rangos SEPARADOS por
-- tipo de documento (factura / documento equivalente / nota crédito /
-- nota débito), así que una resolución de facturas no debería poder
-- usarse por error para numerar notas o documentos equivalentes.

alter table public.perfiles_fiscales_resoluciones
  add column if not exists tipo_documento text not null default 'factura'
    check (tipo_documento in ('factura', 'documento_equivalente', 'nota_credito', 'nota_debito'));

alter table public.facturas_electronicas
  add column if not exists tipo_documento text not null default 'factura'
    check (tipo_documento in ('factura', 'documento_equivalente'));

comment on column public.facturas_electronicas.cufe is
  'CUFE si tipo_documento = factura; CUDE si tipo_documento = documento_equivalente (ver calcularCudeDocumentoEquivalente.ts — no implementado a propósito, fórmula pendiente de confirmar).';
