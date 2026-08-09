-- La "Clave Técnica" (ClTec) es un credencial que la DIAN entrega en la
-- habilitación, distinta del "identificador de software" — ambas entran en
-- la fórmula del CUFE (Anexo Técnico v1.9) pero son valores independientes.
-- Faltaba una columna propia; sin ella el CUFE se calcularía con el dato
-- equivocado. Nace vacía (pending configuration) — el negocio la carga
-- desde el asistente cuando la DIAN se la entregue.
alter table public.perfiles_fiscales
  add column if not exists clave_tecnica text;
