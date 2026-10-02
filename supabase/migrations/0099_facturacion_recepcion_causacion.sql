-- Módulo de Facturación (web): Recepción y Causación de documentos
-- electrónicos DIAN, portado de la sección «Documentos electrónicos / DIAN»
-- de Codec Document.
--
-- Qué agrega:
--   1. documentos_electronicos — cada XML subido (suelto o dentro de un ZIP),
--      ya analizado por el motor de src/app/lib/dian/recepcion. Guarda el XML
--      original: si el parser mejora, se reprocesa sin volver a pedir nada.
--   2. causar_documento_electronico() — causa el documento de forma atómica:
--      registra el gasto, actualiza el proveedor y (si aplica) el inventario.
--   3. revertir_causacion_documento() — deshace exactamente lo anterior.
--   4. facturas_electronicas.correo_* — estado de envío por correo de las
--      facturas emitidas (columna «Estado correo» de la tabla estilo Siigo).
--
-- Mismo patrón multi-tenant de siempre: cliente_id + RLS por
-- current_cliente_id(). Electron ya baja solo lo que nace aquí: los gastos
-- con local_id NULL (pullGastosRemotos) y los productos por updated_at
-- (pullProductosRemotos) — no hace falta sync nueva.

-- ============================================================
-- DOCUMENTOS ELECTRÓNICOS RECIBIDOS / CARGADOS
-- ============================================================
create table if not exists public.documentos_electronicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,

  tipo text not null default 'desconocido',
  tipo_codigo text,
  -- 'recibido' (compra a un proveedor) | 'emitido' (lo emitió este negocio) | 'desconocido'
  direccion text not null default 'desconocido'
    check (direccion in ('recibido', 'emitido', 'desconocido')),

  cufe text,
  prefijo text,
  numero text,
  numero_completo text,
  fecha_emision date,
  fecha_vencimiento date,
  moneda text not null default 'COP',
  forma_pago text,

  emisor_nit text,
  emisor_dv text,
  emisor_nombre text,
  receptor_nit text,
  receptor_nombre text,

  subtotal numeric(14,2) not null default 0,
  total_iva numeric(14,2) not null default 0,
  total_inc numeric(14,2) not null default 0,
  total_impuestos numeric(14,2) not null default 0,
  total_retenciones numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,

  -- 'procesado' | 'revision' (tiene observaciones) | 'invalido' (no se pudo leer)
  estado text not null default 'procesado'
    check (estado in ('procesado', 'revision', 'invalido')),
  excepciones jsonb not null default '[]'::jsonb,
  lineas jsonb not null default '[]'::jsonb,
  impuestos jsonb not null default '[]'::jsonb,
  validado_dian boolean not null default false,

  xml text,
  hash_sha256 text not null,
  nombre_archivo text,
  version_motor text,

  causado boolean not null default false,
  causado_at timestamptz,
  causado_por uuid references public.empleados(id),
  causado_por_nombre text,
  gasto_id uuid references public.gastos(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  -- Lo que la causación le sumó al proveedor y al inventario, para poder
  -- revertirla exactamente: {a_credito, monto, lineas:[{producto_id,cantidad,costo_anterior}]}
  causacion_detalle jsonb,

  subido_por uuid references public.empleados(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_documentos_electronicos_cliente on public.documentos_electronicos(cliente_id);
create index if not exists idx_documentos_electronicos_fecha on public.documentos_electronicos(cliente_id, fecha_emision desc);
-- Deduplicación en dos niveles: mismo archivo byte a byte, y mismo documento
-- (CUFE) aunque el archivo difiera (suelto vs. dentro del AttachedDocument).
create unique index if not exists documentos_electronicos_hash_unico
  on public.documentos_electronicos(cliente_id, hash_sha256);
create unique index if not exists documentos_electronicos_cufe_unico
  on public.documentos_electronicos(cliente_id, cufe) where cufe is not null and cufe <> '';

alter table public.documentos_electronicos enable row level security;
drop policy if exists documentos_electronicos_tenant on public.documentos_electronicos;
create policy documentos_electronicos_tenant on public.documentos_electronicos
  for all using (cliente_id = (select public.current_cliente_id()))
  with check (cliente_id = (select public.current_cliente_id()));

-- ============================================================
-- ESTADO DE CORREO DE LAS FACTURAS EMITIDAS
-- ============================================================
alter table public.facturas_electronicas
  add column if not exists correo_enviado_at timestamptz,
  add column if not exists correo_destino text;

-- ============================================================
-- RPC: causar un documento (gasto + proveedor + inventario), atómico
-- ============================================================
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
      set total_comprado = total_comprado + v_doc.total,
          saldo_pendiente = saldo_pendiente + case when p_a_credito then v_doc.total else 0 end,
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

grant execute on function public.causar_documento_electronico(uuid, text, text, boolean, timestamptz, uuid, text, jsonb) to authenticated;

-- ============================================================
-- RPC: revertir una causación (deshace gasto, proveedor e inventario)
-- ============================================================
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
      set total_comprado = greatest(0, total_comprado - v_monto),
          saldo_pendiente = greatest(0, saldo_pendiente - case
            when coalesce((v_doc.causacion_detalle->>'a_credito')::boolean, false) then v_monto else 0 end),
          updated_at = now()
      where id = v_doc.proveedor_id and cliente_id = v_cliente;
  end if;

  if v_doc.gasto_id is not null then
    delete from public.gastos where id = v_doc.gasto_id and cliente_id = v_cliente;
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

grant execute on function public.revertir_causacion_documento(uuid) to authenticated;
