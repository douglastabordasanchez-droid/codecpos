-- Facturación electrónica desde la web + correcciones a la causación.
--
--   1. dian_certificados_nube — certificado digital del negocio custodiado en
--      el servidor, para que la web y el celular puedan firmar y transmitir
--      a la DIAN igual que Electron. Solo guarda TEXTO CIFRADO (AES-256-GCM;
--      la llave vive únicamente como secreto de la Edge Function
--      dian-emision). RLS activado y SIN políticas: ningún cliente —ni
--      siquiera el dueño del negocio— puede leer esta tabla; solo la función,
--      con la service role.
--
--   2. proveedores.total_comprado_web / saldo_pendiente_web — lo que suma la
--      causación de facturas. Electron publica sus proveedores sobrescribiendo
--      total_comprado y saldo_pendiente con sus valores locales, así que lo
--      causado desde la web se perdía en la siguiente publicación. En columnas
--      aparte, cada lado es dueño de lo suyo y el total es la suma.

-- ============================================================
-- 1. CERTIFICADO EN LA NUBE
-- ============================================================
create table if not exists public.dian_certificados_nube (
  perfil_fiscal_id uuid primary key references public.perfiles_fiscales(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  p12_cifrado text not null,
  pin_cifrado text not null,
  nombre_archivo text,
  sujeto text,
  emisor text,
  vence_el timestamptz,
  subido_por uuid,
  subido_el timestamptz not null default now()
);

alter table public.dian_certificados_nube enable row level security;
revoke all on public.dian_certificados_nube from anon, authenticated;

-- ============================================================
-- 2. COMPRAS CAUSADAS, SEPARADAS DE LO QUE PUBLICA ELECTRON
-- ============================================================
alter table public.proveedores
  add column if not exists total_comprado_web numeric(14,2) not null default 0,
  add column if not exists saldo_pendiente_web numeric(14,2) not null default 0;

-- Lo que la 0099 ya hubiera sumado a las columnas compartidas se traslada.
update public.proveedores p
  set total_comprado_web = sub.monto,
      saldo_pendiente_web = sub.credito,
      total_comprado = greatest(0, p.total_comprado - sub.monto),
      saldo_pendiente = greatest(0, p.saldo_pendiente - sub.credito)
  from (
    select proveedor_id,
           sum(coalesce((causacion_detalle->>'monto')::numeric, total)) as monto,
           sum(case when coalesce((causacion_detalle->>'a_credito')::boolean, false)
                    then coalesce((causacion_detalle->>'monto')::numeric, total) else 0 end) as credito
      from public.documentos_electronicos
      where causado and proveedor_id is not null
      group by proveedor_id
  ) sub
  where p.id = sub.proveedor_id and p.total_comprado_web = 0;

create or replace function public.causar_documento_electronico(
  p_documento_id uuid,
  p_categoria text,
  p_medio_pago text,
  p_a_credito boolean,
  p_fecha timestamptz,
  p_empleado_id uuid,
  p_empleado_nombre text,
  p_lineas_inventario jsonb -- [{producto_id, cantidad, costo_unitario}]
)
returns uuid
language plpgsql
as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_doc public.documentos_electronicos%rowtype;
  v_gasto_id uuid;
  v_proveedor_id uuid;
  v_nit text;
  v_item jsonb;
  v_costo_anterior numeric(12,2);
  v_lineas_aplicadas jsonb := '[]'::jsonb;
begin
  if v_cliente is null then
    raise exception 'Sesión sin negocio asociado';
  end if;

  select * into v_doc
    from public.documentos_electronicos
    where id = p_documento_id and cliente_id = v_cliente
    for update;

  if not found then
    raise exception 'Documento no encontrado';
  end if;
  if v_doc.causado then
    raise exception 'Este documento ya fue causado';
  end if;
  if v_doc.estado = 'invalido' then
    raise exception 'El documento no se pudo leer y no se puede causar';
  end if;
  if v_doc.direccion = 'emitido' then
    raise exception 'Este documento lo emitió tu propio negocio: es una venta, no una compra';
  end if;
  if v_doc.tipo not in ('factura', 'documento_equivalente', 'documento_soporte', 'nota_debito') then
    raise exception 'Este tipo de documento (%) no se causa como compra', v_doc.tipo;
  end if;

  -- 1. Proveedor: se busca por NIT (solo dígitos); si no existe, se crea.
  v_nit := regexp_replace(coalesce(v_doc.emisor_nit, ''), '\D', '', 'g');
  if v_nit <> '' then
    select id into v_proveedor_id
      from public.proveedores
      where cliente_id = v_cliente
        and regexp_replace(coalesce(nit, ''), '\D', '', 'g') = v_nit
      order by activo desc, updated_at desc
      limit 1;

    if v_proveedor_id is null then
      insert into public.proveedores (cliente_id, local_id, nombre, nit, categoria)
      values (v_cliente, 'web-' || v_nit, coalesce(nullif(v_doc.emisor_nombre, ''), 'Proveedor ' || v_nit), v_doc.emisor_nit, 'Facturación electrónica')
      on conflict (cliente_id, local_id) do update set updated_at = now()
      returning id into v_proveedor_id;
    end if;

    update public.proveedores
      set total_comprado_web = total_comprado_web + v_doc.total,
          saldo_pendiente_web = saldo_pendiente_web + case when p_a_credito then v_doc.total else 0 end,
          updated_at = now()
      where id = v_proveedor_id;
  end if;

  -- 2. Gasto. local_id queda NULL a propósito: es la señal con la que
  --    Electron lo reconoce como creado en otro dispositivo y lo baja.
  insert into public.gastos (
    cliente_id, fecha, descripcion, categoria, monto, medio_pago,
    comprobante, registrado_por, registrado_por_nombre, notas
  ) values (
    v_cliente,
    coalesce(p_fecha, now()),
    'Compra ' || coalesce(v_doc.numero_completo, 's/n') || ' — ' || coalesce(nullif(v_doc.emisor_nombre, ''), 'Proveedor'),
    coalesce(nullif(p_categoria, ''), 'inventario'),
    v_doc.total,
    case when p_a_credito then 'credito' else coalesce(nullif(p_medio_pago, ''), 'efectivo') end,
    v_doc.numero_completo,
    p_empleado_id,
    p_empleado_nombre,
    'Causado desde factura electrónica. NIT ' || coalesce(v_doc.emisor_nit, '—')
      || case when coalesce(v_doc.cufe, '') <> '' then ' · CUFE ' || v_doc.cufe else '' end
  ) returning id into v_gasto_id;

  -- 3. Inventario: solo las líneas que el usuario asoció a un producto.
  for v_item in select * from jsonb_array_elements(coalesce(p_lineas_inventario, '[]'::jsonb))
  loop
    if coalesce(v_item->>'producto_id', '') = '' then continue; end if;
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then continue; end if;

    select costo into v_costo_anterior
      from public.productos
      where id = (v_item->>'producto_id')::uuid and cliente_id = v_cliente
      for update;
    if not found then continue; end if;

    update public.productos
      set stock = stock + (v_item->>'cantidad')::numeric,
          costo = case
            when coalesce((v_item->>'costo_unitario')::numeric, 0) > 0 then (v_item->>'costo_unitario')::numeric
            else costo
          end,
          updated_at = now()
      where id = (v_item->>'producto_id')::uuid and cliente_id = v_cliente;

    v_lineas_aplicadas := v_lineas_aplicadas || jsonb_build_object(
      'producto_id', v_item->>'producto_id',
      'cantidad', (v_item->>'cantidad')::numeric,
      'costo_anterior', v_costo_anterior
    );
  end loop;

  update public.documentos_electronicos
    set causado = true,
        causado_at = now(),
        causado_por = p_empleado_id,
        causado_por_nombre = p_empleado_nombre,
        gasto_id = v_gasto_id,
        proveedor_id = v_proveedor_id,
        causacion_detalle = jsonb_build_object(
          'a_credito', coalesce(p_a_credito, false),
          'monto', v_doc.total,
          'lineas', v_lineas_aplicadas
        )
    where id = p_documento_id;

  return v_gasto_id;
end;
$$;

create or replace function public.revertir_causacion_documento(p_documento_id uuid)
returns void
language plpgsql
as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_doc public.documentos_electronicos%rowtype;
  v_item jsonb;
  v_monto numeric(14,2);
begin
  select * into v_doc
    from public.documentos_electronicos
    where id = p_documento_id and cliente_id = v_cliente
    for update;

  if not found then
    raise exception 'Documento no encontrado';
  end if;
  if not v_doc.causado then
    raise exception 'Este documento no está causado';
  end if;

  v_monto := coalesce((v_doc.causacion_detalle->>'monto')::numeric, v_doc.total);

  for v_item in select * from jsonb_array_elements(coalesce(v_doc.causacion_detalle->'lineas', '[]'::jsonb))
  loop
    update public.productos
      set stock = stock - (v_item->>'cantidad')::numeric,
          costo = coalesce((v_item->>'costo_anterior')::numeric, costo),
          updated_at = now()
      where id = (v_item->>'producto_id')::uuid and cliente_id = v_cliente;
  end loop;

  if v_doc.proveedor_id is not null then
    update public.proveedores
      set total_comprado_web = greatest(0, total_comprado_web - v_monto),
          saldo_pendiente_web = greatest(0, saldo_pendiente_web - case
            when coalesce((v_doc.causacion_detalle->>'a_credito')::boolean, false) then v_monto else 0 end),
          updated_at = now()
      where id = v_doc.proveedor_id and cliente_id = v_cliente;
  end if;

  -- El gasto no se borra ni se edita: se registra su reverso (mismo valor en
  -- negativo, misma fecha y categoría). Electron solo baja gastos NUEVOS de
  -- la nube (pullGastosRemotos), así que un borrado o una edición no le
  -- llegarían y su copia local seguiría contando la compra; un movimiento
  -- nuevo sí le llega, y deja el rastro contable de la reversión.
  if v_doc.gasto_id is not null then
    insert into public.gastos (cliente_id, fecha, descripcion, categoria, monto, medio_pago, comprobante, registrado_por_nombre, notas)
    select cliente_id, fecha, 'Reverso de ' || descripcion, categoria, -monto, medio_pago, comprobante, registrado_por_nombre,
           'Reversión de la causación de ' || coalesce(v_doc.numero_completo, 'documento')
      from public.gastos
      where id = v_doc.gasto_id and cliente_id = v_cliente;
  end if;

  update public.documentos_electronicos
    set causado = false,
        causado_at = null,
        causado_por = null,
        causado_por_nombre = null,
        gasto_id = null,
        causacion_detalle = null
    where id = p_documento_id;
end;
$$;
