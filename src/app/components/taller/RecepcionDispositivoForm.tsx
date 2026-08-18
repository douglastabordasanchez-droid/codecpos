import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Upload, Save, User, Phone, FileText, CreditCard,
  CheckCircle2, Plus, Calendar, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { tallerService } from '../../services/tallerService';
import { TIPOS_DISPOSITIVO, PRIORIDADES, type TipoDispositivo, type Prioridad } from '../../types/taller';
import { usePOS } from '../../contexts/POSContext';
import { useLanContext } from '../../contexts/LanContext';

const STEPS = [
  { num: 1 as const, label: 'Cliente',     icon: User       },
  { num: 2 as const, label: 'Dispositivo', icon: Phone      },
  { num: 3 as const, label: 'Problema',    icon: FileText   },
  { num: 4 as const, label: 'Costos',      icon: CreditCard },
];

interface RecepcionDispositivoFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecepcionDispositivoForm({ onClose, onSuccess }: RecepcionDispositivoFormProps) {
  const { darkMode } = usePOS();
  const { emitLanEvent } = useLanContext();

  const input = darkMode
    ? 'w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm'
    : 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm shadow-sm';

  const select = darkMode
    ? 'w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-sm'
    : 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-sm shadow-sm';

  const textarea = darkMode
    ? 'w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none text-sm'
    : 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none text-sm shadow-sm';

  const label = darkMode
    ? 'block text-sm font-semibold text-slate-300 mb-1.5'
    : 'block text-sm font-semibold text-slate-700 mb-1.5';

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [guardando, setGuardando] = useState(false);
  const [tecnicosList, setTecnicosList] = useState<Array<{ id: string; nombre: string }>>([]);

  useEffect(() => {
    try {
      const usuarios: any[] = JSON.parse(localStorage.getItem('codecpos_usuarios') || '[]');
      const aptos = usuarios
        .filter((u) => (u.rol === 'tecnico' || u.rol === 'super_usuario') && u.activo !== false)
        .map((u) => ({ id: u.id || u.username || '', nombre: u.nombreCompleto || u.nombre || u.username || '' }))
        .filter((u) => u.id && u.nombre);
      // Fallback: si no hay técnicos configurados, mostrar todos los usuarios activos
      if (aptos.length === 0) {
        const fallback = usuarios
          .filter((u) => u.activo !== false)
          .map((u) => ({ id: u.id || u.username || '', nombre: u.nombreCompleto || u.nombre || u.username || '' }))
          .filter((u) => u.id && u.nombre);
        setTecnicosList(fallback);
      } else {
        setTecnicosList(aptos);
      }
    } catch { /* ignore */ }
  }, []);

  const [clienteData, setClienteData] = useState({
    nombre: '', cedula: '', telefono: '', email: '', direccion: '',
  });

  const [dispositivoData, setDispositivoData] = useState({
    tipo: 'celular' as TipoDispositivo,
    marca: '', modelo: '', serial: '', imei: '',
    color: '', patron: '', contraseña: '',
    accesorios: [] as string[],
    condicionFisica: '',
  });

  const [fotosRecepcion, setFotosRecepcion] = useState<string[]>([]);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const [problemaData, setProblemaData] = useState({
    descripcion: '', sintomas: [] as string[], reproduceProblema: true,
  });
  const [nuevoSintoma, setNuevoSintoma] = useState('');

