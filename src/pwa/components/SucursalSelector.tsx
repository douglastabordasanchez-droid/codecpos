/**
 * Selector de sucursal para el dashboard móvil (InicioPage.tsx) — "Todas /
 * Sucursal A / Sucursal B..." para un dueño con varias sucursales, cada una
 * con su propia caja/Electron independiente (ver sucursalesService.ts).
 *
 * Se oculta solo a sí mismo si el negocio no tiene ninguna sucursal creada
 * todavía Y el usuario no es admin (nada que gestionar ni que filtrar) —
 * mismo criterio que TiendaSwitcher.tsx para no meterle ruido visual a la
 * inmensa mayoría de negocios de un solo local.
 */
import { useEffect, useState } from 'react';
import { Store, Plus, Settings2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listarSucursales, crearSucursal, listarInstalaciones, asignarInstalacionASucursal,
  type Sucursal, type InstalacionFila,
} from '../../app/lib/supabase/sucursalesService';

interface Props {
  clienteId: string;
  esAdmin: boolean;
  sucursalSeleccionada: string | null;
  onSeleccionar: (sucursalId: string | null) => void;
}

export function SucursalSelector({ clienteId, esAdmin, sucursalSeleccionada, onSeleccionar }: Props) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarGestion, setMostrarGestion] = useState(false);

  async function recargar() {
    try {
      setSucursales(await listarSucursales(clienteId));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { recargar(); }, [clienteId]);

  if (cargando) return null;
  if (sucursales.length === 0 && !esAdmin) return null;

  return (
    <div className="mt-6 pt-5 border-t border-slate-800/60">
      <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3 px-4">Ver por sucursal</h3>
      <div className="flex items-center gap-1.5 px-4 overflow-x-auto">
        <button
          onClick={() => onSeleccionar(null)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            sucursalSeleccionada === null
              ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
              : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-900'
          }`}
        >
          <Store className="w-3.5 h-3.5" /> Todas las sucursales
        </button>
        {sucursales.map((s) => (
          <button
            key={s.id}
            onClick={() => onSeleccionar(s.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              sucursalSeleccionada === s.id
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-900'
            }`}
          >
            {s.nombre}
          </button>
        ))}
        {esAdmin && (
          <button
            onClick={() => setMostrarGestion(true)}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-800/80 border border-slate-700 text-slate-400 hover:bg-slate-900"
            aria-label="Gestionar sucursales"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {mostrarGestion && (
        <GestionSucursalesModal
          clienteId={clienteId}
          sucursales={sucursales}
          onCerrar={() => setMostrarGestion(false)}
          onCambio={recargar}
        />
      )}
    </div>
  );
}

function GestionSucursalesModal({ clienteId, sucursales, onCerrar, onCambio }: {
  clienteId: string; sucursales: Sucursal[]; onCerrar: () => void; onCambio: () => void;
}) {
  const [instalaciones, setInstalaciones] = useState<InstalacionFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNueva, setNombreNueva] = useState('');
  const [creando, setCreando] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);

  async function recargarInstalaciones() {
    setCargando(true);
    try {
      setInstalaciones(await listarInstalaciones(clienteId));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { recargarInstalaciones(); }, [clienteId]);

  async function handleCrear() {
    const nombre = nombreNueva.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await crearSucursal(clienteId, nombre);
      setNombreNueva('');
      onCambio();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo crear la sucursal');
    } finally {
      setCreando(false);
    }
  }

  async function handleAsignar(instalacionId: string, sucursalId: string) {
    setAsignando(instalacionId);
    try {
      await asignarInstalacionASucursal(instalacionId, sucursalId || null);
      await recargarInstalaciones();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo asignar la caja');
    } finally {
      setAsignando(null);
    }
  }

  function nombreInstalacion(i: InstalacionFila): string {
    if (i.codigoCaja) return `Caja #${i.codigoCaja} (${i.tipo})`;
    return i.machineId ? `${i.tipo} · ${i.machineId.slice(0, 8)}…` : i.tipo;
  }

  return (
    <div className="fixed inset-0 z-[9500] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-black text-lg">Sucursales</h3>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Crear sucursal */}
        <div className="flex items-center gap-2 mb-5">
          <input
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            placeholder="Nombre de la sucursal (ej. Sucursal Norte)"
            className="flex-1 h-10 px-3 rounded-xl bg-slate-950/60 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleCrear}
            disabled={creando || !nombreNueva.trim()}
            className="h-10 w-10 shrink-0 rounded-xl bg-indigo-500 disabled:opacity-40 flex items-center justify-center text-white"
          >
            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        {/* Asignar cajas a sucursales */}
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-2">Cajas registradas</p>
        {cargando ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
        ) : instalaciones.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">
            Todavía no se ha conectado ninguna caja de este negocio a la nube.
          </p>
        ) : (
          <div className="space-y-2">
            {instalaciones.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between gap-2 bg-slate-800/50 rounded-xl px-3 py-2.5">
                <span className="text-sm text-slate-200 truncate">{nombreInstalacion(inst)}</span>
                <select
                  value={inst.sucursalId || ''}
                  disabled={asignando === inst.id}
                  onChange={(e) => handleAsignar(inst.id, e.target.value)}
                  className="text-xs bg-slate-950/60 border border-slate-700 rounded-lg px-2 py-1.5 text-white outline-none shrink-0 max-w-[140px]"
                >
                  <option value="">Sin asignar</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <p className="text-slate-600 text-[11px] mt-4">
          Cada caja aparece aquí sola apenas se conecta a internet por primera vez. Asígnala a la sucursal donde
          está instalada para poder ver sus ventas por separado arriba.
        </p>
      </div>
    </div>
  );
}
