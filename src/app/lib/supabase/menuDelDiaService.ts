/**
 * Almuerzo del día (migraciones 0161 y 0162).
 *
 * El administrador, o quien él autorice (editores), publica en la mañana las
 * opciones (Sopa, Principio, Proteína, Jugo…), el precio y los adicionales con
 * precio. Se guarda en `menu_del_dia` (una fila por negocio) y se mantienen en
 * el menú de mesas el producto fijo «ALMUERZO DEL DÍA» y un producto por cada
 * adicional («ADICIONAL DE HUEVO»…), todos en la categoría Almuerzos. Al
 * pedirlo, el mesero elige una opción de cada grupo (va como nota a la
 * estación) y los adicionales se suman a la cuenta.
 */
import { getSupabaseClient } from './config';

export const ALMUERZO_PRODUCTO_ID = 'almuerzo-del-dia';
/** Prefijo de todo lo que maneja el almuerzo del día: las cajas no lo suben ni lo borran. */
export const PREFIJO_ALMUERZO = 'almuerzo-';
const ALMUERZO_CATEGORIA_ID = 'cat-almuerzos';

export interface GrupoAlmuerzo {
  nombre: string;
  opciones: string[];
}

export interface AdicionalAlmuerzo {
  nombre: string;
  precio: number;
}

/** Menú guardado de un día de la semana (0163). */
export interface MenuGuardado {
  fecha: string;
  precio: number;
  grupos: GrupoAlmuerzo[];
  adicionales: AdicionalAlmuerzo[];
}

export interface MenuDelDia {
  fecha: string; // AAAA-MM-DD (hora de Colombia)
  grupos: GrupoAlmuerzo[];
  adicionales: AdicionalAlmuerzo[];
  editores: string[];
  precio: number;
  /** Último menú publicado cada día de la semana: «0» domingo … «6» sábado. */
  porDia: Record<string, MenuGuardado>;
}

