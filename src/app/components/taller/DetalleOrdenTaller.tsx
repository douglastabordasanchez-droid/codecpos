import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  X, User, Phone, Mail, MapPin, Smartphone, Calendar, DollarSign,
  FileText, Clock, CheckCircle, AlertCircle, Plus, Edit, Printer,
  History, CreditCard, Package, Trash2, MessageCircle, Info,
  AlertTriangle, XCircle as XCircleIcon, Inbox, Search, CheckCircle2,
  Archive, ShieldAlert, Wrench, Box,
} from 'lucide-react';
import { toast } from 'sonner';
import { tallerService } from '../../services/tallerService';
import {
  type OrdenServicio, type EstadoOrden, type InsumoReparacion,
  ESTADOS_ORDEN, PRIORIDADES, TIPOS_DISPOSITIVO,
} from '../../types/taller';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanContext } from '../../contexts/LanContext';
import { electronStore } from '../../lib/electronStore';
import ModalImprimirOrdenTaller from './ModalImprimirOrdenTaller';
import { getNombreEmpresaCliente } from '../../lib/empresaConfig';

interface DetalleOrdenTallerProps {
  ordenId: string;
  onClose: () => void;
  onActualizar: () => void;
}

const ESTADO_ICONS: Record<string, React.ElementType> = {
  recibido: Inbox,
  diagnostico: Search,
  cotizado: DollarSign,
  aprobado: CheckCircle2,
  en_reparacion: Wrench,
  esperando_repuestos: Clock,
  reparado: CheckCircle,
  listo_entrega: Package,
  entregado: Archive,
  cancelado: XCircleIcon,
  garantia: ShieldAlert,
};

function EstadoIcon({ estado, className, style }: { estado: string; className: string; style?: React.CSSProperties }) {
  const Icon = ESTADO_ICONS[estado] || Box;
  return <Icon className={className} style={style} />;
}

