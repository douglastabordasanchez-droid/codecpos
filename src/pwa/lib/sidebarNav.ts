/**
 * Catálogo ÚNICO del menú lateral de la web y del celular.
 *
 * Antes había dos listas: la del computador (DesktopLayout) y la del celular
 * (SideMenu), y se habían separado — el menú de computador ni siquiera
 * mostraba Dashboard, Contabilidad, Taller o Proveedores. Ahora los dos
 * dibujan esta misma lista, con las mismas preferencias del usuario (orden,
 * ocultos y nombres propios: ver preferenciasMenu.ts).
 */
import {
  Home, ShoppingCart, Receipt, Package, Lock, Wallet, RotateCcw, ScanLine,
  DollarSign, Bell, Settings, ShieldAlert, Wrench, Coffee, Palette, PartyPopper, CreditCard,
  FileBarChart, ReceiptText, LayoutDashboard, Calculator, Barcode, Tag, Truck, Users, Award, Store, PawPrint, User,
} from 'lucide-react';
import { ModuloPOS } from '../../app/lib/permissions';

export type GrupoNav = 'principal' | 'modulos' | 'analisis' | 'herramientas' | 'administracion' | 'plataforma';

export interface ItemNavSidebar {
  icon: any;
  label: string;
  subtitulo?: string;
  path: string;
  grupo: GrupoNav;
  modulo?: ModuloPOS;
  /** El módulo se vende aparte: no aparece hasta confirmar la licencia (ver tieneModuloDePago). */
  dePago?: boolean;
  soloAdmin?: boolean;
  soloStaff?: boolean;
  end?: boolean;
  /** No se puede ocultar (sin él la persona se quedaría sin salida). */
  fijo?: boolean;
  /** Solo en el menú del celular (en computador ya está en el pie del menú). */
  soloMovil?: boolean;
}

export const GRUPOS_NAV: Array<{ id: GrupoNav; titulo: string | null; destacado?: boolean }> = [
  { id: 'principal', titulo: null },
  { id: 'modulos', titulo: 'Módulos' },
  { id: 'analisis', titulo: 'Análisis' },
  { id: 'herramientas', titulo: 'Herramientas' },
  { id: 'administracion', titulo: 'Administración', destacado: true },
  { id: 'plataforma', titulo: 'Plataforma', destacado: true },
];

