-- 0160: catálogo interno de códigos de barras de Codec.
--
-- Al escanear un código que el negocio no tiene, «Producto nuevo» sugiere el
-- nombre si algún negocio de Codec ya registró ese producto (las bases públicas
-- no tienen muchos productos colombianos, p. ej. jugo California 7702617486927).
--
-- Reglas:
--  * Solo guarda código, nombre, marca y categoría. Nunca precio, costo, stock
--    ni de qué negocio vino.
--  * Nadie lee la tabla directamente (RLS sin políticas): solo se consulta un
--    código exacto con consultar_catalogo_codigo().
--  * Solo entran códigos GS1 reales (UPC-A, EAN-13, GTIN-14 con dígito
--    verificador correcto y sin prefijos de uso interno): los códigos propios
--    de cada negocio no entran.
--  * Si alimentar el catálogo falla, el guardado del producto del cliente sigue.

create table if not exists public.catalogo_codigos (
  codigo text primary key,
  nombre text not null,
  marca text,
  categoria text,
  fuentes int not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.catalogo_codigos enable row level security;
revoke all on public.catalogo_codigos from anon, authenticated;

create or replace function public.es_codigo_gs1(p text)
returns boolean language plpgsql immutable as $$
declare
  n int; suma int := 0; i int; d int; peso int;
begin
  -- Solo UPC-A (12), EAN-13 (13) y GTIN-14. Fuera EAN-8 (casi siempre códigos
  -- internos de 8 dígitos) y los prefijos 2 / 02 / 04, que GS1 reserva para uso
  -- interno de cada tienda (pesables, códigos propios).
  if p is null or p !~ '^[0-9]{12,14}$' then return false; end if;
  if p ~ '^0+$' or p ~ '^(2|02|04|002|004)' or p ~ '^0000' then return false; end if;
  n := length(p);
  -- Desde el penúltimo dígito hacia la izquierda, pesos 3,1,3,1...
  for i in 1..n-1 loop
    d := substr(p, n - i, 1)::int;
    peso := case when i % 2 = 1 then 3 else 1 end;
    suma := suma + d * peso;
  end loop;
  return (10 - (suma % 10)) % 10 = substr(p, n, 1)::int;
end;
$$;

create or replace function public.alimentar_catalogo_codigos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := btrim(coalesce(NEW.codigo_barras, ''));
  v_nombre text := btrim(coalesce(NEW.nombre, ''));
begin
  begin
    if length(v_nombre) < 3 or not public.es_codigo_gs1(v_codigo) then return NEW; end if;
    if TG_OP = 'UPDATE' and OLD.codigo_barras is not distinct from NEW.codigo_barras then return NEW; end if;
    insert into public.catalogo_codigos (codigo, nombre, marca, categoria)
    values (v_codigo, left(v_nombre, 160), nullif(left(btrim(coalesce(NEW.marca, '')), 80), ''), nullif(left(btrim(coalesce(NEW.categoria, '')), 80), ''))
    on conflict (codigo) do update
      set fuentes = public.catalogo_codigos.fuentes + 1,
          marca = coalesce(public.catalogo_codigos.marca, excluded.marca),
          categoria = coalesce(public.catalogo_codigos.categoria, excluded.categoria),
          actualizado_en = now();
  exception when others then
    -- El catálogo nunca debe frenar el guardado del producto del cliente.
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_alimentar_catalogo_codigos on public.productos;
create trigger trg_alimentar_catalogo_codigos
  after insert or update of codigo_barras on public.productos
  for each row execute function public.alimentar_catalogo_codigos();

-- Consulta de un solo código exacto, para cualquier empleado con sesión.
create or replace function public.consultar_catalogo_codigo(p_codigo text)
returns table (nombre text, marca text, categoria text)
language sql stable security definer set search_path = public as $$
  select c.nombre, c.marca, c.categoria
  from public.catalogo_codigos c
  where auth.uid() is not null and c.codigo = btrim(p_codigo)
  limit 1
$$;
revoke all on function public.consultar_catalogo_codigo(text) from public, anon;
grant execute on function public.consultar_catalogo_codigo(text) to authenticated;
revoke all on function public.alimentar_catalogo_codigos() from public, anon, authenticated;

-- Carga inicial con lo que ya existe (el nombre más usado por código).
insert into public.catalogo_codigos (codigo, nombre, marca, categoria, fuentes)
select codigo, nombre, marca, categoria, fuentes from (
  select codigo, nombre, marca, categoria,
         count(*) over (partition by codigo)::int fuentes,
         row_number() over (partition by codigo order by usos desc, actualizado desc nulls last) rn
  from (
    select btrim(codigo_barras) codigo,
           left(btrim(nombre), 160) nombre,
           nullif(left(btrim(coalesce(marca, '')), 80), '') marca,
           nullif(left(btrim(coalesce(categoria, '')), 80), '') categoria,
           count(*) over (partition by btrim(codigo_barras), upper(btrim(nombre))) usos,
           updated_at actualizado
    from public.productos
    where public.es_codigo_gs1(btrim(codigo_barras)) and length(btrim(coalesce(nombre, ''))) >= 3
  ) base
) t
where rn = 1
on conflict (codigo) do nothing;