function enviarWhatsApp(orden: OrdenServicio) {
  const empresa = getNombreEmpresaCliente();
  const tel = orden.cliente.telefono.replace(/\D/g, '');
  const numero = tel.startsWith('57') ? tel : `57${tel}`;
  const estadoLabel = ESTADOS_ORDEN.find((e) => e.value === orden.estado)?.label || orden.estado;
  const msg =
    `*${empresa} - SOPORTE TECNICO*\n\n` +
    `Hola *${orden.cliente.nombre}*, te informamos sobre tu orden *${orden.numeroOrden}*.\n\n` +
    `*Dispositivo:* ${orden.dispositivo.marca} ${orden.dispositivo.modelo}\n` +
    `*Estado actual:* ${estadoLabel}\n\n` +
    `Cualquier consulta estamos a tu disposicion.\n_${empresa}_`;
  window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(msg)}`, '_blank');
}

export default function DetalleOrdenTaller({ ordenId, onClose, onActualizar }: DetalleOrdenTallerProps) {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();
  const { emitLanEvent } = useLanContext();
  const usuarioNombre = (usuarioActual as any)?.nombreCompleto || (usuarioActual as any)?.nombre || (usuarioActual as any)?.username || 'Sistema';
  const [orden, setOrden] = useState<OrdenServicio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarCambiarEstado, setMostrarCambiarEstado] = useState(false);
  const [mostrarAgregarPago, setMostrarAgregarPago] = useState(false);
  const [mostrarAgregarNota, setMostrarAgregarNota] = useState(false);
  const [guardandoInsumos, setGuardandoInsumos] = useState(false);

  const [nuevoEstado, setNuevoEstado] = useState<EstadoOrden>('recibido');
  const [notasEstado, setNotasEstado] = useState('');

  const [nuevoPago, setNuevoPago] = useState({
    monto: 0,
    metodoPago: 'efectivo' as 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata',
    referencia: '',
    recibidoPor: '',
  });

  const [nuevaNota, setNuevaNota] = useState({
    nota: '',
    tipo: 'info' as 'info' | 'alerta' | 'problema',
  });

  const [showModalImprimir, setShowModalImprimir] = useState(false);

  const [insumosDraft, setInsumosDraft] = useState<InsumoReparacion[]>([]);
  const [sinRepuestosDraft, setSinRepuestosDraft] = useState(false);

  const [mostrarModalRepuesto, setMostrarModalRepuesto] = useState(false);
  const [repuestoData, setRepuestoData] = useState({ nombre: '', cantidad: 1, costo: 0, precio: 0 });

  const inputCls = darkMode
    ? 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
    : 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  const selectCls = darkMode
    ? 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
    : 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  const cargarOrden = async () => {
    setCargando(true);
    try {
      const ordenes = await tallerService.buscarOrdenes({});
      const encontrada = ordenes.find((o) => o.id === ordenId);
      if (encontrada) {
        setOrden(encontrada);
        setNuevoEstado(encontrada.estado);
        setInsumosDraft(encontrada.insumos || []);
        setSinRepuestosDraft(Boolean(encontrada.sinRepuestos));
      }
    } catch (err) {
      console.error('Error al cargar orden:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarOrden(); }, [ordenId]);

  const handleCambiarEstado = async () => {
    if (!orden) return;
    try {
      await tallerService.cambiarEstado(orden.id, nuevoEstado, usuarioNombre, notasEstado || undefined);
      await cargarOrden();
      setMostrarCambiarEstado(false);
      setNotasEstado('');
      onActualizar();

      // Notificar al Admin y cajeras vía LAN
      const estadoLabel = ESTADOS_ORDEN.find((e) => e.value === nuevoEstado)?.label ?? nuevoEstado;
      emitLanEvent('TALLER_ORDEN', {
        ordenId:          orden.id,
        numeroOrden:      orden.numeroOrden,
        nuevoEstado,
        nuevoEstadoLabel: estadoLabel,
        marca:            orden.dispositivo.marca,
        modelo:           orden.dispositivo.modelo,
        cliente:          orden.cliente.nombre,
        tecnico:          orden.tecnicoAsignado || '',
      });

      toast.success('Estado actualizado correctamente');
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const handleAgregarPago = async () => {
    if (!orden || nuevoPago.monto <= 0) return;
    try {
      await tallerService.registrarPago(orden.id, nuevoPago);

      try {
        const getHoy = () => {
          const ahora = new Date();
          return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        };
        const sesiones: any[] = JSON.parse(localStorage.getItem('pos-caja-sesiones-diarias') || '[]');
        const hoy = getHoy();
        const sesionActiva = sesiones.find((s: any) => s.fecha === hoy && s.estado === 'abierta');

        await electronStore.registrarVentaServicio({
          id: `TALLER-PAGO-${Date.now()}`,
          numero: 0,
          fecha: new Date().toISOString(),
          sesionCajaId: sesionActiva?.id || '',
          puntoVentaId: '',
          createdAt: new Date().toISOString(),
          syncStatus: 'pending' as any,
          items: [{
            id: `taller-${orden.id}`,
            codigo: `TALLER-${orden.numeroOrden}`,
            nombre: `Servicio Taller: ${orden.numeroOrden} — ${orden.dispositivo.marca} ${orden.dispositivo.modelo}`,
            precio: nuevoPago.monto,
            cantidad: 1,
            subtotal: nuevoPago.monto,
          } as any],
          subtotal: nuevoPago.monto,
          descuento: 0,
          total: nuevoPago.monto,
          metodoPago: nuevoPago.metodoPago as any,
          cajero: sesionActiva?.usuarioNombre || 'Taller',
          cajeroId: sesionActiva?.usuarioId || '',
          sincronizado: false,
        } as any);
      } catch (e) {
        console.warn('No se pudo registrar el pago en el flujo de caja:', e);
      }

      await cargarOrden();
      setMostrarAgregarPago(false);
      setNuevoPago({ monto: 0, metodoPago: 'efectivo', referencia: '', recibidoPor: '' });
      onActualizar();
      toast.success('Pago registrado correctamente');
    } catch {
      toast.error('Error al registrar el pago');
    }
  };

  const handleAgregarNota = async () => {
    if (!orden || !nuevaNota.nota.trim()) return;
    try {
      await tallerService.agregarNota(orden.id, {
        nota: nuevaNota.nota,
        tipo: nuevaNota.tipo,
        usuario: usuarioNombre,
      });
      await cargarOrden();
      setMostrarAgregarNota(false);
      setNuevaNota({ nota: '', tipo: 'info' });
      onActualizar();
      toast.success('Nota agregada correctamente');
    } catch {
      toast.error('Error al agregar la nota');
    }
  };

  const agregarInsumo = () => {
    setInsumosDraft((p) => [
      ...p,
      { id: `ins_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, nombre: '', costoAdquisicion: 0, detalles: '' },
    ]);
  };

  const actualizarInsumo = (id: string, campo: keyof InsumoReparacion, valor: string | number) =>
    setInsumosDraft((p) => p.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));

  const eliminarInsumo = (id: string) => setInsumosDraft((p) => p.filter((i) => i.id !== id));

  const handleAgregarRepuestoInventario = () => {
    if (!repuestoData.nombre.trim()) {
      toast.warning('Ingresa el nombre del repuesto');
      return;
    }
    try {
      const productos: any[] = JSON.parse(localStorage.getItem('pos-productos') || '[]');
      const idx = productos.findIndex(
        (p) => p.nombre?.toLowerCase() === repuestoData.nombre.trim().toLowerCase() && p.categoria === 'Repuestos Taller'
      );
      if (idx >= 0) {
        productos[idx].stock = (Number(productos[idx].stock) || 0) + repuestoData.cantidad;
      } else {
        productos.push({
          id: `rep_${Date.now()}`,
          nombre: repuestoData.nombre.trim(),
          categoria: 'Repuestos Taller',
          stock: repuestoData.cantidad,
          minStock: 1,
          precio: repuestoData.precio || repuestoData.costo,
          costo: repuestoData.costo,
          unidad: 'und',
          activo: true,
        });
      }
      localStorage.setItem('pos-productos', JSON.stringify(productos));
      toast.success(`"${repuestoData.nombre}" agregado al inventario`);
      setMostrarModalRepuesto(false);
      setRepuestoData({ nombre: '', cantidad: 1, costo: 0, precio: 0 });
    } catch {
      toast.error('Error al agregar al inventario');
    }
  };

  const guardarInsumos = async () => {
    if (!orden) return;
    const validos = insumosDraft.filter((i) => i.nombre.trim() && i.costoAdquisicion >= 0);
    if (!sinRepuestosDraft && validos.length === 0) {
      toast.warning('Agrega al menos un repuesto o marca "Sin Repuestos".');
      return;
    }
    try {
      setGuardandoInsumos(true);
      await tallerService.actualizarInsumos(orden.id, {
        insumos: sinRepuestosDraft ? [] : validos,
        sinRepuestos: sinRepuestosDraft,
      });

      // Auto-descuento de inventario para repuestos que coincidan por nombre
      if (!sinRepuestosDraft && validos.length > 0) {
        try {
          const productos: any[] = JSON.parse(localStorage.getItem('pos-productos') || '[]');
          let modificado = false;
          validos.forEach((ins) => {
            const idx = productos.findIndex(
              (p) => p.nombre?.toLowerCase() === ins.nombre.trim().toLowerCase() && p.categoria === 'Repuestos Taller'
            );
            if (idx >= 0 && productos[idx].stock > 0) {
              productos[idx].stock = Math.max(0, (Number(productos[idx].stock) || 0) - 1);
              modificado = true;
            }
          });
          if (modificado) localStorage.setItem('pos-productos', JSON.stringify(productos));
        } catch { /* ignore */ }
      }

      // Auto-registro de gasto si hay costo > 0 (evita duplicados por referenciaTaller)
      if (!sinRepuestosDraft && validos.length > 0) {
        const costoTotal = validos.reduce((s, i) => s + (Number(i.costoAdquisicion) || 0), 0);
        if (costoTotal > 0) {
          try {
            const gastos: any[] = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
            const yaExiste = gastos.some((g) => g.referenciaTaller === orden.id);
            if (!yaExiste) {
              gastos.push({
                id: `gasto_taller_${Date.now()}`,
                fecha: new Date().toISOString(),
                monto: costoTotal,
                categoria: 'Repuestos Taller',
                descripcion: `Repuestos: ${orden.numeroOrden} — ${orden.dispositivo.marca} ${orden.dispositivo.modelo}`,
                autorizadoPor: 'Sistema Taller',
                referenciaTaller: orden.id,
              });
              localStorage.setItem('pos-gastos', JSON.stringify(gastos));
            } else {
              // Actualizar monto del gasto existente
              const gIdx = gastos.findIndex((g) => g.referenciaTaller === orden.id);
              if (gIdx >= 0) gastos[gIdx].monto = costoTotal;
              localStorage.setItem('pos-gastos', JSON.stringify(gastos));
            }
          } catch { /* ignore */ }
        }
      }

      await cargarOrden();
      onActualizar();
      toast.success('Insumos actualizados correctamente');
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar insumos');
    } finally {
      setGuardandoInsumos(false);
    }
  };

  const handleImprimirFactura = () => setShowModalImprimir(true);

  if (cargando) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!orden) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`${darkMode ? 'bg-slate-900' : 'bg-white'} rounded-2xl p-6 max-w-md`}>
          <p className={darkMode ? 'text-white' : 'text-slate-900'}>Orden no encontrada</p>
          <button onClick={onClose}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const estadoConfig = ESTADOS_ORDEN.find((e) => e.value === orden.estado);
  const prioridadConfig = PRIORIDADES.find((p) => p.value === orden.prioridad);
  const tipoDispositivoConfig = TIPOS_DISPOSITIVO.find((t) => t.value === orden.dispositivo.tipo);

  const cardCls = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} rounded-xl p-4 border`;
  const titleCls = `text-base font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`;
  const textCls = `text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`;
  const mutedCls = `text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`;

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
        className={`rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Header */}
        <div className={`relative overflow-hidden px-6 py-4 border-b ${
          darkMode
            ? 'bg-gradient-to-r from-slate-900 via-blue-950/25 to-slate-900 border-slate-800'
            : 'bg-white border-slate-100'
        }`}>
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute -top-12 right-0 w-64 h-64 rounded-full blur-3xl ${darkMode ? 'bg-blue-600/7' : 'bg-blue-50/70'}`} />
          </div>
          <div className="relative flex items-start justify-between">
            <div>
              <h2 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {orden.numeroOrden}
              </h2>
              <p className={`text-sm mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {orden.cliente.nombre} · {orden.dispositivo.marca} {orden.dispositivo.modelo}
              </p>
            </div>
            <button onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Badges */}
          <div className="relative flex flex-wrap gap-2 mt-3">
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 border"
              style={{
                backgroundColor: `${estadoConfig?.color}18`,
                color: estadoConfig?.color,
                borderColor: `${estadoConfig?.color}35`,
              }}>
              <EstadoIcon estado={orden.estado} className="w-3.5 h-3.5" />
              {estadoConfig?.label}
            </span>
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 border"
              style={{
                backgroundColor: `${prioridadConfig?.color}18`,
                color: prioridadConfig?.color,
                borderColor: `${prioridadConfig?.color}35`,
              }}>
              {prioridadConfig?.label}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className={`p-6 overflow-y-auto max-h-[calc(92vh-200px)] space-y-5 ${darkMode ? 'bg-slate-900' : 'bg-slate-50/40'}`}
          style={{ scrollbarWidth: 'thin' }}>

          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMostrarCambiarEstado(!mostrarCambiarEstado)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <Edit className="w-4 h-4" />
              Cambiar Estado
            </button>
            <button onClick={() => setMostrarAgregarPago(!mostrarAgregarPago)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <CreditCard className="w-4 h-4" />
              Registrar Pago
            </button>
            <button onClick={() => setMostrarAgregarNota(!mostrarAgregarNota)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <FileText className="w-4 h-4" />
              Agregar Nota
            </button>
            <button onClick={handleImprimirFactura}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
                darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              }`}>
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button onClick={() => enviarWhatsApp(orden)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </button>
            <button onClick={() => setMostrarModalRepuesto(!mostrarModalRepuesto)}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <Box className="w-4 h-4" />
              Agregar al Inventario
            </button>
          </div>

          {/* Modal: Agregar repuesto al inventario */}
          {mostrarModalRepuesto && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className={`p-4 rounded-xl border ${darkMode ? 'bg-violet-950/40 border-violet-800' : 'bg-violet-50 border-violet-200'}`}>
              <h3 className={`text-base font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <Box className="w-4 h-4 text-violet-500" />
                Agregar Repuesto al Inventario
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Nombre del Repuesto</label>
                  <input type="text" value={repuestoData.nombre}
                    onChange={(e) => setRepuestoData({ ...repuestoData, nombre: e.target.value })}
                    className={inputCls} placeholder="Ej: Pantalla Samsung A20" />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Cantidad</label>
                  <input type="number" value={repuestoData.cantidad}
                    onChange={(e) => setRepuestoData({ ...repuestoData, cantidad: Math.max(1, Number(e.target.value)) })}
                    className={inputCls} min="1" />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Costo Adquisicion</label>
                  <input type="number" value={repuestoData.costo}
                    onChange={(e) => setRepuestoData({ ...repuestoData, costo: Number(e.target.value) })}
                    className={inputCls} min="0" placeholder="0" />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Precio de Venta</label>
                  <input type="number" value={repuestoData.precio}
                    onChange={(e) => setRepuestoData({ ...repuestoData, precio: Number(e.target.value) })}
                    className={inputCls} min="0" placeholder="0" />
                </div>
              </div>
              <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Si el repuesto ya existe en inventario, solo se sumara la cantidad.
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleAgregarRepuestoInventario}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors">
                  Agregar
                </button>
                <button onClick={() => setMostrarModalRepuesto(false)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}

          {/* Cambiar estado */}
          {mostrarCambiarEstado && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'} mb-3`}>Cambiar Estado</h3>
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Nuevo Estado</label>
                  <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value as EstadoOrden)}
                    className={selectCls}>
                    {ESTADOS_ORDEN.map((e) => (
                      <option key={e.value} value={e.value}>{e.label} — {e.descripcion}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Notas (opcional)</label>
                  <textarea value={notasEstado} onChange={(e) => setNotasEstado(e.target.value)}
                    className={`${inputCls} resize-none`} rows={2}
                    placeholder="Comentarios sobre el cambio de estado..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCambiarEstado}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
                    Guardar
                  </button>
                  <button onClick={() => setMostrarCambiarEstado(false)}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Agregar pago */}
          {mostrarAgregarPago && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'} mb-3`}>Registrar Pago</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Monto</label>
                  <input type="number" value={nuevoPago.monto}
                    onChange={(e) => setNuevoPago({ ...nuevoPago, monto: Number(e.target.value) })}
                    className={inputCls} placeholder="0" min="0" max={orden.saldoPendiente} />
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                    Máximo: ${orden.saldoPendiente.toLocaleString('es-CO')}
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Método</label>
                  <select value={nuevoPago.metodoPago}
                    onChange={(e) => setNuevoPago({ ...nuevoPago, metodoPago: e.target.value as any })}
                    className={selectCls}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Referencia (opcional)</label>
                  <input type="text" value={nuevoPago.referencia}
                    onChange={(e) => setNuevoPago({ ...nuevoPago, referencia: e.target.value })}
                    className={inputCls} placeholder="Número de transacción" />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Recibido Por</label>
                  <input type="text" value={nuevoPago.recibidoPor}
                    onChange={(e) => setNuevoPago({ ...nuevoPago, recibidoPor: e.target.value })}
                    className={inputCls} placeholder="Nombre de quien recibe" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleAgregarPago}
                  disabled={nuevoPago.monto <= 0 || nuevoPago.monto > orden.saldoPendiente}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors">
                  Registrar
                </button>
                <button onClick={() => setMostrarAgregarPago(false)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}

          {/* Agregar nota */}
          {mostrarAgregarNota && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'} mb-3`}>Agregar Nota Interna</h3>
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Tipo</label>
                  <select value={nuevaNota.tipo} onChange={(e) => setNuevaNota({ ...nuevaNota, tipo: e.target.value as any })}
                    className={selectCls}>
                    <option value="info">Información</option>
                    <option value="alerta">Alerta</option>
                    <option value="problema">Problema</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Nota</label>
                  <textarea value={nuevaNota.nota} onChange={(e) => setNuevaNota({ ...nuevaNota, nota: e.target.value })}
                    className={`${inputCls} resize-none`} rows={3}
                    placeholder="Escribe la nota interna..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAgregarNota} disabled={!nuevaNota.nota.trim()}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors">
                    Agregar
                  </button>
                  <button onClick={() => setMostrarAgregarNota(false)}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Insumos (estado cotizado) */}
          {orden.estado === 'cotizado' && (
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={titleCls}>
                  <Package className="w-4 h-4 text-cyan-400" />
                  Insumos — Estado Cotizado
                </h3>
                <button onClick={agregarInsumo}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Agregar Repuesto
                </button>
              </div>
              <label className={`flex items-center gap-2 mb-3 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'} cursor-pointer`}>
                <input type="checkbox" checked={sinRepuestosDraft}
                  onChange={(e) => setSinRepuestosDraft(e.target.checked)}
                  className="w-4 h-4 accent-blue-600" />
                Sin Repuestos (solo mano de obra)
              </label>
              {!sinRepuestosDraft && (
                <div className="space-y-2">
                  {insumosDraft.map((insumo) => (
                    <div key={insumo.id}
                      className={`grid grid-cols-1 md:grid-cols-12 gap-2 p-2 rounded-lg ${darkMode ? 'bg-slate-900' : 'bg-white border border-slate-100'}`}>
                      <input type="text"
                        className={`md:col-span-4 px-3 py-2 rounded border text-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        placeholder="Nombre del repuesto"
                        value={insumo.nombre}
                        onChange={(e) => actualizarInsumo(insumo.id, 'nombre', e.target.value)} />
                      <input type="text" inputMode="numeric"
                        className={`md:col-span-3 px-3 py-2 rounded border text-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        placeholder="Costo adquisición"
                        value={insumo.costoAdquisicion > 0 ? String(insumo.costoAdquisicion) : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          actualizarInsumo(insumo.id, 'costoAdquisicion', raw === '' ? 0 : Number(raw));
                        }} />
                      <input type="text"
                        className={`md:col-span-4 px-3 py-2 rounded border text-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        placeholder="Detalles"
                        value={insumo.detalles || ''}
                        onChange={(e) => actualizarInsumo(insumo.id, 'detalles', e.target.value)} />
                      <button onClick={() => eliminarInsumo(insumo.id)}
                        className="md:col-span-1 rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <p className={textCls}>
                  Total insumos: <strong>${(sinRepuestosDraft ? 0 : insumosDraft.reduce((s, i) => s + (Number(i.costoAdquisicion) || 0), 0)).toLocaleString('es-CO')}</strong>
                </p>
                <button onClick={guardarInsumos} disabled={guardandoInsumos}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
                  {guardandoInsumos ? 'Guardando...' : 'Guardar Insumos'}
                </button>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cliente */}
            <div className={cardCls}>
              <h3 className={titleCls}>
                <User className="w-4 h-4 text-blue-400" /> Cliente
              </h3>
              <div className="space-y-2">
                {[
                  { icon: User, value: orden.cliente.nombre },
                  orden.cliente.cedula ? { icon: FileText, value: `CC: ${orden.cliente.cedula}` } : null,
                  { icon: Phone, value: orden.cliente.telefono },
                  orden.cliente.email ? { icon: Mail, value: orden.cliente.email } : null,
                  orden.cliente.direccion ? { icon: MapPin, value: orden.cliente.direccion } : null,
                ].filter(Boolean).map((item, i) => {
                  const Icon = item!.icon;
                  return (
                    <div key={i} className={`flex items-center gap-2 ${textCls}`}>
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span>{item!.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dispositivo */}
            <div className={cardCls}>
              <h3 className={titleCls}>
                <Smartphone className="w-4 h-4 text-emerald-400" /> Dispositivo
              </h3>
              <div className="space-y-1.5 text-sm">
                <div className={textCls}><strong>Tipo:</strong> {tipoDispositivoConfig?.label}</div>
                <div className={textCls}><strong>Marca:</strong> {orden.dispositivo.marca}</div>
                <div className={textCls}><strong>Modelo:</strong> {orden.dispositivo.modelo}</div>
                {orden.dispositivo.serial && <div className={textCls}><strong>Serial/IMEI:</strong> {orden.dispositivo.serial}</div>}
                {orden.dispositivo.color && <div className={textCls}><strong>Color:</strong> {orden.dispositivo.color}</div>}
                <div className={`mt-2 p-2 rounded-lg ${darkMode ? 'bg-slate-900' : 'bg-white border border-slate-200'}`}>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <strong>Condición:</strong> {orden.dispositivo.condicionFisica}
                  </p>
                </div>
              </div>
            </div>

            {/* Problema */}
            <div className={cardCls}>
              <h3 className={titleCls}>
                <AlertCircle className="w-4 h-4 text-amber-400" /> Problema Reportado
              </h3>
              <p className={`${textCls} mb-3`}>{orden.problemaReportado.descripcion}</p>
              <p className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-1.5`}>Síntomas:</p>
              <div className="flex flex-wrap gap-1.5">
                {orden.problemaReportado.sintomas.map((s, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded text-xs border ${
                    darkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-700'
                  }`}>{s}</span>
                ))}
              </div>
            </div>

            {/* Financiero */}
            <div className={cardCls}>
              <h3 className={titleCls}>
                <DollarSign className="w-4 h-4 text-violet-400" /> Información Financiera
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Costo Estimado', value: orden.costoEstimado, color: darkMode ? 'text-white' : 'text-slate-900' },
                  { label: 'Anticipo', value: orden.anticipo, color: darkMode ? 'text-emerald-400' : 'text-emerald-600' },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between items-center p-2 rounded-lg ${darkMode ? 'bg-slate-900' : 'bg-white border border-slate-200'}`}>
                    <span className={mutedCls}>{row.label}:</span>
                    <span className={`font-bold ${row.color}`}>${row.value.toLocaleString('es-CO')}</span>
                  </div>
                ))}
                <div className={`flex justify-between items-center p-2 rounded-lg border ${
                  darkMode ? 'bg-amber-500/10 border-amber-500/25' : 'bg-amber-50 border-amber-200'
                }`}>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Saldo Pendiente:</span>
                  <span className={`text-xl font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                    ${orden.saldoPendiente.toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              {orden.pagos.length > 0 && (
                <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <p className={`text-xs font-semibold ${mutedCls} mb-2`}>Historial de Pagos:</p>
                  <div className="space-y-1">
                    {orden.pagos.map((pago) => (
                      <div key={pago.id} className={`flex justify-between text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span>{format(new Date(pago.fecha), 'dd/MM/yyyy HH:mm', { locale: es })} · {pago.metodoPago}</span>
                        <span className={`font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>+${pago.monto.toLocaleString('es-CO')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fechas */}
          <div className={cardCls}>
            <h3 className={titleCls}>
              <Calendar className="w-4 h-4 text-blue-400" /> Fechas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className={mutedCls}>Recepción</p>
                <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {format(new Date(orden.fechaRecepcion), 'dd/MM/yyyy HH:mm', { locale: es })}
                </p>
              </div>
              {orden.fechaEstimadaEntrega && (
                <div>
                  <p className={mutedCls}>Entrega Estimada</p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {format(new Date(orden.fechaEstimadaEntrega), 'dd/MM/yyyy', { locale: es })}
                  </p>
                </div>
              )}
              {orden.fechaEntrega && (
                <div>
                  <p className={mutedCls}>Entrega Real</p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {format(new Date(orden.fechaEntrega), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Historial de estados */}
          {orden.historialEstados.length > 0 && (
            <div className={cardCls}>
              <h3 className={titleCls}>
                <History className="w-4 h-4 text-violet-400" /> Historial de Estados
              </h3>
              <div className="space-y-2">
                {orden.historialEstados.map((cambio) => {
                  const cfgAnterior = ESTADOS_ORDEN.find((e) => e.value === cambio.estadoAnterior);
                  const cfgNuevo = ESTADOS_ORDEN.find((e) => e.value === cambio.estadoNuevo);
                  return (
                    <div key={cambio.id}
                      className={`flex items-center gap-3 text-sm p-2 rounded-lg ${darkMode ? 'bg-slate-900' : 'bg-white border border-slate-100'}`}>
                      <span className={`text-xs whitespace-nowrap ${mutedCls}`}>
                        {format(new Date(cambio.fecha), 'dd/MM HH:mm', { locale: es })}
                      </span>
                      <div className="flex items-center gap-2 flex-1">
                        <EstadoIcon estado={cambio.estadoAnterior}
                          className={`w-3.5 h-3.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                        <span className={darkMode ? 'text-slate-600' : 'text-slate-300'}>→</span>
                        <EstadoIcon estado={cambio.estadoNuevo}
                          className="w-3.5 h-3.5"
                          style={{ color: cfgNuevo?.color } as React.CSSProperties} />
                        <span className={textCls} style={{ color: cfgNuevo?.color }}>{cfgNuevo?.label}</span>
                      </div>
                      <span className={`text-xs ${mutedCls}`}>{cambio.usuario}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notas internas */}
          {orden.notasInternas.length > 0 && (
            <div className={cardCls}>
              <h3 className={titleCls}>
                <FileText className="w-4 h-4 text-amber-400" /> Notas Internas
              </h3>
              <div className="space-y-2">
                {orden.notasInternas.map((nota) => {
                  const NIcon = nota.tipo === 'alerta' ? AlertTriangle : nota.tipo === 'problema' ? XCircleIcon : Info;
                  const colors = nota.tipo === 'alerta'
                    ? darkMode ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
                    : nota.tipo === 'problema'
                    ? darkMode ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
                    : darkMode ? 'bg-blue-500/10 border-blue-500/25 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600';
                  return (
                    <div key={nota.id} className={`p-3 rounded-xl border ${colors.split(' ').slice(0, 2).join(' ')}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold flex items-center gap-1.5 ${colors.split(' ')[2]}`}>
                          <NIcon className="w-3.5 h-3.5" />
                          {nota.usuario}
                        </span>
                        <span className={`text-xs ${mutedCls}`}>
                          {format(new Date(nota.fecha), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </span>
                      </div>
                      <p className={textCls}>{nota.nota}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fotos */}
          {orden.dispositivo.fotosRecepcion && orden.dispositivo.fotosRecepcion.length > 0 && (
            <div className={cardCls}>
              <h3 className={titleCls}>
                <Smartphone className="w-4 h-4 text-slate-400" /> Fotos de Recepción
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {orden.dispositivo.fotosRecepcion.map((foto, i) => (
                  <img key={i} src={foto} alt={`Foto ${i + 1}`}
                    className={`w-full h-32 object-cover rounded-xl border cursor-pointer hover:border-blue-500 transition-colors ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}
                    onClick={() => window.open(foto, '_blank')} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-end ${
          darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
        }`}>
          <button onClick={onClose}
            className={`px-6 py-2 rounded-xl font-semibold transition-colors ${
              darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}>
            Cerrar
          </button>
        </div>
      </motion.div>

      <ModalImprimirOrdenTaller
        open={showModalImprimir}
        orden={orden}
        onClose={() => setShowModalImprimir(false)}
        darkMode={darkMode}
      />
    </motion.div>
  );
}
