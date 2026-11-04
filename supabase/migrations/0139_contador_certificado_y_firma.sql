-- 0139 · Mi contador: el certificado del negocio al servicio de su contador.
--
-- Contrato: B6, B7 y B10 del documento compartido con Codec Document.
-- El contador trabaja en Codec Document y el negocio sigue facturando en
-- Codec POS, los dos con el mismo certificado. Dos vías, las dos activas:
--
--   1. Firma por encargo (contador-firma, cada minuto): Codec Document deja
--      en cola acuses DIAN de compras (030, 031, 032, 033) y nóminas; Codec
--      POS los firma con el certificado que ya tiene en la nube y los envía.
--   2. Copia compartida: el dueño pulsa «Compartir certificado» en Mi
--      contador y contador-sync la manda a pos-certificado. Si el negocio
--      sube un certificado nuevo, se reenvía solo.

-- ── Estado de la vía 2 y de las capacidades enviadas ────────────────────
alter table public.contador_vinculos
  add column if not exists certificado_compartido boolean not null default false,
  add column if not exists certificado_compartido_en timestamptz,
  add column if not exists certificado_compartido_vence date,
  add column if not exists certificado_error text,
  add column if not exists firma_capacidad jsonb,
  add column if not exists firma_capacidad_en timestamptz,
  add column if not exists firma_error text;

-- ── Nómina electrónica: credenciales propias en la DIAN ─────────────────
-- La nómina tiene su propio Software ID y PIN (distintos de los de
-- facturación) y su propia habilitación.
alter table public.perfiles_fiscales
  add column if not exists nomina_software_id text,
  add column if not exists nomina_software_pin text,
  add column if not exists nomina_ambiente text not null default 'habilitacion',
  add column if not exists nomina_test_set_id text;
alter table public.perfiles_fiscales drop constraint if exists perfiles_fiscales_nomina_ambiente_check;
alter table public.perfiles_fiscales add constraint perfiles_fiscales_nomina_ambiente_check
  check (nomina_ambiente in ('habilitacion', 'produccion'));

-- ── Lo que Codec POS firmó por encargo ──────────────────────────────────
-- Si Codec Document vuelve a entregar algo ya enviado (pasaron sus 15
-- minutos sin respuesta), se le repite el resultado guardado en vez de
-- mandarlo otra vez a la DIAN.
create sequence if not exists public.dian_eventos_seq;

create table if not exists public.dian_firmas_encargo (
  id               text primary key,              -- id que dio Codec Document
  cliente_id       uuid not null references public.clientes_pos(id) on delete cascade,
  perfil_fiscal_id uuid references public.perfiles_fiscales(id) on delete set null,
  clase            text not null check (clase in ('acuse', 'nomina')),
  codigo           text,                          -- 030, 031, 032, 033 o 102/103
  numero           text,                          -- ID del ApplicationResponse o número de nómina
  referencia       text,                          -- CUFE de la factura de compra o documento del trabajador
  cude             text,                          -- CUDE del evento o CUNE de la nómina
  estado           text not null default 'firmando'
                   check (estado in ('firmando', 'validado_dian', 'rechazado_dian', 'error_envio')),
  codigo_dian      text,
  mensaje          text,
  xml_firmado      text,
  zip_key          text,                          -- nómina en habilitación: se consulta con GetStatusZip
  intentos         integer not null default 0,
  reportado        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists dian_firmas_encargo_cliente_idx on public.dian_firmas_encargo (cliente_id, created_at desc);
alter table public.dian_firmas_encargo enable row level security;
revoke all on public.dian_firmas_encargo from anon, authenticated;

-- Número del ApplicationResponse: único para todos los negocios.
create or replace function public.dian_siguiente_evento()
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select 'EV' || lpad(nextval('public.dian_eventos_seq')::text, 8, '0');
$function$;
revoke all on function public.dian_siguiente_evento() from public, anon, authenticated;

-- ── Para la pantalla Mi contador (nunca devuelve el certificado) ────────
create or replace function public.mi_contador_certificado()
returns table (
  tiene_certificado boolean, titular text, vence timestamptz,
  compartido boolean, compartido_en timestamptz, compartido_vence date, error text,
  firma_capacidad jsonb, firma_error text, firmas_validadas bigint, firmas_rechazadas bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select (c.perfil_fiscal_id is not null), c.sujeto, c.vence_el,
         v.certificado_compartido, v.certificado_compartido_en, v.certificado_compartido_vence, v.certificado_error,
         v.firma_capacidad, v.firma_error,
         (select count(*) from public.dian_firmas_encargo f where f.cliente_id = v.cliente_id and f.estado = 'validado_dian'),
         (select count(*) from public.dian_firmas_encargo f where f.cliente_id = v.cliente_id and f.estado = 'rechazado_dian')
  from public.contador_vinculos v
  left join public.perfiles_fiscales p
    on p.cliente_id = v.cliente_id and p.activo
  left join public.dian_certificados_nube c on c.perfil_fiscal_id = p.id
  where v.cliente_id = public.current_cliente_id()
  limit 1;
$function$;
revoke all on function public.mi_contador_certificado() from public, anon;
grant execute on function public.mi_contador_certificado() to authenticated;

-- ── Cron: la firma por encargo pregunta cada minuto ─────────────────────
-- Solo despierta la función si hay algún negocio conectado con su
-- certificado en la nube.
create or replace function public.contador_despertar_firma()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secreto text;
begin
  if not exists (
    select 1 from public.contador_vinculos v
    join public.perfiles_fiscales p on p.cliente_id = v.cliente_id and p.activo
    join public.dian_certificados_nube c on c.perfil_fiscal_id = p.id
    where v.estado = 'activo'
  ) then
    return;
  end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'contador_cron_secret';
  perform net.http_post(
    url := 'https://ophsckohhjajcsqniqvw.supabase.co/functions/v1/contador-firma',
    body := jsonb_build_object('accion', 'despachar'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-contador-secret', coalesce(v_secreto, '')),
    timeout_milliseconds := 55000
  );
end;
$function$;
revoke all on function public.contador_despertar_firma() from public, anon, authenticated;

select cron.unschedule('contador-firma') where exists (select 1 from cron.job where jobname = 'contador-firma');
select cron.schedule('contador-firma', '* * * * *', 'select public.contador_despertar_firma()');
