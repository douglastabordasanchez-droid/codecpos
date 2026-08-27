/**
 * CODEC POS v2.0 — Veterinaria y Mascotas
 *
 * Tres pestañas: Granel con báscula, Estética/Grooming (agenda), y Farmacia
 * y Servicios Médicos. Cualquier venta (bulto pesado, baño, consulta,
 * medicamento) se manda al MISMO carrito del Punto de Venta —igual patrón
 * que PanaderiaOncesPage.tsx (`codecpos_carrito_transferido` + navigate a
 * /pos) — la liquidación final, descuentos y método de pago siguen viviendo
 * ahí, sin duplicar esa lógica aquí.
 *
 * La venta a granel NO reinventa el pesaje: reusa `producto.pesable` (ver
 * POSPageNew.tsx), el mismo mecanismo que ya interpreta `precio` como
 * precio/kg y descuenta stock proporcional al peso vendido. Aquí solo se
 * filtra la vista y se conecta la báscula (useSerialScale, Web Serial API)
 * para capturar el peso antes de mandarlo al carrito.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  PawPrint, Scale, Sparkles, Pill, Search, Plus, Minus, ShoppingCart,
  Calendar, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Dog, Cat,
} from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { electronStore } from '../../lib/electronStore';
import { useSerialScale } from '../../hooks/usePeripherals';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  listarCitasGrooming, crearCitaGrooming, actualizarEstadoCita,
  type CitaGrooming, type EstadoCita,
} from '../../lib/supabase/citasGroomingService';

interface ProductoVet {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  pesable?: boolean;
  tipoProducto?: 'fisico' | 'servicio' | 'granel';
  especie?: string;
  requiereReceta?: boolean;
  lote?: string;
  fechaVencimiento?: string;
}

const STORAGE_TRANSFER_CART = 'codecpos_carrito_transferido';

const SERVICIOS_ESTETICA = [
  { nombre: 'Baño Básico', precio: 25000 },
  { nombre: 'Baño Medicado', precio: 38000 },
  { nombre: 'Corte de Pelo', precio: 35000 },
  { nombre: 'Corte de Uñas', precio: 12000 },
  { nombre: 'Desparasitación Externa', precio: 20000 },
];

type Tab = 'granel' | 'estetica' | 'farmacia';

export default function VeterinariaPage() {
  const { darkMode } = usePOS();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('granel');
  const [productos, setProductos] = useState<ProductoVet[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    electronStore.obtenerProductos().then((p: ProductoVet[]) => {
      setProductos(p || []);
      setCargando(false);
    });
  }, []);

  const productosGranel = useMemo(
    () => productos.filter((p) => (p.pesable || p.tipoProducto === 'granel') &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );
  const productosFarmacia = useMemo(
    () => productos.filter((p) =>
      (p.requiereReceta || p.categoria?.toLowerCase().includes('medicamento') || p.tipoProducto === 'fisico') &&
      !p.pesable && p.tipoProducto !== 'granel' &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );

  const enviarACarrito = (items: Array<{ producto: any; cantidad: number; peso?: number }>) => {
    try {
      localStorage.setItem(STORAGE_TRANSFER_CART, JSON.stringify(items));
      localStorage.removeItem('codecpos_referencia_mesa');
      navigate('/pos');
    } catch {
      toast.error('No se pudo enviar al carrito. Intenta de nuevo.');
    }
  };

  const cardCls = darkMode ? 'bg-slate-800/60 border-slate-700 hover:border-emerald-500/60' : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-lg';
  const textCls = darkMode ? 'text-white' : 'text-gray-900';
  const mutedCls = darkMode ? 'text-slate-400' : 'text-gray-500';

  const TABS: { id: Tab; label: string; icon: typeof Scale; color: string }[] = [
    { id: 'granel', label: 'Alimentos a Granel', icon: Scale, color: 'emerald' },
    { id: 'estetica', label: 'Estética y Grooming', icon: Sparkles, color: 'purple' },
    { id: 'farmacia', label: 'Farmacia y Servicios', icon: Pill, color: 'sky' },
  ];

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <PawPrint className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className={`text-2xl font-black ${textCls}`}>Veterinaria y Mascotas</h1>
          <p className={`text-sm ${mutedCls}`}>Alimentos a granel, estética y farmacia — todo hacia el mismo carrito</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all ${
                activo
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                  : darkMode ? 'bg-slate-800/60 text-slate-400 hover:bg-slate-800' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div className="flex justify-center py-20"><Loader2 className={`w-8 h-8 animate-spin ${mutedCls}`} /></div>
      ) : (
        <AnimatePresence mode="wait">
          {tab === 'granel' && (
            <motion.div key="granel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabGranel productos={productosGranel} busqueda={busqueda} setBusqueda={setBusqueda}
                darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onVender={(producto, peso) => enviarACarrito([{ producto, cantidad: 1, peso }])} />
            </motion.div>
          )}
          {tab === 'estetica' && (
            <motion.div key="estetica" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabEstetica darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onFacturar={(nombreItem, precio) => enviarACarrito([{
                  producto: { id: `srv-${Date.now()}`, nombre: nombreItem, precio, codigo: 'SERVICIO', categoria: 'Estética' },
                  cantidad: 1,
                }])} />
            </motion.div>
          )}
          {tab === 'farmacia' && (
            <motion.div key="farmacia" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabFarmacia productos={productosFarmacia} busqueda={busqueda} setBusqueda={setBusqueda}
                darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onVender={(producto, cantidad) => enviarACarrito([{ producto, cantidad }])}
                onFacturarConsulta={(nombre, precio) => enviarACarrito([{
                  producto: { id: `srv-${Date.now()}`, nombre, precio, codigo: 'SERVICIO', categoria: 'Servicios Médicos' },
                  cantidad: 1,
                }])} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ═══════════════════ TAB: GRANEL CON BÁSCULA ═══════════════════

function TabGranel({ productos, busqueda, setBusqueda, darkMode, cardCls, textCls, mutedCls, onVender }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onVender: (producto: ProductoVet, peso: number) => void;
}) {
  const [productoActivo, setProductoActivo] = useState<ProductoVet | null>(null);
  const bascula = useSerialScale();
  const [pesoManual, setPesoManual] = useState('');
  const [modoManual, setModoManual] = useState(false);

  const pesoKg = modoManual ? (parseFloat(pesoManual.replace(',', '.')) || 0) : bascula.peso / 1000;

  const confirmar = () => {
    if (!productoActivo || pesoKg <= 0) return;
    onVender(productoActivo, pesoKg);
    setProductoActivo(null);
    setPesoManual('');
    setModoManual(false);
  };

  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedCls}`} />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar alimento a granel..."
          className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
      </div>

      {productos.length === 0 ? (
        <EmptyHint darkMode={darkMode} icon={Scale}
          texto='No hay productos marcados como "Granel-Alimento" todavía. Impórtalos con la plantilla de Veterinaria (columna TipoProducto = Granel-Alimento) o márcalos como "pesable" al crear el producto.' />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {productos.map((p) => (
            <button key={p.id} onClick={() => setProductoActivo(p)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${cardCls}`}>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-3">
                <Scale className="w-5 h-5 text-emerald-500" />
              </div>
              <p className={`font-bold text-sm mb-1 ${textCls}`}>{p.nombre}</p>
              <p className="text-emerald-500 font-black">${p.precio.toLocaleString('es-CO')}/kg</p>
              <p className={`text-xs mt-1 ${mutedCls}`}>Stock: {p.stock.toFixed(1)} kg</p>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {productoActivo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className={`max-w-md w-full rounded-3xl p-8 ${darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'}`}>
              <div className="text-center mb-6">
                <Scale className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
                <h3 className={`text-xl font-bold mb-1 ${textCls}`}>{productoActivo.nombre}</h3>
                <p className={mutedCls}>${productoActivo.precio.toLocaleString('es-CO')} /kg</p>
              </div>

              {!bascula.conectado && !modoManual && (
                <Button onClick={bascula.conectarBascula} className="w-full mb-3 bg-emerald-600 hover:bg-emerald-700">
                  Conectar báscula (puerto serial)
                </Button>
              )}

              {!modoManual ? (
                <div className={`p-6 rounded-2xl mb-4 text-center ${darkMode ? 'bg-slate-800 border-2 border-slate-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm mb-2 ${mutedCls}`}>Peso detectado:</p>
                  <div className="text-5xl font-black text-emerald-500 mb-1">{pesoKg.toFixed(3)}</div>
                  <p className={mutedCls}>kilogramos</p>
                  {bascula.conectado && (
                    <button onClick={bascula.tarar} className="text-xs text-emerald-500 underline mt-2">Tarar</button>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className={`text-xs font-bold ${mutedCls}`}>Peso manual (kg)</label>
                  <Input value={pesoManual} onChange={(e) => setPesoManual(e.target.value)} placeholder="Ej. 1.500"
                    className={`mt-1 text-center text-2xl h-14 font-black ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
                </div>
              )}

              <button onClick={() => setModoManual((v) => !v)} className={`text-xs underline mb-4 block mx-auto ${mutedCls}`}>
                {modoManual ? 'Usar báscula' : 'La báscula no está disponible — ingresar peso manualmente'}
              </button>

              <div className="flex gap-3">
                <Button onClick={() => { setProductoActivo(null); setModoManual(false); setPesoManual(''); }} variant="outline" className="flex-1 h-12">
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={pesoKg <= 0}
                  className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
                  <ShoppingCart className="w-4 h-4 mr-2" /> Agregar al carrito
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════ TAB: ESTÉTICA / GROOMING ═══════════════════

function TabEstetica({ darkMode, cardCls, textCls, mutedCls, onFacturar }: {
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onFacturar: (nombreItem: string, precio: number) => void;
}) {
  const [tutorNombre, setTutorNombre] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');
  const [mascotaNombre, setMascotaNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'generales'>('perro');
  const [raza, setRaza] = useState('');
  const [tipoPelo, setTipoPelo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS_ESTETICA[0]);
  const [precioServicio, setPrecioServicio] = useState(String(SERVICIOS_ESTETICA[0].precio));
  const [guardandoCita, setGuardandoCita] = useState(false);

  const [citas, setCitas] = useState<CitaGrooming[]>([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);
  const [fechaHoraCita, setFechaHoraCita] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return `${d.toISOString().slice(0, 10)}T${String(d.getHours()).padStart(2, '0')}:00`;
  });

  const cargarCitas = () => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
    setCargandoCitas(true);
    listarCitasGrooming(hoy, manana).then(setCitas).catch(() => {}).finally(() => setCargandoCitas(false));
  };
  useEffect(cargarCitas, []);

  const formValido = tutorNombre.trim() && mascotaNombre.trim() && Number(precioServicio) > 0;

  const handleAgendar = async () => {
    if (!formValido) { toast.error('Completa tutor, mascota y precio del servicio'); return; }
    setGuardandoCita(true);
    try {
      await crearCitaGrooming({
        tutorNombre: tutorNombre.trim(), tutorTelefono: tutorTelefono.trim() || undefined,
        mascotaNombre: mascotaNombre.trim(), especie, raza: raza.trim() || undefined,
        tipoPelo: tipoPelo.trim() || undefined, observaciones: observaciones.trim() || undefined,
        servicio: servicioSeleccionado.nombre, precio: Number(precioServicio), fechaHora: new Date(fechaHoraCita).toISOString(),
      });
      toast.success('Turno agendado');
      cargarCitas();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo agendar el turno');
    } finally {
      setGuardandoCita(false);
    }
  };

  const handleFacturarAhora = () => {
    if (!formValido) { toast.error('Completa tutor, mascota y precio del servicio'); return; }
    onFacturar(`${servicioSeleccionado.nombre} — ${mascotaNombre.trim()}`, Number(precioServicio));
  };

  const inputCls = `mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`;
  const labelCls = `text-xs font-bold ${mutedCls}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ficha del tutor/mascota + servicio */}
      <div className={`p-6 rounded-2xl border-2 ${cardCls}`}>
        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${textCls}`}>
          <Sparkles className="w-5 h-5 text-purple-500" /> Ficha de baño / peluquería
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Tutor</label><Input value={tutorNombre} onChange={(e) => setTutorNombre(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Teléfono</label><Input value={tutorTelefono} onChange={(e) => setTutorTelefono(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Mascota</label><Input value={mascotaNombre} onChange={(e) => setMascotaNombre(e.target.value)} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Especie</label>
            <select value={especie} onChange={(e) => setEspecie(e.target.value as any)}
              className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
              <option value="perro">Perro</option>
              <option value="gato">Gato</option>
              <option value="generales">Otro</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Raza</label><Input value={raza} onChange={(e) => setRaza(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Tipo de pelo</label><Input value={tipoPelo} onChange={(e) => setTipoPelo(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="mb-3">
          <label className={labelCls}>Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
            className={`mt-1 w-full rounded-lg px-3 py-2 text-sm border resize-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Servicio</label>
            <select value={servicioSeleccionado.nombre}
              onChange={(e) => {
                const s = SERVICIOS_ESTETICA.find((x) => x.nombre === e.target.value) || SERVICIOS_ESTETICA[0];
                setServicioSeleccionado(s); setPrecioServicio(String(s.precio));
              }}
              className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
              {SERVICIOS_ESTETICA.map((s) => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Precio</label><Input value={precioServicio} onChange={(e) => setPrecioServicio(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="mb-4">
          <label className={labelCls}>Fecha y hora del turno (para agendar)</label>
          <Input type="datetime-local" value={fechaHoraCita} onChange={(e) => setFechaHoraCita(e.target.value)} className={inputCls} />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleAgendar} disabled={guardandoCita || !formValido} variant="outline" className="flex-1 h-11">
            <Calendar className="w-4 h-4 mr-2" /> Agendar turno
          </Button>
          <Button onClick={handleFacturarAhora} disabled={!formValido}
            className="flex-1 h-11 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-700">
            <ShoppingCart className="w-4 h-4 mr-2" /> Facturar ahora
          </Button>
        </div>
      </div>

      {/* Agenda del día */}
      <div className={`p-6 rounded-2xl border-2 ${cardCls}`}>
        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${textCls}`}>
          <Clock className="w-5 h-5 text-purple-500" /> Agenda de hoy
        </h3>
        {cargandoCitas ? (
          <Loader2 className={`w-6 h-6 animate-spin mx-auto ${mutedCls}`} />
        ) : citas.length === 0 ? (
          <p className={`text-sm text-center py-8 ${mutedCls}`}>No hay turnos agendados para hoy.</p>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {citas.map((c) => (
              <div key={c.id} className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-bold text-sm flex items-center gap-1.5 ${textCls}`}>
                    {c.especie === 'gato' ? <Cat className="w-3.5 h-3.5" /> : <Dog className="w-3.5 h-3.5" />}
                    {c.mascotaNombre} · {c.tutorNombre}
                  </span>
                  <span className={`text-xs font-mono ${mutedCls}`}>{new Date(c.fechaHora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className={`text-xs ${mutedCls}`}>{c.servicio} · ${c.precio.toLocaleString('es-CO')}</p>
                <div className="flex items-center gap-2 mt-2">
                  <EstadoBadge estado={c.estado} />
                  {c.estado === 'PENDIENTE' && (
                    <button onClick={() => actualizarEstadoCita(c.id, 'EN_PROCESO').then(cargarCitas)} className="text-[11px] text-sky-500 underline">Iniciar</button>
                  )}
                  {c.estado === 'EN_PROCESO' && (
                    <button onClick={() => { actualizarEstadoCita(c.id, 'COMPLETADA').then(cargarCitas); onFacturar(`${c.servicio} — ${c.mascotaNombre}`, c.precio); }} className="text-[11px] text-emerald-500 underline">Completar y facturar</button>
                  )}
                  {(c.estado === 'PENDIENTE' || c.estado === 'EN_PROCESO') && (
                    <button onClick={() => actualizarEstadoCita(c.id, 'CANCELADA').then(cargarCitas)} className="text-[11px] text-red-500 underline">Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoCita }) {
  const map: Record<EstadoCita, { label: string; cls: string; Icon: typeof Clock }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-500', Icon: Clock },
    EN_PROCESO: { label: 'En proceso', cls: 'bg-sky-500/15 text-sky-500', Icon: Loader2 },
    COMPLETADA: { label: 'Completada', cls: 'bg-emerald-500/15 text-emerald-500', Icon: CheckCircle2 },
    CANCELADA: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-500', Icon: XCircle },
  };
  const { label, cls, Icon } = map[estado];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
}

// ═══════════════════ TAB: FARMACIA Y SERVICIOS MÉDICOS ═══════════════════

function TabFarmacia({ productos, busqueda, setBusqueda, darkMode, cardCls, textCls, mutedCls, onVender, onFacturarConsulta }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onVender: (producto: ProductoVet, cantidad: number) => void;
  onFacturarConsulta: (nombre: string, precio: number) => void;
}) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [nombreConsulta, setNombreConsulta] = useState('Consulta General');
  const [precioConsulta, setPrecioConsulta] = useState('45000');

  const getCantidad = (id: string) => cantidades[id] ?? 1;
  const setCantidad = (id: string, v: number) => setCantidades((c) => ({ ...c, [id]: Math.max(1, v) }));

  const vencidoPronto = (fecha?: string) => {
    if (!fecha) return false;
    const dias = (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return dias <= 60;
  };

  return (
    <div>
      {/* Honorarios / consulta ad-hoc */}
      <div className={`p-5 rounded-2xl border-2 mb-6 ${cardCls}`}>
        <h3 className={`font-bold mb-3 flex items-center gap-2 ${textCls}`}><Pill className="w-4 h-4 text-sky-500" /> Consulta / procedimiento / honorarios</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className={`text-xs font-bold ${mutedCls}`}>Concepto</label>
            <Input value={nombreConsulta} onChange={(e) => setNombreConsulta(e.target.value)} className={`mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
          </div>
          <div className="w-40">
            <label className={`text-xs font-bold ${mutedCls}`}>Valor</label>
            <Input value={precioConsulta} onChange={(e) => setPrecioConsulta(e.target.value)} className={`mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
          </div>
          <Button onClick={() => nombreConsulta.trim() && Number(precioConsulta) > 0 && onFacturarConsulta(nombreConsulta.trim(), Number(precioConsulta))}
            className="h-10 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700">
            <ShoppingCart className="w-4 h-4 mr-2" /> Facturar
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedCls}`} />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar medicamento..."
          className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
      </div>

      {productos.length === 0 ? (
        <EmptyHint darkMode={darkMode} icon={Pill} texto="No hay medicamentos registrados todavía. Impórtalos con la plantilla de Veterinaria o créalos en Inventario marcando Lote y Fecha de vencimiento." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {productos.map((p) => (
            <div key={p.id} className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${cardCls}`}>
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                <Pill className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${textCls}`}>{p.nombre}</p>
                <p className="text-sky-500 font-black text-sm">${p.precio.toLocaleString('es-CO')}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {p.lote && <span className={`text-[10px] ${mutedCls}`}>Lote {p.lote}</span>}
                  {p.fechaVencimiento && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${vencidoPronto(p.fechaVencimiento) ? 'text-red-500 font-bold' : mutedCls}`}>
                      {vencidoPronto(p.fechaVencimiento) && <AlertTriangle className="w-2.5 h-2.5" />} Vence {p.fechaVencimiento}
                    </span>
                  )}
                  {p.requiereReceta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-bold">Requiere receta</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setCantidad(p.id, getCantidad(p.id) - 1)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}><Minus className="w-3.5 h-3.5" /></button>
                <span className={`w-6 text-center text-sm font-bold ${textCls}`}>{getCantidad(p.id)}</span>
                <button onClick={() => setCantidad(p.id, getCantidad(p.id) + 1)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <Button size="sm" onClick={() => onVender(p, getCantidad(p.id))} className="shrink-0 bg-sky-600 hover:bg-sky-700 h-9">
                Agregar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ darkMode, icon: Icon, texto }: { darkMode: boolean; icon: typeof Scale; texto: string }) {
  return (
    <div className={`p-8 rounded-2xl border-2 border-dashed text-center ${darkMode ? 'border-slate-700 text-slate-500' : 'border-gray-300 text-gray-500'}`}>
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p className="text-sm max-w-md mx-auto">{texto}</p>
    </div>
  );
}