export const NAV_TODOS: ItemNavSidebar[] = [
  { grupo: 'principal', icon: Home, label: 'Inicio', path: '/', end: true, fijo: true },
  { grupo: 'principal', icon: User, label: 'Mi perfil', path: '/perfil', fijo: true, soloMovil: true },
  { grupo: 'principal', icon: ShoppingCart, label: 'Vender', subtitulo: 'Punto de venta', path: '/vender', modulo: ModuloPOS.PUNTO_DE_VENTA },
  { grupo: 'principal', icon: Receipt, label: 'Ventas', subtitulo: 'Historial y estadísticas del día', path: '/ventas' },
  { grupo: 'principal', icon: Package, label: 'Inventario', subtitulo: 'Productos, stock y fotos', path: '/inventario', modulo: ModuloPOS.PRODUCTOS },

  // Módulos completos del negocio: para el mesero o el técnico, ESTA es su pantalla de trabajo.
  { grupo: 'modulos', icon: Coffee, label: 'Alimentos y Bebidas', subtitulo: 'Mesas, comandas y pedidos del salón', path: '/panaderia', modulo: ModuloPOS.PANADERIA_ONCES },
  { grupo: 'modulos', icon: PawPrint, label: 'Veterinaria y Mascotas', subtitulo: 'Granel con báscula, estética y farmacia', path: '/veterinaria', modulo: ModuloPOS.VETERINARIA },
  { grupo: 'modulos', icon: Wrench, label: 'Taller', subtitulo: 'Órdenes de reparación y estados', path: '/taller', modulo: ModuloPOS.TALLER_REPARACIONES },
  { grupo: 'modulos', icon: Palette, label: 'Artes Gráficas', subtitulo: 'Catálogo por escalas y facturas dinámicas', path: '/artes-graficas', modulo: ModuloPOS.ARTES_GRAFICAS },
  { grupo: 'modulos', icon: PartyPopper, label: 'Papelería y Piñatería', subtitulo: 'Globos, dulcería, juguetería y fiestas', path: '/papeleria-pinateria', modulo: ModuloPOS.PAPELERIA_PINATERIA },
  { grupo: 'modulos', icon: Tag, label: 'Promociones', subtitulo: 'Descuentos y combos vigentes', path: '/promociones', modulo: ModuloPOS.PROMOCIONES },
  { grupo: 'modulos', icon: Truck, label: 'Proveedores', subtitulo: 'Contacto y saldo pendiente', path: '/proveedores', modulo: ModuloPOS.PROVEEDORES },
  { grupo: 'modulos', icon: Store, label: 'Multi-Tienda', subtitulo: 'Directorio de sucursales', path: '/multitienda', modulo: ModuloPOS.MULTITIENDA },

  { grupo: 'analisis', icon: LayoutDashboard, label: 'Dashboard', subtitulo: 'Ventas, utilidad y tendencia', path: '/dashboard', modulo: ModuloPOS.DASHBOARD },
  { grupo: 'analisis', icon: FileBarChart, label: 'Reportes', subtitulo: 'Ventas, cajeros, inventario, gastos y financiero', path: '/reportes', modulo: ModuloPOS.REPORTES },
  { grupo: 'analisis', icon: Calculator, label: 'Contabilidad', subtitulo: 'Resumen, cartera, rentabilidad y flujo de caja', path: '/contabilidad', modulo: ModuloPOS.CONTABILIDAD },
  { grupo: 'analisis', icon: ReceiptText, label: 'Facturación', subtitulo: 'Facturas electrónicas y causación de XML', path: '/facturacion', modulo: ModuloPOS.FACTURACION_DIAN, dePago: true, soloAdmin: true },

  { grupo: 'herramientas', icon: Lock, label: 'Caja', subtitulo: 'Apertura, arqueo, movimientos y cierre', path: '/caja', modulo: ModuloPOS.CIERRE_CAJA },
  { grupo: 'herramientas', icon: Wallet, label: 'Gastos', subtitulo: 'Gastos operativos registrados', path: '/gastos', modulo: ModuloPOS.GASTOS },
  { grupo: 'herramientas', icon: RotateCcw, label: 'Devoluciones', subtitulo: 'Procesar devolución de una venta', path: '/devoluciones', modulo: ModuloPOS.DEVOLUCIONES },
  { grupo: 'herramientas', icon: CreditCard, label: 'Cartera', subtitulo: 'Ventas a crédito y abonos', path: '/cartera', modulo: ModuloPOS.PUNTO_DE_VENTA },
  { grupo: 'herramientas', icon: ScanLine, label: 'Escáner', subtitulo: 'Buscar producto por código de barras', path: '/escaner', modulo: ModuloPOS.PRODUCTOS },
  { grupo: 'herramientas', icon: Barcode, label: 'Códigos de Barras', subtitulo: 'Generar y asignar códigos a productos', path: '/codigos-barras', modulo: ModuloPOS.CODIGOS_BARRAS },
  { grupo: 'herramientas', icon: DollarSign, label: 'Pagos', subtitulo: 'Pagos verificados por Codec Verify', path: '/pagos', modulo: ModuloPOS.CODEC_VERIFY },
  { grupo: 'herramientas', icon: Award, label: 'Fidelización', subtitulo: 'Consultar puntos de un cliente', path: '/fidelizacion', modulo: ModuloPOS.FIDELIZACION },
  { grupo: 'herramientas', icon: Bell, label: 'Alertas', subtitulo: 'Stock bajo y avisos', path: '/alertas' },

  { grupo: 'administracion', icon: Users, label: 'Personal', subtitulo: 'Equipo con acceso a la app', path: '/personal', soloAdmin: true, modulo: ModuloPOS.USUARIOS },
  { grupo: 'administracion', icon: Settings, label: 'Configuración', subtitulo: 'Datos del negocio y módulos', path: '/configuracion', soloAdmin: true, fijo: true },

  { grupo: 'plataforma', icon: ShieldAlert, label: 'Panel Desarrollador', subtitulo: 'Administra todos los negocios', path: '/desarrollador', soloStaff: true, fijo: true },
];