export const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Día de la semana de hoy en Colombia (0 = domingo). */
export function diaSemanaColombia(): number {
  const [a, m, d] = hoyColombia().split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function limpiarPorDia(valor: unknown): Record<string, MenuGuardado> {
  if (!valor || typeof valor !== 'object') return {};
  const salida: Record<string, MenuGuardado> = {};
  for (const [dia, m] of Object.entries(valor as Record<string, any>)) {
    if (!/^[0-6]$/.test(dia) || !m) continue;
    const grupos = limpiarGrupos(m.grupos);
    if (!grupos.some((g) => g.opciones.length)) continue;
    salida[dia] = { fecha: String(m.fecha || ''), precio: Math.max(0, Number(m.precio) || 0), grupos, adicionales: limpiarAdicionales(m.adicionales) };
  }
  return salida;
}

export const GRUPOS_SUGERIDOS: GrupoAlmuerzo[] = [
  { nombre: 'Sopa', opciones: [] },
  { nombre: 'Principio', opciones: [] },
  { nombre: 'Proteína', opciones: [] },
  { nombre: 'Acompañante', opciones: [] },
  { nombre: 'Ensalada', opciones: [] },
  { nombre: 'Jugo', opciones: [] },
];

export const ADICIONALES_SUGERIDOS = ['Arroz', 'Huevo', 'Maduro', 'Papa', 'Carne', 'Jugo'];

/** Fecha de hoy en Colombia (AAAA-MM-DD). */
export function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function limpiarGrupos(grupos: unknown): GrupoAlmuerzo[] {
  if (!Array.isArray(grupos)) return [];
  return grupos
    .map((g: any) => ({
      nombre: String(g?.nombre || '').trim().slice(0, 40),
      opciones: (Array.isArray(g?.opciones) ? g.opciones : [])
        .map((o: unknown) => String(o || '').trim().slice(0, 60))
        .filter(Boolean),
    }))
    .filter((g) => g.nombre);
}

function limpiarAdicionales(lista: unknown): AdicionalAlmuerzo[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  return lista
    .map((a: any) => ({ nombre: String(a?.nombre || '').trim().slice(0, 40), precio: Math.max(0, Math.round(Number(a?.precio) || 0)) }))
    .filter((a) => a.nombre && a.precio > 0 && !vistos.has(a.nombre.toLowerCase()) && vistos.add(a.nombre.toLowerCase()));
}

/** «Huevo» → «ADICIONAL DE HUEVO»; si ya dice «adicional», se respeta. */
export function nombreProductoAdicional(nombre: string): string {
  const limpio = nombre.trim();
  return (/^adicional/i.test(limpio) ? limpio : `Adicional de ${limpio}`).toUpperCase();
}

/** Id fijo del producto de un adicional (mismo nombre = mismo producto todos los días). */
export function idProductoAdicional(nombre: string): string {
  const slug = nombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/^adicional( de)?\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${PREFIJO_ALMUERZO}adicional-${slug || 'otro'}`;
}

/** Resumen corto del menú (va en la descripción del producto). */
export function resumenMenu(grupos: GrupoAlmuerzo[]): string {
  return grupos
    .filter((g) => g.opciones.length)
    .map((g) => `${g.nombre}: ${g.opciones.join(' o ')}`)
    .join(' · ')
    .slice(0, 480);
}

export function puedePublicarAlmuerzo(menu: MenuDelDia | null, empleado: { id: string; rol: string } | null | undefined): boolean {
  if (!empleado) return false;
  if (['admin', 'super_usuario'].includes(empleado.rol)) return true;
  return !!menu?.editores.includes(empleado.id);
}

export async function obtenerMenuDelDia(clienteId: string): Promise<MenuDelDia | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const [negocio, menu, producto] = await Promise.all([
    client.from('clientes_pos').select('almuerzo_activo').eq('id', clienteId).maybeSingle(),
    client.from('menu_del_dia').select('fecha, grupos, adicionales, editores, por_dia').eq('cliente_id', clienteId).maybeSingle(),
    client.from('panaderia_productos').select('precio').eq('cliente_id', clienteId).eq('local_id', ALMUERZO_PRODUCTO_ID).maybeSingle(),
  ]);
  // Solo en los negocios donde Codec Studio activó el almuerzo del día (0165).
  if (!(negocio.data as { almuerzo_activo?: boolean } | null)?.almuerzo_activo) return null;
  if (menu.error) return null;
  // Activado pero sin publicar todavía: menú vacío para que el administrador lo publique.
  const fila = (menu.data || { fecha: '', grupos: [], adicionales: [], editores: [], por_dia: {} }) as any;
  return {
    fecha: String(fila.fecha || ''),
    grupos: limpiarGrupos(fila.grupos),
    adicionales: limpiarAdicionales(fila.adicionales),
    editores: Array.isArray(fila.editores) ? fila.editores.map(String) : [],
    precio: Number((producto.data as any)?.precio) || 0,
    porDia: limpiarPorDia(fila.por_dia),
  };
}

/**
 * Publica el almuerzo de hoy: guarda opciones y adicionales y deja activos en
 * el menú el producto «ALMUERZO DEL DÍA» y uno por adicional (los que se
 * quitaron quedan inactivos).
 */
export async function publicarMenuDelDia(
  clienteId: string, grupos: GrupoAlmuerzo[], precio: number, adicionales: AdicionalAlmuerzo[] = [],
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const limpios = limpiarGrupos(grupos);
  const extras = limpiarAdicionales(adicionales);
  const ahora = new Date().toISOString();
  // También queda como el menú de este día de la semana, para el próximo.
  const { data: actual } = await client.from('menu_del_dia').select('por_dia').eq('cliente_id', clienteId).maybeSingle();
  const previo = (actual as any)?.por_dia;
  const porDia = {
    ...(previo && typeof previo === 'object' ? previo : {}),
    [String(diaSemanaColombia())]: { fecha: hoyColombia(), precio: Math.max(0, Math.round(precio) || 0), grupos: limpios, adicionales: extras },
  };
  const fila = { fecha: hoyColombia(), producto_local_id: ALMUERZO_PRODUCTO_ID, grupos: limpios, adicionales: extras, por_dia: porDia, updated_at: ahora };

  // Si ya existe se actualiza (así también puede publicar quien tiene permiso sin
  // ser administrador); si no existe, la crea el administrador.
  const actualizado = await client.from('menu_del_dia').update(fila).eq('cliente_id', clienteId).select('cliente_id');
  if (actualizado.error) throw new Error(actualizado.error.message);
  if (!actualizado.data?.length) {
    const { error } = await client.from('menu_del_dia').insert({ cliente_id: clienteId, ...fila });
    if (error) throw new Error(error.message.includes('row-level security') ? 'No tienes permiso para publicar el almuerzo.' : error.message);
  }

  const { error: errCat } = await client.from('panaderia_categorias').upsert({
    cliente_id: clienteId, local_id: ALMUERZO_CATEGORIA_ID, nombre: 'Almuerzos', icono: 'general', color: '#16a34a', orden: -1,
  }, { onConflict: 'cliente_id,local_id', ignoreDuplicates: true });
  if (errCat) throw new Error(errCat.message);

  const base = {
    cliente_id: clienteId, categoria_local_id: ALMUERZO_CATEGORIA_ID, costo: 0, stock: 0,
    icono: 'general', color: '#16a34a', tipo_inventario: 'directo', activo: true, updated_at: ahora,
  };
  const productos = [
    { ...base, local_id: ALMUERZO_PRODUCTO_ID, nombre: 'ALMUERZO DEL DÍA', codigo: 'ALMUERZO', precio: Math.max(0, Math.round(precio) || 0), descripcion: resumenMenu(limpios) || null },
    ...extras.map((a) => ({ ...base, local_id: idProductoAdicional(a.nombre), nombre: nombreProductoAdicional(a.nombre), codigo: null, precio: a.precio, descripcion: 'Adicional del almuerzo' })),
  ];
  const { error: errProd } = await client.from('panaderia_productos').upsert(productos, { onConflict: 'cliente_id,local_id' });
  if (errProd) throw new Error(errProd.message);

  // Adicionales que ya no se ofrecen: quedan inactivos (no se borran por si alguna cuenta los tiene).
  const vigentes = new Set(productos.map((p) => p.local_id));
  const { data: anteriores } = await client.from('panaderia_productos').select('local_id')
    .eq('cliente_id', clienteId).eq('activo', true).like('local_id', `${PREFIJO_ALMUERZO}adicional-%`);
  const quitar = (anteriores || []).map((r: any) => String(r.local_id)).filter((id) => !vigentes.has(id));
  if (quitar.length) {
    await client.from('panaderia_productos').update({ activo: false, updated_at: ahora }).eq('cliente_id', clienteId).in('local_id', quitar);
  }
}

/** Solo un administrador: quién más (además de los administradores) publica el almuerzo. */
export async function guardarEditoresAlmuerzo(clienteId: string, editores: string[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { data, error } = await client.from('menu_del_dia').update({ editores }).eq('cliente_id', clienteId).select('cliente_id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    const { error: e2 } = await client.from('menu_del_dia').insert({ cliente_id: clienteId, editores });
    if (e2) throw new Error(e2.message);
  }
}

/** Empleados que pueden recibir el permiso (los administradores ya lo tienen). */
export async function listarEmpleadosParaAlmuerzo(clienteId: string): Promise<Array<{ id: string; nombre: string; rol: string }>> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client.from('empleados').select('id, nombre_completo, rol, activo')
    .eq('cliente_id', clienteId).eq('activo', true).not('rol', 'in', '(admin,super_usuario)').order('nombre_completo');
  return (data || []).map((e: any) => ({ id: String(e.id), nombre: String(e.nombre_completo || ''), rol: String(e.rol || '') }));
}
