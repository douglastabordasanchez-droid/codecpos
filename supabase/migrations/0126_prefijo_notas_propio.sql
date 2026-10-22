-- 0126 · Prefijo propio para las notas crédito y débito: NCCP y NDCP.
--
-- La DIAN rechaza una nota con la regla 90 («Documento procesado
-- anteriormente») cuando ese emisor ya le envió otro documento con el mismo
-- número. Los negocios que vienen de otro proveedor (Siigo, Alegra...) ya
-- usaron NC1, NC2... con su NIT: Distribuciones BM, 2026-10-22, NC1 y NC2
-- rechazadas al anular DBM1507. Con un prefijo que solo usa Codec Pos (NCCP
-- y NDCP, máximo 4 caracteres) la numeración nunca choca con la anterior.

create or replace function public.crear_numeracion_notas(p_perfil_fiscal_id uuid, p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles_fiscales_resoluciones
    (perfil_fiscal_id, cliente_id, tipo_documento, prefijo, resolucion_numero, resolucion_fecha, rango_desde, rango_hasta)
  select p_perfil_fiscal_id, p_cliente_id, t.tipo, t.prefijo, 'Sin resolución (notas)', (now() at time zone 'America/Bogota')::date, 1, 999999999
  from (values ('nota_credito', 'NCCP'), ('nota_debito', 'NDCP')) as t(tipo, prefijo)
  where not exists (
    select 1 from public.perfiles_fiscales_resoluciones r
    where r.perfil_fiscal_id = p_perfil_fiscal_id and r.tipo_documento = t.tipo and r.estado = 'activa'
  );
end;
$$;

-- Las numeraciones NC y ND automáticas que ya existen se retiran (las notas
-- que se alcanzaron a emitir conservan su número) y se crean las nuevas.
update public.perfiles_fiscales_resoluciones
set estado = 'vencida'
where tipo_documento in ('nota_credito', 'nota_debito')
  and prefijo in ('NC', 'ND')
  and resolucion_numero = 'Sin resolución (notas)'
  and estado = 'activa';

select public.crear_numeracion_notas(p.id, p.cliente_id) from public.perfiles_fiscales p;
