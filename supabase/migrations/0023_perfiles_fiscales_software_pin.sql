-- El "Software-PIN" es un credencial DISTINTO de clave_tecnica e
-- identificador_software: es el PIN que el facturador asignó al activar su
-- software en el catálogo de participantes de la DIAN. Confirmado contra el
-- Anexo Técnico de Factura Electrónica v1.9 (§11.4 "Generación de CUDE" y
-- §11.8 "Especificación Técnica del Código de Seguridad del Software") y el
-- Anexo Técnico de Documento Equivalente Electrónico v1.0 (§14.1): se usa en
-- la fórmula del CUDE de notas de ajuste y documento equivalente (en lugar
-- de la Clave Técnica, que esas fórmulas no usan) y en el cálculo de
-- SoftwareSecurityCode = SHA-384(IdSoftware + Pin + NroDocumento), requerido
-- en TODA factura, nota o documento equivalente.
alter table public.perfiles_fiscales
  add column if not exists software_pin text;

comment on column public.perfiles_fiscales.software_pin is
  'PIN del software registrado por el facturador en el catálogo DIAN al activar su software — distinto de clave_tecnica (ligada a la resolución) e identificador_software (código de activación). Anexo Técnico v1.9 §11.4/§11.8.';
