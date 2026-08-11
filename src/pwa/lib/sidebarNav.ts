import {
  Home, ShoppingCart, Receipt, Package, Lock, Wallet, RotateCcw, ScanLine,
  DollarSign, Bell, Settings, ShieldAlert, Wrench, Coffee,
} from 'lucide-react';
import { ModuloPOS } from '../../app/lib/permissions';

export interface ItemNavSidebar {
  icon: any;
  label: string;
  path: string;
  modulo?: ModuloPOS;
  soloAdmin?: boolean;
  soloStaff?: boolean;
  end?: boolean;
  fijo?: boolean;
}

export const NAV_PRINCIPAL: ItemNavSidebar[] = [
  { icon: Home, label: 'Inicio', path: '/', end: true, fijo: true },
  { icon: ShoppingCart, label: 'Vender', path: '/vender', modulo: ModuloPOS.PUNTO_DE_VENTA },
  { icon: Receipt, label: 'Ventas', path: '/ventas' },
  { icon: Package, label: 'Inventario', path: '/inventario', modulo: ModuloPOS.PRODUCTOS },
];

/**
 * Módulos operativos que se activan desde Electron (Configuración → Módulos en
 * la App Web). Van en su propio grupo porque no son "herramientas" del cajero:
 * son áreas completas del negocio, y para el mesero o el técnico ESTA es su
 * pantalla principal.
 */
export const NAV_MODULOS: ItemNavSidebar[] = [
  { icon: Coffee, label: 'Panadería y Onces', path: '/panaderia', modulo: ModuloPOS.PANADERIA_ONCES },
  { icon: Wrench, label: 'Taller', path: '/taller', modulo: ModuloPOS.TALLER_REPARACIONES },
];

export const NAV_HERRAMIENTAS: ItemNavSidebar[] = [
  { icon: Lock, label: 'Caja', path: '/caja', modulo: ModuloPOS.CIERRE_CAJA },
  { icon: Wallet, label: 'Gastos', path: '/gastos', modulo: ModuloPOS.GASTOS },
  { icon: RotateCcw, label: 'Devoluciones', path: '/devoluciones', modulo: ModuloPOS.DEVOLUCIONES },
  { icon: ScanLine, label: 'Escáner', path: '/escaner', modulo: ModuloPOS.PRODUCTOS },
  { icon: DollarSign, label: 'Pagos', path: '/pagos', modulo: ModuloPOS.CODEC_VERIFY },
  { icon: Bell, label: 'Alertas', path: '/alertas' },
];

export const NAV_ADMINISTRACION: ItemNavSidebar[] = [
  { icon: Settings, label: 'Configuración', path: '/configuracion', soloAdmin: true, fijo: true },
];

export const NAV_PLATAFORMA: ItemNavSidebar[] = [
  { icon: ShieldAlert, label: 'Panel Desarrollador', path: '/desarrollador', soloStaff: true, fijo: true },
];

export const NAV_TODOS: ItemNavSidebar[] = [
  ...NAV_PRINCIPAL,
  ...NAV_MODULOS,
  ...NAV_HERRAMIENTAS,
  ...NAV_ADMINISTRACION,
  ...NAV_PLATAFORMA,
];
