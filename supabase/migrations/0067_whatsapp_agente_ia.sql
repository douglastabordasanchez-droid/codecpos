-- Agente de IA en WhatsApp Business (multi-servicio: Codec Studio, Codec
-- Document, Codec POS, Automatizaciones). El mismo número de WhatsApp
-- atiende los 4 servicios; estas tablas guardan la conversación y sirven
-- de historial para el modelo y de lead para seguimiento humano.
--
-- RLS habilitado pero SIN políticas: solo el Edge Function
-- (webhook-whatsapp, service_role) puede leer/escribir hoy. No se expone a
-- anon/authenticated a propósito -- son leads internos de Codec, no datos
-- de un cliente de clientes_pos. Cuando se quiera mostrar esto en el Admin
-- Web, agregar una política `for select to authenticated using
-- (public.es_staff_actual())` (función ya existente, ver migración 0049).

create table public.whatsapp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,
  nombre_contacto text,
  ultimo_mensaje_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

create table public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.whatsapp_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('usuario', 'asistente')),
  contenido text not null,
  wa_message_id text,
  creado_en timestamptz not null default now()
);

create index whatsapp_mensajes_conversacion_creado_idx
  on public.whatsapp_mensajes (conversacion_id, creado_en);

alter table public.whatsapp_conversaciones enable row level security;
alter table public.whatsapp_mensajes enable row level security;
