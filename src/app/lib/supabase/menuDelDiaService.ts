/**
 * Almuerzo del día (migración 0161).
 *
 * El administrador publica en la mañana las opciones (Sopa, Principio,
 * Proteína, Jugo…) y el precio. Se guarda en `menu_del_dia` (una fila por
 * negocio) y se mantiene un producto fijo «ALMUERZO DEL DÍA» en el menú de
 * mesas, con la descripción del día. Al pedirlo, el mesero elige una opción
 * de cada grupo y la elección viaja como nota a la estación.
 */
import { getSupabaseClient } from './config';

export const ALMUERZO_PRODUCTO_ID = 'almuerzo-del-dia';
const ALMUERZO_CATEGORIA_ID = 'cat-almuerzos';

export interface GrupoAlmuerzo {
  nombre: string;
  opciones: string[];
}

export interface MenuDelDia {
  fecha: string; // AAAA-MM-DD (hora de Colombia)
  grupos: GrupoAlmuerzo[];
  precio: number;
}

export const GRUPOS_SUGERIDOS: GrupoAlmuerzo[] = [
  { nombre: 'Sopa', opciones: [] },
  { nombre: 'Principio', opciones: [] },
  { nombre: 'Proteína', opciones: [] },
  { nombre: 'Acompañante', opciones: [] },
  { nombre: 'Jugo', opciones: [] },
];

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

/** Resumen corto del menú (va en la descripción del producto). */
export function resumenMenu(grupos: GrupoAlmuerzo[]): string {
  return grupos
    .filter((g) => g.opciones.length)
    .map((g) => `${g.nombre}: ${g.opciones.join(' o ')}`)
    .join(' · ')
    .slice(0, 480);
}

export async function obtenerMenuDelDia(clienteId: string): Promise<MenuDelDia | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const [menu, producto] = await Promise.all([
    client.from('menu_del_dia').select('fecha, grupos').eq('cliente_id', clienteId).maybeSingle(),
    client.from('panaderia_productos').select('precio').eq('cliente_id', clienteId).eq('local_id', ALMUERZO_PRODUCTO_ID).maybeSingle(),
  ]);
  if (menu.error || !menu.data) return null;
  return {
    fecha: String((menu.data as any).fecha || ''),
    grupos: limpiarGrupos((menu.data as any).grupos),
    precio: Number((producto.data as any)?.precio) || 0,
  };
}

/**
 * Publica el almuerzo de hoy: guarda las opciones y deja el producto
 * «ALMUERZO DEL DÍA» activo, con el precio y la descripción del día.
 */
export async function publicarMenuDelDia(clienteId: string, grupos: GrupoAlmuerzo[], precio: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const limpios = limpiarGrupos(grupos);
  const ahora = new Date().toISOString();

  const { error: errMenu } = await client.from('menu_del_dia').upsert({
    cliente_id: clienteId,
    fecha: hoyColombia(),
    producto_local_id: ALMUERZO_PRODUCTO_ID,
    grupos: limpios,
    updated_at: ahora,
  }, { onConflict: 'cliente_id' });
  if (errMenu) throw new Error(errMenu.message.includes('row-level security') ? 'Solo un administrador puede publicar el almuerzo.' : errMenu.message);

  const { error: errCat } = await client.from('panaderia_categorias').upsert({
    cliente_id: clienteId, local_id: ALMUERZO_CATEGORIA_ID, nombre: 'Almuerzos', icono: 'general', color: '#16a34a', orden: -1,
  }, { onConflict: 'cliente_id,local_id', ignoreDuplicates: true });
  if (errCat) throw new Error(errCat.message);

  const { error: errProd } = await client.from('panaderia_productos').upsert({
    cliente_id: clienteId,
    local_id: ALMUERZO_PRODUCTO_ID,
    categoria_local_id: ALMUERZO_CATEGORIA_ID,
    nombre: 'ALMUERZO DEL DÍA',
    codigo: 'ALMUERZO',
    precio: Math.max(0, Math.round(precio) || 0),
    costo: 0,
    stock: 0,
    icono: 'general',
    color: '#16a34a',
    tipo_inventario: 'directo',
    activo: true,
    descripcion: resumenMenu(limpios) || null,
    updated_at: ahora,
  }, { onConflict: 'cliente_id,local_id' });
  if (errProd) throw new Error(errProd.message);
}
