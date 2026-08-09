-- Las notas de ajuste (crédito/débito) nacieron en 0019 con solo lo mínimo
-- (motivo, total, estado). Para emitirlas de verdad hace falta: su propia
-- numeración (prefijo/resolución — la DIAN autoriza un rango DISTINTO al de
-- las facturas), el concepto normalizado que exige el Anexo Técnico, el
-- detalle de items ajustados y la fecha de emisión explícita (created_at no
-- sirve para eso: una nota puede registrarse en el sistema en un momento y
-- emitirse/firmarse en otro).
alter table public.notas_credito_electronicas
  add column if not exists prefijo text,
  add column if not exists resolucion_id uuid references public.perfiles_fiscales_resoluciones(id),
  add column if not exists concepto_codigo text,
  add column if not exists items jsonb,
  add column if not exists subtotal numeric(14,2),
  add column if not exists total_impuestos numeric(14,2),
  add column if not exists fecha_emision timestamptz not null default now();

alter table public.notas_debito_electronicas
  add column if not exists prefijo text,
  add column if not exists resolucion_id uuid references public.perfiles_fiscales_resoluciones(id),
  add column if not exists concepto_codigo text,
  add column if not exists items jsonb,
  add column if not exists subtotal numeric(14,2),
  add column if not exists total_impuestos numeric(14,2),
  add column if not exists fecha_emision timestamptz not null default now();

-- Una factura puede tener varias notas, pero cada número de nota es único
-- dentro de su propia numeración (mismo patrón que facturas_electronicas).
create unique index if not exists idx_notas_credito_numero_unico
  on public.notas_credito_electronicas(perfil_fiscal_id, prefijo, numero_nota);
create unique index if not exists idx_notas_debito_numero_unico
  on public.notas_debito_electronicas(perfil_fiscal_id, prefijo, numero_nota);
