/**
 * 🏢 A qué negocio pertenece una cuenta local de Electron.
 *
 * Causa raíz de "entré con Admin y me salió MEGA CAN": las cuentas locales
 * antiguas (el Admin de fábrica, cajeros creados antes de guardar
 * `clienteSupabaseId`) no dicen de qué negocio son, y el login las metía en
 * el negocio que quedó ABIERTO en el equipo, es decir, el último con el que
 * alguien entró. En un PC de soporte por el que pasan varios negocios eso
 * abre los datos de otro cliente.
 *
 * Orden para resolverlo, sin depender nunca del último negocio abierto:
 *  1. Lo que la propia cuenta dice (clienteSupabaseId, id o creador `lic_`).
 *  2. El negocio de quien la creó, siguiendo la cadena de creadores locales.
 *  3. El negocio original de la instalación (`codecpos_db_legacy_cliente_id`,
 *     el que tenía antes de que se abriera cualquier otro), porque toda
 *     cuenta sin negocio es anterior al cambio de negocios.
 */

export interface UsuarioLocalConNegocio {
  id: string;
  creadoPor?: string;
  clienteSupabaseId?: string;
}

function negocioPropio(usuario: UsuarioLocalConNegocio): string | undefined {
  const creadoPor = usuario.creadoPor || '';
  return usuario.clienteSupabaseId ||
    (usuario.id.startsWith('lic_') ? usuario.id.slice(4) : undefined) ||
    (creadoPor.startsWith('lic_') ? creadoPor.slice(4) : undefined);
}

export function negocioDeUsuarioLocal(
  usuario: UsuarioLocalConNegocio,
  usuarios: UsuarioLocalConNegocio[],
  negocioOriginal: string | null
): string | undefined {
  const vistos = new Set<string>();
  let actual: UsuarioLocalConNegocio | undefined = usuario;
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    const propio = negocioPropio(actual);
    if (propio) return propio;
    const creador = actual.creadoPor;
    actual = creador ? usuarios.find((u) => u.id === creador) : undefined;
  }
  return negocioOriginal || undefined;
}