  const [ordenData, setOrdenData] = useState({
    prioridad: 'normal' as Prioridad,
    costoEstimado: 0,
    anticipo: 0,
    fechaEstimadaEntrega: '',
    tecnicoAsignado: '',
    tecnicoAsignadoId: '', // id del usuario para routing LAN dirigido
    observaciones: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setFotosRecepcion((p) => [...p, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const eliminarFoto = (i: number) => setFotosRecepcion((p) => p.filter((_, idx) => idx !== i));

  const agregarSintoma = () => {
    if (!nuevoSintoma.trim()) return;
    setProblemaData((p) => ({ ...p, sintomas: [...p.sintomas, nuevoSintoma.trim()] }));
    setNuevoSintoma('');
  };

  const eliminarSintoma = (i: number) =>
    setProblemaData((p) => ({ ...p, sintomas: p.sintomas.filter((_, idx) => idx !== i) }));

  const validarPaso = (p: number): boolean => {
    if (p === 1) return !!(clienteData.nombre && clienteData.telefono);
    if (p === 2) return !!(dispositivoData.marca && dispositivoData.modelo && dispositivoData.condicionFisica);
    if (p === 3) return !!(problemaData.descripcion && problemaData.sintomas.length > 0);
    if (p === 4) return ordenData.costoEstimado >= 0 && ordenData.anticipo >= 0 && ordenData.anticipo <= ordenData.costoEstimado;
    return false;
  };

  const handleGuardarOrden = async () => {
    if (!validarPaso(4)) {
      toast.error('El anticipo no puede ser mayor al costo estimado');
      return;
    }
    setGuardando(true);
    try {
      const cliente = await tallerService.guardarCliente({
        nombre: clienteData.nombre,
        cedula: clienteData.cedula,
        telefono: clienteData.telefono,
        email: clienteData.email,
        direccion: clienteData.direccion,
      });

      const orden = await tallerService.crearOrden({
        fechaRecepcion: new Date().toISOString(),
        cliente: {
          id: cliente.id,
          nombre: clienteData.nombre,
          cedula: clienteData.cedula,
          telefono: clienteData.telefono,
          email: clienteData.email,
          direccion: clienteData.direccion,
        },
        dispositivo: { ...dispositivoData, fotosRecepcion },
        problemaReportado: problemaData,
        estado: 'recibido',
        prioridad: ordenData.prioridad,
        costoEstimado: ordenData.costoEstimado,
        costoFinal: ordenData.costoEstimado,
        valorCobrado: ordenData.costoEstimado,
        anticipo: ordenData.anticipo,
        saldoPendiente: Math.max(0, ordenData.costoEstimado - ordenData.anticipo),
        insumos: [],
        sinRepuestos: false,
        costoInsumos: 0,
        utilidadNeta: ordenData.costoEstimado,
        pagos: [],
        fechaEstimadaEntrega: ordenData.fechaEstimadaEntrega || undefined,
        tecnicoAsignado: ordenData.tecnicoAsignado || undefined,
        notasInternas: ordenData.observaciones
          ? [{ id: `nota_${Date.now()}`, fecha: new Date().toISOString(), usuario: 'Sistema', nota: ordenData.observaciones, tipo: 'info' }]
          : [],
        creadoPor: 'Sistema',
        notificarCliente: true,
        urgente: ordenData.prioridad === 'urgente',
      });

      if (ordenData.anticipo > 0) {
        await tallerService.registrarPago(orden.id, {
          monto: ordenData.anticipo,
          metodoPago: 'efectivo',
          recibidoPor: 'Sistema',
        });
      }

      // 🛡️ FIX: la orden se guardaba SOLO en el IndexedDB local de esta
      // terminal — ni el Admin ni otras terminales se enteraban de que
      // existía a menos que hubiera un técnico asignado (y en ese caso solo
      // le llegaba a ÉL un resumen para el toast, nunca la orden completa).
      // Ahora se transmite la orden COMPLETA a todas las terminales
      // conectadas (broadcast, sin targetUserId) para que la reciban y la
      // guarden en su propio IndexedDB — ver LanContext.tsx
      // `_handleTallerOrdenNueva` y `tallerService.upsertOrdenRemota`.
      emitLanEvent('TALLER_ORDEN_NUEVA', { orden });

      // Notificar al técnico asignado via red LAN (si está conectado o cuando conecte)
      if (ordenData.tecnicoAsignadoId) {
        const lanPayload = {
          ordenId:               orden.id,
          numeroOrden:           orden.numeroOrden,
          tecnicoAsignadoId:     ordenData.tecnicoAsignadoId,
          tecnicoAsignadoNombre: ordenData.tecnicoAsignado,
          cliente:               clienteData.nombre,
          marca:                 dispositivoData.marca,
          modelo:                dispositivoData.modelo,
          tipo:                  dispositivoData.tipo,
          prioridad:             ordenData.prioridad,
        };

        // Canal TCP principal (también guarda en cola si el técnico está offline)
        emitLanEvent('NUEVA_REPARACION_REGISTRADA', lanPayload, ordenData.tecnicoAsignadoId);

        // HTTP push directo + feedback de entrega (no bloquea la UI). Solo la
        // terminal que actúa como servidor LAN puede hacer este push instantáneo
        // (es la única con el socket abierto hacia el técnico) — en modo cliente
        // el IPC devuelve techOnline=false sin haber intentado nada, así que ese
        // caso NO significa "no se entregó": la entrega real ya quedó garantizada
        // arriba, por `NUEVA_REPARACION_REGISTRADA` (cola LAN) y por la nube
        // (tallerSyncService, ver useSyncModulosNube). El toast solo debe
        // prometer lo que esta llamada puntual realmente confirmó.
        const el = (window as any).electron;
        if (el?.lan?.pushTallerOrden) {
          el.lan.pushTallerOrden({
            event: { type: 'NUEVA_REPARACION_REGISTRADA', payload: lanPayload, ts: Date.now() },
            userId: ordenData.tecnicoAsignadoId,
          }).then((result: any) => {
            if (result?.techOnline) {
              toast.success(`Técnico ${ordenData.tecnicoAsignado} notificado en tiempo real`);
            } else {
              toast.info(`${ordenData.tecnicoAsignado} verá la orden en su panel de Taller en cuanto se conecte`);
            }
          }).catch(() => {});
        }
      }

      toast.success(`Orden ${orden.numeroOrden} creada exitosamente`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error al crear orden:', error);
      toast.error('Error al crear la orden. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  const renderPaso1 = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label}>Nombre Completo <span className="text-red-400">*</span></label>
          <input type="text" value={clienteData.nombre}
            onChange={(e) => setClienteData({ ...clienteData, nombre: e.target.value })}
            className={input} placeholder="Ej: Juan Pérez" />
        </div>
        <div>
          <label className={label}>Cédula / ID</label>
          <input type="text" value={clienteData.cedula}
            onChange={(e) => setClienteData({ ...clienteData, cedula: e.target.value })}
            className={input} placeholder="Ej: 1234567890" />
        </div>
        <div>
          <label className={label}>Teléfono <span className="text-red-400">*</span></label>
          <input type="tel" value={clienteData.telefono}
            onChange={(e) => setClienteData({ ...clienteData, telefono: e.target.value })}
            className={input} placeholder="Ej: 3001234567" />
        </div>
        <div>
          <label className={label}>Email</label>
          <input type="email" value={clienteData.email}
            onChange={(e) => setClienteData({ ...clienteData, email: e.target.value })}
            className={input} placeholder="Ej: cliente@email.com" />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Dirección</label>
          <input type="text" value={clienteData.direccion}
            onChange={(e) => setClienteData({ ...clienteData, direccion: e.target.value })}
            className={input} placeholder="Ej: Calle 123 #45-67" />
        </div>
      </div>
    </div>
  );

  const renderPaso2 = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label}>Tipo de Dispositivo <span className="text-red-400">*</span></label>
          <select value={dispositivoData.tipo}
            onChange={(e) => setDispositivoData({ ...dispositivoData, tipo: e.target.value as TipoDispositivo })}
            className={select}>
            {TIPOS_DISPOSITIVO.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Marca <span className="text-red-400">*</span></label>
          <input type="text" value={dispositivoData.marca}
            onChange={(e) => setDispositivoData({ ...dispositivoData, marca: e.target.value })}
            className={input} placeholder="Ej: Samsung, Apple, LG" />
        </div>
        <div>
          <label className={label}>Modelo <span className="text-red-400">*</span></label>
          <input type="text" value={dispositivoData.modelo}
            onChange={(e) => setDispositivoData({ ...dispositivoData, modelo: e.target.value })}
            className={input} placeholder="Ej: Galaxy S21, iPhone 13" />
        </div>
        <div>
          <label className={label}>Serial / IMEI</label>
          <input type="text" value={dispositivoData.serial}
            onChange={(e) => setDispositivoData({ ...dispositivoData, serial: e.target.value })}
            className={input} placeholder="Número de serie o IMEI" />
        </div>
        <div>
          <label className={label}>Color</label>
          <input type="text" value={dispositivoData.color}
            onChange={(e) => setDispositivoData({ ...dispositivoData, color: e.target.value })}
            className={input} placeholder="Ej: Negro, Blanco, Azul" />
        </div>
        <div>
          <label className={label}>Patrón / PIN</label>
          <input type="text" value={dispositivoData.patron}
            onChange={(e) => setDispositivoData({ ...dispositivoData, patron: e.target.value })}
            className={input} placeholder="Para desbloquear (si aplica)" />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Condición Física <span className="text-red-400">*</span></label>
          <textarea value={dispositivoData.condicionFisica}
            onChange={(e) => setDispositivoData({ ...dispositivoData, condicionFisica: e.target.value })}
            className={textarea} rows={3}
            placeholder="Ej: Pantalla rayada, carcasa con golpe en esquina inferior derecha..." />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Fotos del Dispositivo</label>
          <div className="space-y-3">
            <button type="button" onClick={() => inputFileRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 transition-colors text-sm font-medium">
              <Upload className="w-4 h-4" />
              Subir Fotos
            </button>
            <input ref={inputFileRef} type="file" accept="image/*" multiple
              onChange={handleFileChange} className="hidden" />
            {fotosRecepcion.length > 0 && (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {fotosRecepcion.map((foto, i) => (
                  <div key={i} className="relative group">
                    <img src={foto} alt={`Foto ${i + 1}`}
                      className={`w-full h-20 object-cover rounded-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`} />
                    <button type="button" onClick={() => eliminarFoto(i)}
                      className="absolute top-1 right-1 bg-red-600 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPaso3 = () => (
    <div className="space-y-4">
      <div>
        <label className={label}>Descripción del Problema <span className="text-red-400">*</span></label>
        <textarea value={problemaData.descripcion}
          onChange={(e) => setProblemaData({ ...problemaData, descripcion: e.target.value })}
          className={textarea} rows={4}
          placeholder="Describe detalladamente el problema reportado por el cliente..." />
      </div>
      <div>
        <label className={label}>Síntomas <span className="text-red-400">*</span></label>
        <div className="flex gap-2 mb-2">
          <input type="text" value={nuevoSintoma}
            onChange={(e) => setNuevoSintoma(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarSintoma())}
            className={input}
            placeholder="Ej: No enciende, pantalla rota, batería no carga..." />
          <button type="button" onClick={agregarSintoma}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors text-sm font-medium whitespace-nowrap flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>
        {problemaData.sintomas.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {problemaData.sintomas.map((s, i) => (
              <span key={i}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
                  darkMode
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-amber-50 border-amber-300 text-amber-700'
                }`}>
                {s}
                <button type="button" onClick={() => eliminarSintoma(i)}
                  className="hover:opacity-70 transition-opacity ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <label className={`flex items-center gap-2.5 cursor-pointer ${darkMode ? 'text-slate-300' : 'text-slate-700'} text-sm`}>
        <input type="checkbox" checked={problemaData.reproduceProblema}
          onChange={(e) => setProblemaData({ ...problemaData, reproduceProblema: e.target.checked })}
          className="w-4 h-4 rounded accent-blue-600" />
        El problema se puede reproducir en el taller
      </label>
    </div>
  );

  const renderPaso4 = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label}>Prioridad</label>
          <select value={ordenData.prioridad}
            onChange={(e) => setOrdenData({ ...ordenData, prioridad: e.target.value as Prioridad })}
            className={select}>
            {PRIORIDADES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Técnico Asignado</label>
          <select
            value={ordenData.tecnicoAsignadoId}
            onChange={(e) => {
              const selected = tecnicosList.find(t => t.id === e.target.value);
              setOrdenData({
                ...ordenData,
                tecnicoAsignadoId: e.target.value,
                tecnicoAsignado: selected?.nombre || '',
              });
            }}
            className={select}
          >
            <option value="">Sin asignar</option>
            {tecnicosList.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Costo Estimado <span className="text-red-400">*</span></label>
          <input type="number" value={ordenData.costoEstimado}
            onChange={(e) => setOrdenData({ ...ordenData, costoEstimado: Number(e.target.value) })}
            className={input} placeholder="0" min="0" />
        </div>
        <div>
          <label className={label}>Anticipo / Abono</label>
          <input type="number" value={ordenData.anticipo}
            onChange={(e) => setOrdenData({ ...ordenData, anticipo: Number(e.target.value) })}
            className={input} placeholder="0" min="0" max={ordenData.costoEstimado} />
        </div>
        <div>
          <label className={`${label} flex items-center gap-1.5`}>
            <Calendar className="w-3.5 h-3.5" />
            Fecha Estimada de Entrega
          </label>
          <input type="date" value={ordenData.fechaEstimadaEntrega}
            onChange={(e) => setOrdenData({ ...ordenData, fechaEstimadaEntrega: e.target.value })}
            className={select} />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Observaciones</label>
          <textarea value={ordenData.observaciones}
            onChange={(e) => setOrdenData({ ...ordenData, observaciones: e.target.value })}
            className={textarea} rows={3}
            placeholder="Notas adicionales sobre la orden..." />
        </div>

        {ordenData.costoEstimado > 0 && (
          <div className={`md:col-span-2 p-4 rounded-xl border ${
            darkMode ? 'bg-blue-600/10 border-blue-500/25' : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Costo Estimado:</span>
                <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  ${ordenData.costoEstimado.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Anticipo:</span>
                <span className={`font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  ${ordenData.anticipo.toLocaleString('es-CO')}
                </span>
              </div>
              <div className={`flex justify-between items-center pt-2 border-t ${darkMode ? 'border-blue-500/25' : 'border-blue-200'}`}>
                <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Saldo Pendiente:</span>
                <span className={`text-lg font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                  ${(ordenData.costoEstimado - ordenData.anticipo).toLocaleString('es-CO')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className={`rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden border ${
          darkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        {/* Header */}
        <div className={`relative overflow-hidden px-6 pt-5 pb-0 ${
          darkMode
            ? 'bg-gradient-to-r from-slate-900 via-blue-950/30 to-slate-900 border-b border-slate-800'
            : 'bg-white border-b border-slate-100'
        }`}>
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute -top-10 right-0 w-56 h-56 rounded-full blur-3xl ${darkMode ? 'bg-blue-600/8' : 'bg-blue-50/80'}`} />
          </div>
          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${darkMode ? 'bg-blue-600/15 border border-blue-500/25' : 'bg-blue-50 border border-blue-200'}`}>
                <Wrench className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Recepción de Dispositivo
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Nueva orden de servicio técnico
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Animated step indicator */}
          <div className="flex items-start pb-5">
            {STEPS.map((step, idx) => {
              const done = paso > step.num;
              const active = paso === step.num;
              const Icon = step.icon;
              return (
                <div key={step.num} className="flex items-start flex-1">
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <motion.div
                      animate={{ scale: active ? 1.08 : 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        done
                          ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/30'
                          : active
                          ? darkMode
                            ? 'bg-blue-600/20 border-blue-400 shadow-[0_0_14px_rgba(59,130,246,0.35)]'
                            : 'bg-blue-50 border-blue-500 shadow-md shadow-blue-200'
                          : darkMode
                          ? 'bg-slate-800 border-slate-700'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      ) : (
                        <Icon className={`w-4 h-4 transition-colors ${
                          active
                            ? darkMode ? 'text-blue-400' : 'text-blue-600'
                            : darkMode ? 'text-slate-500' : 'text-slate-400'
                        }`} />
                      )}
                    </motion.div>
                    <span className={`text-xs font-semibold transition-colors ${
                      active
                        ? darkMode ? 'text-blue-400' : 'text-blue-600'
                        : done
                        ? darkMode ? 'text-blue-500' : 'text-blue-400'
                        : darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mt-[18px] rounded-full transition-all duration-500 ${
                      paso > step.num
                        ? 'bg-blue-500'
                        : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className={`p-6 overflow-y-auto max-h-[calc(92vh-220px)] ${
          darkMode ? 'bg-slate-900' : 'bg-slate-50/50'
        }`} style={{ scrollbarWidth: 'thin' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={paso}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              {paso === 1 && renderPaso1()}
              {paso === 2 && renderPaso2()}
              {paso === 3 && renderPaso3()}
              {paso === 4 && renderPaso4()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between ${
          darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
        }`}>
          <button
            onClick={() => paso > 1 && setPaso((p) => (p - 1) as 1 | 2 | 3 | 4)}
            disabled={paso === 1}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              paso === 1
                ? darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            Anterior
          </button>

          {paso < 4 ? (
            <button
              onClick={() => validarPaso(paso) && setPaso((p) => (p + 1) as 1 | 2 | 3 | 4)}
              disabled={!validarPaso(paso)}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                validarPaso(paso)
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25'
                  : darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={handleGuardarOrden}
              disabled={guardando || !validarPaso(4)}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                guardando || !validarPaso(4)
                  ? darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/25'
              }`}
            >
              <Save className="w-4 h-4" />
              {guardando ? 'Guardando...' : 'Crear Orden'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
