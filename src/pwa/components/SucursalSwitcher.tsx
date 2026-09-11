import { useEffect, useState } from 'react';
import { Building2, QrCode, X } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { getSucursalActiva, setSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';
import { EscanerTiendaQR, type QRPayloadTienda } from './EscanerTiendaQR';
import { toast } from 'sonner';

/**
 * Conexión de sucursal — complementa el login (usuario/contraseña dice
 * QUIÉN eres; esto dice DÓNDE estás parado ahora mismo):
 *
 *   • Empleado operativo con sucursal fija (`empleado.tienda_id`, asignada
 *     por un admin en Personal — migración 0092): no ve este control, su
 *     sucursal ya viene dada, no elige.
 *   • Admin/dueño: ve un botón para escanear el QR de la sucursal en la que
 *     está físicamente parado (generado en Electron > Multi-Tienda, y ahora
 *     también accesible directo desde Punto de Venta). Un solo QR = una
 *     sola sucursal, conexión directa uno a uno — no hay una lista para
 *     elegir a mano. El resultado queda guardado en este dispositivo
 *     (sucursalActiva.ts) y de inmediato filtra Vender, Inventario y
 *     Alimentos y Bebidas (mesas) por igual.
 *
 * `variant="bottomnav"` lo dibuja como ícono+etiqueta diminuta, igual que
 * los demás botones de la barra inferior — reemplaza a "Caja" SOLO para el
 * admin (un cajero sigue viendo Caja ahí, la necesita para su turno; el
 * admin la sigue teniendo en el menú lateral).
 */
export function SucursalSwitcher({ variant = 'topbar' }: { variant?: 'topbar' | 'bottomnav' }) {
  const { empleado } = usePwaAuth();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [sucursal, setSucursalLocal] = useState(getSucursalActiva());
  const [escaneando, setEscaneando] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => suscribirSucursalActiva(() => setSucursalLocal(getSucursalActiva())), []);

  if (!esAdmin) return null;

  const onResultado = (payload: QRPayloadTienda) => {
    setSucursalActiva({ id: payload.tienda_id, nombre: payload.tienda_nombre });
    setEscaneando(false);
    toast.success(`Conectado a "${payload.tienda_nombre}"`, { description: 'Vender, Inventario y Alimentos y Bebidas ahora muestran solo esta sucursal.' });
  };

  const desconectar = () => {
    setSucursalActiva(null);
    setMenuAbierto(false);
    toast.info('Viendo todas las sucursales de nuevo');
  };

  if (escaneando) {
    return (
      <EscanerTiendaQR
        clienteIdEsperado={empleado.cliente_id}
        titulo="Escanear QR de sucursal"
        subtitulo="Conecta este celular a la sucursal donde estás"
        onResultado={onResultado}
        onCerrar={() => setEscaneando(false)}
      />
    );
  }

  if (variant === 'bottomnav') {
    return (
      <div className="relative flex-1 min-w-0">
        <button
          onClick={() => (sucursal ? setMenuAbierto((v) => !v) : setEscaneando(true))}
          className={`w-full flex flex-col items-center gap-1 py-3 px-2 min-w-0 ${sucursal ? 'text-emerald-400' : 'text-slate-500'}`}
        >
          {sucursal ? <Building2 className="w-5 h-5 shrink-0" /> : <QrCode className="w-5 h-5 shrink-0" />}
          <span className="text-[9px] font-semibold truncate max-w-full">{sucursal ? sucursal.nombre : 'Sucursal'}</span>
        </button>

        {menuAbierto && sucursal && (
          <div className="absolute bottom-full right-0 mb-1.5 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden z-40">
            <div className="px-3 py-2 border-b border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Sucursal conectada</p>
              <p className="text-sm font-bold text-white truncate">{sucursal.nombre}</p>
            </div>
            <button
              onClick={() => { setMenuAbierto(false); setEscaneando(true); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 active:bg-slate-800"
            >
              <QrCode className="w-4 h-4 shrink-0" /> Escanear otra sucursal
            </button>
            <button
              onClick={desconectar}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 active:bg-slate-800"
            >
              <X className="w-4 h-4 shrink-0" /> Ver todas las sucursales
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => (sucursal ? setMenuAbierto((v) => !v) : setEscaneando(true))}
        className={`flex items-center gap-1.5 max-w-[150px] px-2 py-1.5 rounded-lg active:bg-slate-900 ${sucursal ? 'text-emerald-400' : 'text-slate-400'}`}
        title={sucursal ? `Conectado a ${sucursal.nombre}` : 'Escanear QR de sucursal'}
      >
        {sucursal ? <Building2 className="w-4 h-4 shrink-0" /> : <QrCode className="w-4 h-4 shrink-0" />}
        <span className="text-xs font-bold truncate">{sucursal ? sucursal.nombre : 'Conectar sucursal'}</span>
      </button>

      {menuAbierto && sucursal && (
        <div className="absolute top-full right-0 mt-1.5 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden z-40">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Sucursal conectada</p>
            <p className="text-sm font-bold text-white truncate">{sucursal.nombre}</p>
          </div>
          <button
            onClick={() => { setMenuAbierto(false); setEscaneando(true); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 active:bg-slate-800"
          >
            <QrCode className="w-4 h-4 shrink-0" /> Escanear otra sucursal
          </button>
          <button
            onClick={desconectar}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 active:bg-slate-800"
          >
            <X className="w-4 h-4 shrink-0" /> Ver todas las sucursales
          </button>
        </div>
      )}
    </div>
  );
}
