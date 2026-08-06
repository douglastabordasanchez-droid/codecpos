import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FilePlus, CheckCircle, AlertCircle, Clock, User, Tag,
  Calendar, CalendarDays,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ReporteGenerado } from '../../services/reportesService';

interface TipoReporte {
  id: string;
  nombre: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  color: string;
  requierePeriodo?: boolean;
  requiereCajero?: boolean;
}

interface Props {
  open: boolean;
  tipo: TipoReporte | null;
  onClose: () => void;
  onGenerado: (reporte: ReporteGenerado) => void;
  darkMode: boolean;
  usuarioActual: any;
  generarFn: (tipo: string, inicio: string, fin: string, cajero: string, categoria: string) => Promise<ReporteGenerado>;
}

const PERIODOS = [
  { key: 'hoy',        label: 'Hoy' },
  { key: '7dias',      label: 'Últ. 7 días' },
  { key: '15dias',     label: '15 días' },
  { key: '30dias',     label: 'Últ. mes' },
  { key: 'mes-actual', label: 'Mes actual' },
];

function toDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function ModalGenerarReporte({ open, tipo, onClose, onGenerado, darkMode, usuarioActual, generarFn }: Props) {
  const [loading, setLoading] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [cajeroSeleccionado, setCajeroSeleccionado] = useState('');
  const [cajeros, setCajeros] = useState<Array<{ id: string; nombre: string }>>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string; color: string }>>([]);
  const [periodoActivo, setPeriodoActivo] = useState('7dias');

  // Init fechas por defecto
  useEffect(() => {
    if (!open) return;
    aplicarPeriodo('7dias');
    cargarCajeros();
    try {
      const raw = localStorage.getItem('codecpos_categorias_global');
      if (raw) setCategorias(JSON.parse(raw));
    } catch { /* no-op */ }
  }, [open]);

  const aplicarPeriodo = (key: string) => {
    setPeriodoActivo(key);
    const hoy = new Date();
    const fin = toDate(hoy);
    const ini = new Date();
    switch (key) {
      case 'hoy':        break;
      case '7dias':      ini.setDate(ini.getDate() - 7);  break;
      case '15dias':     ini.setDate(ini.getDate() - 15); break;
      case '30dias':     ini.setDate(ini.getDate() - 30); break;
      case 'mes-actual': ini.setDate(1);                   break;
    }
    setFechaInicio(toDate(ini));
    setFechaFin(fin);
  };

  const cargarCajeros = () => {
    try {
      const raw = localStorage.getItem('codecpos_usuarios') || localStorage.getItem('pos-usuarios');
      if (raw) {
        const usuarios = JSON.parse(raw);
        const lista = usuarios
          .filter((u: any) => u.activo && (u.rol === 'cajero' || u.rol === 'super_usuario'))
          .map((u: any) => ({ id: u.id, nombre: u.nombreCompleto || u.nombre || u.username || 'Sin nombre' }));
        setCajeros(lista);
        if (usuarioActual?.id) {
          const existe = lista.some((c: any) => c.id === usuarioActual.id);
          setCajeroSeleccionado(existe ? usuarioActual.id : lista[0]?.id || '');
        } else {
          setCajeroSeleccionado(lista[0]?.id || '');
        }
      }
    } catch { /* no-op */ }
  };

  const dias = fechaInicio && fechaFin
    ? Math.ceil((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  const validar = () => {
    if (tipo?.requierePeriodo) {
      if (!fechaInicio || !fechaFin) return 'Selecciona el período de fechas';
      if (dias < 0) return 'La fecha inicio debe ser anterior a la fecha fin';
      if (dias > 180) return 'El período máximo es 6 meses (180 días)';
    }
    if (tipo?.requiereCajero && !cajeroSeleccionado) return 'Selecciona un cajero';
    return null;
  };

  const generar = async () => {
    const err = validar();
    if (err) return;
    setLoading(true);
    try {
      const reporte = await generarFn(tipo!.id, fechaInicio, fechaFin, cajeroSeleccionado, categoriaFiltro);
      onGenerado(reporte);
      onClose();
    } catch {
      /* error handled by parent */
    } finally {
      setLoading(false);
    }
  };

  if (!tipo) return null;

  const Icono = tipo.icono;
  const error = validar();

  const bg      = darkMode ? 'bg-slate-900'    : 'bg-white';
  const border  = darkMode ? 'border-slate-700' : 'border-gray-200';
  const txt     = darkMode ? 'text-white'       : 'text-slate-900';
  const sub     = darkMode ? 'text-slate-400'   : 'text-slate-500';
  const inp     = darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-slate-900';
  const cardBg  = darkMode ? 'bg-slate-800'     : 'bg-gray-50';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-[160] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className={`relative w-full max-w-lg rounded-3xl shadow-2xl border overflow-hidden ${bg} ${border}`}
          >
            {/* Header con gradiente del tipo */}
            <div className={`bg-gradient-to-r ${tipo.color} px-6 py-5`}>
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Icono className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{tipo.nombre}</h2>
                  <p className="text-sm text-white/80">{tipo.descripcion}</p>
                </div>
              </div>
            </div>

            {/* Cuerpo */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>

              {/* Período */}
              {tipo.requierePeriodo && (
                <div className="space-y-3">
                  <Label className={`text-sm font-semibold flex items-center gap-2 ${txt}`}>
                    <CalendarDays className="w-4 h-4" />
                    Período del reporte
                  </Label>

                  {/* Quick period chips */}
                  <div className="flex flex-wrap gap-2">
                    {PERIODOS.map(p => (
                      <button
                        key={p.key}
                        onClick={() => aplicarPeriodo(p.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          periodoActivo === p.key
                            ? `bg-gradient-to-r ${tipo.color} border-transparent text-white shadow`
                            : darkMode
                              ? 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className={`text-xs ${sub}`}>Desde</Label>
                      <Input
                        type="date"
                        value={fechaInicio}
                        onChange={e => { setFechaInicio(e.target.value); setPeriodoActivo(''); }}
                        className={`rounded-xl text-sm ${inp}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={`text-xs ${sub}`}>Hasta</Label>
                      <Input
                        type="date"
                        value={fechaFin}
                        onChange={e => { setFechaFin(e.target.value); setPeriodoActivo(''); }}
                        className={`rounded-xl text-sm ${inp}`}
                      />
                    </div>
                  </div>

                  {/* Resumen período */}
                  {fechaInicio && fechaFin && dias > 0 && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${cardBg}`}>
                      <Calendar className={`w-3.5 h-3.5 ${sub}`} />
                      <span className={sub}>
                        {fechaInicio} → {fechaFin}
                        <span className={`ml-2 font-bold ${txt}`}>{dias} {dias === 1 ? 'día' : 'días'}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Info inventario (sin período) */}
              {!tipo.requierePeriodo && (
                <div className={`flex items-start gap-3 p-3 rounded-xl border ${darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                  <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    Este reporte analiza el estado actual del inventario. No requiere rango de fechas.
                  </p>
                </div>
              )}

              {/* Selector cajero */}
              {tipo.requiereCajero && (
                <div className="space-y-2">
                  <Label className={`text-sm font-semibold flex items-center gap-2 ${txt}`}>
                    <User className="w-4 h-4" />
                    Cajero a analizar
                  </Label>
                  <select
                    value={cajeroSeleccionado}
                    onChange={e => setCajeroSeleccionado(e.target.value)}
                    className={`w-full p-3 rounded-xl border-2 text-sm ${inp}`}
                  >
                    <option value="">— Selecciona un cajero —</option>
                    {cajeros.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  {cajeros.length === 0 && (
                    <p className="text-xs text-amber-500">No hay cajeros registrados en el sistema</p>
                  )}
                </div>
              )}

              {/* Filtro categoría (solo ventas) */}
              {tipo.id === 'ventas' && categorias.length > 0 && (
                <div className="space-y-2">
                  <Label className={`text-sm font-semibold flex items-center gap-2 ${txt}`}>
                    <Tag className="w-4 h-4" />
                    Filtrar por categoría
                    <span className={`text-xs font-normal ${sub}`}>(opcional)</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setCategoriaFiltro('')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        categoriaFiltro === ''
                          ? darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-gray-800 border-gray-800 text-white'
                          : darkMode ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      Todas
                    </button>
                    {categorias.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoriaFiltro(categoriaFiltro === cat.nombre ? '' : cat.nombre)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          categoriaFiltro === cat.nombre
                            ? 'text-white border-transparent shadow'
                            : darkMode ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                        style={categoriaFiltro === cat.nombre ? { backgroundColor: cat.color } : undefined}
                      >
                        {cat.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Aviso retención 6 meses */}
              <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>
                  El reporte se almacena por <strong>6 meses</strong>. Descárgalo en PDF o Excel para conservarlo permanentemente.
                  <span className={`block mt-0.5 ${darkMode ? 'text-amber-300/70' : 'text-amber-600/70'}`}>
                    Expira el {new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </p>
              </div>
            </div>

            {/* Footer fijo */}
            <div className={`px-6 py-4 border-t ${border} flex gap-3`}>
              <button
                onClick={onClose}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancelar
              </button>
              <Button
                onClick={generar}
                disabled={loading || !!error}
                className={`flex-[2] h-12 font-bold rounded-xl bg-gradient-to-r ${tipo.color} text-white shadow-lg text-sm`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FilePlus className="w-4 h-4 mr-2" />
                    Generar y ver reporte
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
