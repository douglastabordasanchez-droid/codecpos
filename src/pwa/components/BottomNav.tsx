import { useState } from 'react';
import { NavLink } from 'react-router';
import { toast } from 'sonner';
import { Home, Receipt, DollarSign, Bell, Coffee, Wrench, Lock, Package, User, Wallet, RotateCcw, Menu as MenuIcon, LayoutDashboard, FileBarChart, Barcode, Tag, Truck, Users, Award, Calculator, Store, Palette, PartyPopper, PackagePlus, type LucideIcon } from 'lucide-react';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { MENU_INFERIOR_CATALOGO, type MenuInferiorItemId } from '../../app/lib/menuInferiorCatalogo';
import { ModuloPOS } from '../../app/lib/permissions';
import { SideMenu } from './SideMenu';
import logo from '/logo.png';

const ICONOS: Record<MenuInferiorItemId, LucideIcon> = {
  inicio: Home,
  ventas: Receipt,
  caja: Lock,
  menu: MenuIcon,
  pagos: DollarSign,
  panaderia: Coffee,
  taller: Wrench,
  inventario: Package,
  gastos: Wallet,
  devoluciones: RotateCcw,
  alertas: Bell,
  perfil: User,
  dashboard: LayoutDashboard,
  reportes: FileBarChart,
  codigos_barras: Barcode,
  promociones: Tag,
  proveedores: Truck,
  personal: Users,
  fidelizacion: Award,
  contabilidad: Calculator,
  multitienda: Store,
  artes_graficas: Palette,
  papeleria_pinateria: PartyPopper,
  nuevo_producto: PackagePlus,
};

/**
 * Navegación inferior con el botón CODEC elevado al centro (Vender/Caja,
 * fijo — nunca configurable). Los otros 4 botones (2 izquierda + 2 derecha)
 * salen de `menuInferior` (clientes_pos.menu_inferior) — configuración que
 * solo el staff de Codec Studio edita desde Panel Desarrollador (ver
 * menuInferiorCatalogo.ts). Un ítem que requiera un módulo que el negocio ya
 * no tiene activo se omite en caliente, sin esperar a que el admin corrija
 * la config.
 */
export function BottomNav() {
  const { tieneModulo, menuInferior } = useModulosActivos();
  const { soloLectura, tiendaActiva } = usePwaAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const resolverLado = (ids: MenuInferiorItemId[]) =>
    ids
      .map((id) => MENU_INFERIOR_CATALOGO[id])
      .filter((item) => item && (!item.moduloRequerido || tieneModulo(item.moduloRequerido)));

  const izquierda = resolverLado(menuInferior.izquierda);
  const derechaConfigurada = resolverLado(menuInferior.derecha);
  const derecha = derechaConfigurada.some((item) => item.id === 'nuevo_producto') || !tieneModulo(ModuloPOS.PRODUCTOS)
    ? derechaConfigurada
    : [...derechaConfigurada, MENU_INFERIOR_CATALOGO.nuevo_producto];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 py-3 px-2 min-w-0 flex-1 ${isActive ? 'text-amber-400' : 'text-slate-500'}`;

  const renderItem = (item: (typeof izquierda)[number]) => {
    const Icon = ICONOS[item.id];
    if (item.id === 'menu') {
      return (
        <button key={item.id} onClick={() => setMenuAbierto(true)} className={`flex flex-col items-center gap-1 py-3 px-2 min-w-0 flex-1 text-slate-500`}>
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-[9px] font-semibold truncate max-w-full">{item.label}</span>
        </button>
      );
    }
    return (
      <NavLink key={item.id} to={item.to!} end={item.id === 'inicio'} className={linkClass}>
        <Icon className="w-5 h-5 shrink-0" />
        <span className="text-[9px] font-semibold truncate max-w-full">{item.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 w-full bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {izquierda.map(renderItem)}

        {soloLectura ? (
          // 👁️ Viendo una tienda vinculada (no la propia) — vender queda
          // deshabilitado en la UI. El servidor también lo rechazaría (RLS,
          // ver migración 0045), pero esto evita el error críptico y explica
          // por qué de una vez.
          <button
            type="button"
            onClick={() => toast.info(`Estás viendo ${tiendaActiva?.nombreNegocio} en modo solo lectura — cambia a tu tienda para vender`)}
            className="flex flex-col items-center flex-1 -mt-7"
          >
            <div className="w-14 h-14 rounded-2xl bg-slate-700 flex items-center justify-center shadow-lg border-4 border-slate-950 opacity-60">
              <img src={logo} alt="CODEC" className="w-8 h-8 object-contain grayscale" />
            </div>
            <span className="text-[9px] font-bold mt-1 text-slate-500">Vender</span>
          </button>
        ) : (
          <NavLink to="/vender" className="flex flex-col items-center flex-1 -mt-7">
            {({ isActive }) => (
              <>
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/40 border-4 border-slate-950 transition-transform ${
                    isActive ? 'scale-105' : ''
                  }`}
                >
                  <img src={logo} alt="CODEC" className="w-8 h-8 object-contain" />
                </div>
                <span className={`text-[9px] font-bold mt-1 ${isActive ? 'text-amber-400' : 'text-slate-400'}`}>Vender</span>
              </>
            )}
          </NavLink>
        )}

        {derecha.map(renderItem)}
      </nav>

      <SideMenu open={menuAbierto} onClose={() => setMenuAbierto(false)} />
    </>
  );
}
