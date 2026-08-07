-- nit/contacto/telefono eran NOT NULL sin default, lo que rompía la
-- creación rápida de un negocio nuevo (Panel Desarrollador, tanto en
-- Electron como en la PWA) cuando esos datos no se tienen a mano en el
-- momento — por ejemplo, activar una prueba gratis para que el cliente
-- pruebe el producto antes de formalizar el registro completo.
alter table public.clientes_pos
  alter column nit drop not null,
  alter column contacto drop not null,
  alter column telefono drop not null;
