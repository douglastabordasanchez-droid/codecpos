/**
 * Catálogo del menú inferior de la PWA — compartido entre el editor del
 * Panel Desarrollador (Electron) y el renderizador real (BottomNav.tsx en
 * la PWA), para que ambos lados usen exactamente los mismos ids/etiquetas.
 *
 * "vender" (el botón central elevado) y "menu" (abre el panel lateral
 * completo) son especiales: no van a una ruta normal como los demás, así
 * que se resuelven aparte en BottomNav.tsx. "vender" además está fijo en
 * el centro — nunca es parte de la config de izquierda/derecha.
 */
import { ModuloPOS } from './permissions';

export type MenuInferiorItemId =
  | 'inicio'
  | 'ventas'
  | 'caja'
  | 'menu'
  | 'pagos'
  | 'panaderia'
  | 'taller'
  | 'inventario'
  | 'gastos'
  | 'devoluciones'
  | 'alertas'
  | 'perfil'
  | 'dashboard'
  | 'reportes'
  | 'codigos_barras'
  | 'promociones'
  | 'proveedores'
  | 'personal'
  | 'fidelizacion'
  | 'contabilidad'
  | 'multitienda'
  | 'artes_graficas'
  | 'papeleria_pinateria'
  | 'nuevo_producto';

export interface MenuInferiorConfig {
  izquierda: MenuInferiorItemId[];
  derecha: MenuInferiorItemId[];
}

export const MENU_INFERIOR_DEFAULT: MenuInferiorConfig = {
  izquierda: ['inicio', 'ventas'],
  derecha: ['caja', 'nuevo_producto'],
};

export interface MenuInferiorItemInfo {
  id: MenuInferiorItemId;
  label: string;
  to?: string; // ausente = acción especial (ej. "menu" abre el panel lateral)
  moduloRequerido?: ModuloPOS;
}

export const MENU_INFERIOR_CATALOGO: Record<MenuInferiorItemId, MenuInferiorItemInfo> = {
  inicio:       { id: 'inicio',       label: 'Inicio',           to: '/' },
  ventas:       { id: 'ventas',       label: 'Ventas',           to: '/ventas' },
  caja:         { id: 'caja',         label: 'Caja',             to: '/caja',         moduloRequerido: ModuloPOS.CIERRE_CAJA },
  menu:         { id: 'menu',         label: 'Menú' },
  pagos:        { id: 'pagos',        label: 'Pagos',            to: '/pagos',        moduloRequerido: ModuloPOS.CODEC_VERIFY },
  panaderia:    { id: 'panaderia',    label: 'Alim. y Bebidas',  to: '/panaderia',    moduloRequerido: ModuloPOS.PANADERIA_ONCES },
  taller:       { id: 'taller',       label: 'Taller',           to: '/taller',       moduloRequerido: ModuloPOS.TALLER_REPARACIONES },
  inventario:   { id: 'inventario',   label: 'Inventario',       to: '/inventario',   moduloRequerido: ModuloPOS.PRODUCTOS },
  gastos:       { id: 'gastos',       label: 'Gastos',           to: '/gastos',       moduloRequerido: ModuloPOS.GASTOS },
  devoluciones: { id: 'devoluciones', label: 'Devoluciones',     to: '/devoluciones', moduloRequerido: ModuloPOS.DEVOLUCIONES },
  alertas:      { id: 'alertas',      label: 'Alertas',          to: '/alertas' },
  perfil:       { id: 'perfil',       label: 'Perfil',           to: '/perfil' },
  dashboard:    { id: 'dashboard',    label: 'Dashboard',        to: '/dashboard',    moduloRequerido: ModuloPOS.DASHBOARD },
  reportes:     { id: 'reportes',     label: 'Reportes',         to: '/reportes',     moduloRequerido: ModuloPOS.REPORTES },
  codigos_barras: { id: 'codigos_barras', label: 'Cód. Barras',  to: '/codigos-barras', moduloRequerido: ModuloPOS.CODIGOS_BARRAS },
  promociones:  { id: 'promociones',  label: 'Promociones',      to: '/promociones',  moduloRequerido: ModuloPOS.PROMOCIONES },
  proveedores:  { id: 'proveedores',  label: 'Proveedores',      to: '/proveedores',  moduloRequerido: ModuloPOS.PROVEEDORES },
  personal:     { id: 'personal',     label: 'Personal',         to: '/personal',     moduloRequerido: ModuloPOS.USUARIOS },
  fidelizacion: { id: 'fidelizacion', label: 'Fidelización',     to: '/fidelizacion', moduloRequerido: ModuloPOS.FIDELIZACION },
  contabilidad: { id: 'contabilidad', label: 'Contabilidad',     to: '/contabilidad', moduloRequerido: ModuloPOS.CONTABILIDAD },
  multitienda:  { id: 'multitienda',  label: 'Multi-Tienda',     to: '/multitienda',  moduloRequerido: ModuloPOS.MULTITIENDA },
  artes_graficas: { id: 'artes_graficas', label: 'Artes Gráf.',  to: '/artes-graficas', moduloRequerido: ModuloPOS.ARTES_GRAFICAS },
  papeleria_pinateria: { id: 'papeleria_pinateria', label: 'Piñatería', to: '/papeleria-pinateria', moduloRequerido: ModuloPOS.PAPELERIA_PINATERIA },
  nuevo_producto: { id: 'nuevo_producto', label: 'Producto', to: '/inventario/nuevo', moduloRequerido: ModuloPOS.PRODUCTOS },
};

/** Ids elegibles para los slots de izquierda/derecha (todo el catálogo menos "vender", que ni siquiera vive aquí). */
export const MENU_INFERIOR_IDS = Object.keys(MENU_INFERIOR_CATALOGO) as MenuInferiorItemId[];

export function normalizarMenuInferior(raw: unknown): MenuInferiorConfig {
  const config = raw as Partial<MenuInferiorConfig> | null | undefined;
  const limpiar = (ids: unknown, fallback: MenuInferiorItemId[]): MenuInferiorItemId[] => {
    if (!Array.isArray(ids)) return fallback;
    const validos = ids.filter((id): id is MenuInferiorItemId => typeof id === 'string' && id in MENU_INFERIOR_CATALOGO);
    return validos.length > 0 ? validos : fallback;
  };
  return {
    izquierda: limpiar(config?.izquierda, MENU_INFERIOR_DEFAULT.izquierda),
    derecha: limpiar(config?.derecha, MENU_INFERIOR_DEFAULT.derecha),
  };
}
