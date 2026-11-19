-- 0158 · Factura a nombre de un cliente SIN facturación electrónica.
-- Al cobrar (caja, web, celular y terminal) se puede escribir nombre, cédula
-- o NIT, celular, correo y una descripción. Salen en la factura impresa y en
-- el PDF. No van a la DIAN. Todas opcionales.
alter table public.ventas
  add column if not exists cliente_nombre text,
  add column if not exists cliente_documento text,
  add column if not exists cliente_telefono text,
  add column if not exists cliente_email text,
  add column if not exists observaciones text;
