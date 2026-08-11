/**
 * CODECPOS v2.0 - Panel Maestro de Personal y Usuarios
 * Centro unificado: datos laborales + acceso + permisos operacionales
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Plus, Edit2, Trash2, User,
  Eye, EyeOff, Crown, Save, IdCard, UserPlus, Shield,
  Phone, Briefcase, DollarSign, Calendar, X, ToggleLeft,
  Search, Wallet, Coffee, Lock, Wrench, LayoutGrid,
  TrendingUp, BarChart3, Clock, Activity, ChevronRight,
  CreditCard, Banknote, Smartphone, ChevronLeft, ShoppingCart, Bike,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { electronStore, type Venta } from '../../lib/electronStore';
import { toast } from 'sonner';
import type { Usuario, PermisosUsuario } from '../../contexts/AuthContext';
import PermisosUsuarioModal from '../pos/PermisosUsuarioModal';
import { esModuloActivoGlobal, ModuloPOS } from '../../lib/permissions';
import {
  employeeActivityLogService,
  employeeActivityRetentionPolicy,
  type EmployeeActivityLog,
} from '../../lib/employeeActivityLogService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Tipos de estadísticas por empleado ──────────────────────────────────────
interface EstadoTurno {
  activo: boolean;
  horaInicio: string;
  baseInicial: number;
}

interface StatsEmpleado {
  ventasHoy: number;
  montoHoy: number;
  ventasMes: number;
  montoMes: number;
  ventasPorMetodo: { efectivo: number; tarjeta: number; nequi: number; daviplata: number; transferencia: number; rappi: number };
  ultimasVentas: Venta[];
  turno: EstadoTurno | null;
}

// ─── Toggle switch nativo Tailwind ────────────────────────────────────────────
function Toggle({
  value, onChange, disabled,
}: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`w-12 h-7 rounded-full relative transition-colors focus:outline-none ${
        value ? 'bg-emerald-500' : 'bg-slate-500'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
          value ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  );
}

// ─── Contenedor de sección de permisos ───────────────────────────────────────
function SeccionPermisos({
  titulo, icono, children, dm,
}: { titulo: string; icono: React.ReactNode; children: React.ReactNode; dm: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${dm ? 'bg-slate-800 border border-slate-700' : 'bg-gray-50 border border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-1">
        {icono}
        <h4 className={`font-bold text-sm ${dm ? 'text-white' : 'text-gray-900'}`}>{titulo}</h4>
      </div>
      {children}
    </div>
  );
}

// ─── Fila de permiso con toggle ───────────────────────────────────────────────
function PermisoRow({
  label, desc, value, onChange, darkMode,
}: {
  label: string; desc: string; value: boolean;
  onChange: (v: boolean) => void; darkMode: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-3 border-b last:border-0 ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
      <div className="flex-1 mr-4">
        <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

// ─── Permisos por defecto para cajero nuevo ───────────────────────────────────
const PERMISOS_CAJERO_DEFAULT: PermisosUsuario = {
  dashboard: false,
  ventas: true,
  productos: true,
  alertas: true,
  configuracion: false,
  usuarios: false,
  cierreCaja: true,
  reportes: false,
  contabilidad: false,
  gastos: true,
  codecVerify: false,
  devoluciones: false,
  empleados: true,
  multitienda: false,
  fidelizacion: false,
  panaderiaOnces: true,
  // Caja
  verFaltanteCaja: false,
  modificarBaseApertura: false,
  // Panadería
  panaderiaVentas: true,
  panaderiaCategorias: false,
  panaderiaMermas: false,
  // Taller
  tallerCrearOrdenes: true,
  tallerEditarPrecios: false,
};

// ─── Tipos internos del formulario ────────────────────────────────────────────
type ModalTab = 'info' | 'acceso' | 'permisos';

interface FormState {
  nombreCompleto: string;
  cedula: string;
  cargo: string;
  telefono: string;
  salario: string;
  fechaContratacion: string;
  username: string;
  password: string;
  passwordAnterior: string;
  passwordNueva: string;
}

const FORM_EMPTY: FormState = {
  nombreCompleto: '', cedula: '', cargo: '', telefono: '',
  salario: '', fechaContratacion: '', username: '',
  password: '', passwordAnterior: '', passwordNueva: '',
};

// ─── Componente principal ─────────────────────────────────────────────────────
export function UsuariosPage() {
  const { darkMode } = usePOS();
  const { usuarios, usuarioActual, crearUsuario, actualizarUsuario, eliminarUsuario, cambiarPassword } = useAuth();

  // ── Búsqueda global ──
  const [busqueda, setBusqueda] = useState('');

  // ── Modal crear/editar ──
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [tabActivo, setTabActivo] = useState<ModalTab>('info');
  const [form, setForm] = useState<FormState>(FORM_EMPTY);
  const [permisos, setPermisos] = useState<PermisosUsuario>(PERMISOS_CAJERO_DEFAULT);
  const [mostrarPass, setMostrarPass] = useState(false);
  const [mostrarPassNueva, setMostrarPassNueva] = useState(false);
  const [rolFormulario, setRolFormulario] = useState<'cajero' | 'tecnico'>('cajero');

  // ── Modal de módulos (PermisosUsuarioModal existente) ──
  const [modalModulos, setModalModulos] = useState(false);
  const [usuarioModulos, setUsuarioModulos] = useState<Usuario | null>(null);

  // ── Panel de actividad ──
  const [panelActividad, setPanelActividad] = useState<Usuario | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, StatsEmpleado>>({});
  const [cargandoStats, setCargandoStats] = useState(false);
  const [fechaActividadDesde, setFechaActividadDesde] = useState(() => {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [fechaActividadHasta, setFechaActividadHasta] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Listas derivadas ──
  const superUsuario = useMemo(() => usuarios.find(u => u.rol === 'super_usuario'), [usuarios]);
  const cajeros = useMemo(() => usuarios.filter(u => u.rol === 'cajero'), [usuarios]);
  const tecnicos = useMemo(() => usuarios.filter(u => u.rol === 'tecnico'), [usuarios]);
  const personalOperativo = useMemo(() => usuarios.filter(u => u.rol === 'cajero' || u.rol === 'tecnico'), [usuarios]);
  const activos = useMemo(() => usuarios.filter(u => u.activo).length, [usuarios]);

  // ── Módulos globalmente activos (leídos en la sesión; se actualiza al reabrir el modal) ──
  // Patrón extensible: para cada nuevo módulo, agrega su clave aquí
  const modulosActivos = useMemo(() => ({
    panaderia: esModuloActivoGlobal(ModuloPOS.PANADERIA_ONCES),
    taller:    esModuloActivoGlobal(ModuloPOS.TALLER_REPARACIONES),
    // nuevoModulo: esModuloActivoGlobal(ModuloPOS.NUEVO_MODULO),
  }), []);

  // ─── Cargar estadísticas de ventas de todos los empleados ────────────────────
  const cargarStats = useCallback(async () => {
    setCargandoStats(true);
    try {
      const todasVentas = await electronStore.obtenerVentas();
      const hoy = new Date();
      const hoyStr = hoy.toDateString();
      const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

      const mapa: Record<string, StatsEmpleado> = {};
      for (const u of personalOperativo) {
        const ventasUsuario = todasVentas.filter((v: Venta) =>
          v.cajeroId === u.id || v.cajero === u.username || v.cajero === u.nombreCompleto
        );
        const ventasHoy   = ventasUsuario.filter((v: Venta) => new Date(v.fecha).toDateString() === hoyStr);
        const ventasMes   = ventasUsuario.filter((v: Venta) => new Date(v.fecha) >= primerDiaMes);
        const metodos     = { efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, rappi: 0 };
        ventasMes.forEach((v: Venta) => {
          const m = (v.metodoPago || '').toLowerCase() as keyof typeof metodos;
          if (m in metodos) metodos[m] += v.total;
        });

        // Turno activo (apertura de caja guardada para ese cajero)
        let turno: EstadoTurno | null = null;
        try {
          const apertura = JSON.parse(localStorage.getItem('pos-apertura-actual') || 'null');
          if (apertura && (apertura.cajeroId === u.id || apertura.cajero === u.username)) {
            turno = { activo: true, horaInicio: apertura.fecha, baseInicial: apertura.baseInicial || 0 };
          }
        } catch { /* ignore */ }

        mapa[u.id] = {
          ventasHoy: ventasHoy.length,
          montoHoy: ventasHoy.reduce((s: number, v: Venta) => s + v.total, 0),
          ventasMes: ventasMes.length,
          montoMes: ventasMes.reduce((s: number, v: Venta) => s + v.total, 0),
          ventasPorMetodo: metodos,
          ultimasVentas: [...ventasUsuario].sort((a, b) =>
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
          ).slice(0, 20),
          turno,
        };
      }
      setStatsMap(mapa);
    } catch { /* silencioso */ }
    setCargandoStats(false);
  }, [personalOperativo]);

  useEffect(() => {
    if (personalOperativo.length > 0) cargarStats();
    const iv = setInterval(cargarStats, 30000);
    return () => clearInterval(iv);
  }, [cargarStats]);

  const fmtCOP = (n: number) => `$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

  const logsActividadEmpleado = useMemo<EmployeeActivityLog[]>(() => {
    if (!panelActividad) return [];
    if (fechaActividadDesde && fechaActividadHasta && fechaActividadDesde > fechaActividadHasta) return [];
    return employeeActivityLogService.getEmployeeLogs({
      usuarioId: panelActividad.id,
      fechaDesde: fechaActividadDesde || undefined,
      fechaHasta: fechaActividadHasta || undefined,
    });
  }, [panelActividad, fechaActividadDesde, fechaActividadHasta]);

  const descargarReporteActividadExcel = (empleado: Usuario, logs: EmployeeActivityLog[]) => {
    const wb = XLSX.utils.book_new();
    const rows = logs.map((log) => ({
      Fecha: log.fecha,
      Apertura: log.aperturaISO ? format(new Date(log.aperturaISO), 'dd/MM/yyyy HH:mm', { locale: es }) : '-',
      Cierre: log.cierreISO ? format(new Date(log.cierreISO), 'dd/MM/yyyy HH:mm', { locale: es }) : 'Turno abierto',
      BaseInicial: Number(log.baseInicial) || 0,
      TotalVentas: Number(log.totalVentas) || 0,
      Transacciones: Number(log.totalTransacciones) || 0,
      Efectivo: Number(log.resumenOperaciones?.efectivo) || 0,
      Tarjeta: Number(log.resumenOperaciones?.tarjeta) || 0,
      Nequi: Number(log.resumenOperaciones?.nequi) || 0,
      Daviplata: Number(log.resumenOperaciones?.daviplata) || 0,
      Transferencia: Number(log.resumenOperaciones?.transferencia) || 0,
      Rappi: Number(log.resumenOperaciones?.rappi) || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Actividad');
    XLSX.writeFile(wb, `Actividad-${empleado.username}-${fechaActividadDesde}_a_${fechaActividadHasta}.xlsx`);
  };

  const descargarReporteActividadPDF = (empleado: Usuario, logs: EmployeeActivityLog[]) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Reporte de Actividad por Empleado', 14, 14);
    doc.setFontSize(10);
    doc.text(`Empleado: ${empleado.nombreCompleto} (@${empleado.username})`, 14, 20);
    doc.text(`Rango: ${fechaActividadDesde} a ${fechaActividadHasta}`, 14, 25);

    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Apertura', 'Cierre', 'Ventas', 'Tx']],
      body: logs.map((log) => [
        log.fecha,
        log.aperturaISO ? format(new Date(log.aperturaISO), 'HH:mm', { locale: es }) : '-',
        log.cierreISO ? format(new Date(log.cierreISO), 'HH:mm', { locale: es }) : 'Abierto',
        fmtCOP(Number(log.totalVentas) || 0),
        String(Number(log.totalTransacciones) || 0),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Actividad-${empleado.username}-${fechaActividadDesde}_a_${fechaActividadHasta}.pdf`);
  };

  useEffect(() => {
    const mantenimiento = employeeActivityLogService.runRetentionMaintenance();
    if (mantenimiento.removed > 0) {
      toast.info(`Depuración automática aplicada: ${mantenimiento.removed} registros de actividad antiguos eliminados.`);
    }

    if (usuarioActual?.rol === 'super_usuario' && employeeActivityLogService.shouldNotifyPurgeWarning()) {
      toast.warning('Atención: mañana se eliminarán registros de actividad del personal antiguos. Descargue reportes si necesita histórico.');
    }
  }, [usuarioActual?.rol]);

  const calcTiempoTurno = (horaInicio: string) => {
    const diff = Date.now() - new Date(horaInicio).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const cajerosFiltrados = useMemo(() => {
    if (!busqueda) return personalOperativo;
    const t = busqueda.toLowerCase();
    return personalOperativo.filter(c =>
      c.nombreCompleto.toLowerCase().includes(t) ||
      c.username.toLowerCase().includes(t) ||
      c.cedula.includes(t) ||
      (c.cargo || '').toLowerCase().includes(t)
    );
  }, [personalOperativo, busqueda]);

  // ─── Abrir modal crear ───────────────────────────────────────────────────────
  const abrirCrear = () => {
    setForm(FORM_EMPTY);
    setPermisos(PERMISOS_CAJERO_DEFAULT);
    setRolFormulario('cajero');
    setModoEdicion(false);
    setUsuarioEditando(null);
    setTabActivo('info');
    setMostrarPass(false);
    setModalAbierto(true);
  };

  // ─── Abrir modal editar ──────────────────────────────────────────────────────
  const abrirEditar = (u: Usuario) => {
    setUsuarioEditando(u);
    setForm({
      nombreCompleto: u.nombreCompleto,
      cedula: u.cedula,
      cargo: u.cargo || '',
      telefono: u.telefono || '',
      salario: u.salario != null ? String(u.salario) : '',
      fechaContratacion: u.fechaContratacion || '',
      username: u.username,
      password: '',
      passwordAnterior: u.password,
      passwordNueva: '',
    });
    setPermisos(u.permisos ? { ...PERMISOS_CAJERO_DEFAULT, ...u.permisos } : { ...PERMISOS_CAJERO_DEFAULT });
    setModoEdicion(true);
    setTabActivo('info');
    setMostrarPass(false);
    setMostrarPassNueva(false);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setUsuarioEditando(null);
  };

  // ─── Guardar (crear o editar) ────────────────────────────────────────────────
  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nombreCompleto.trim()) { toast.error('El nombre completo es requerido'); return; }
    if (!form.cedula.trim() || !/^\d{7,10}$/.test(form.cedula)) {
      toast.error('Cédula inválida — debe tener entre 7 y 10 dígitos'); return;
    }
    if (!form.username.trim() || form.username.length < 3) {
      toast.error('El usuario debe tener al menos 3 caracteres'); return;
    }

    const salarioNum = form.salario ? Number(form.salario.replace(/\D/g, '')) : undefined;

    if (modoEdicion && usuarioEditando) {
      // ── Cambio de contraseña opcional ──
      if (form.passwordNueva) {
        if (!form.passwordAnterior) { toast.error('Debes ingresar la contraseña actual'); return; }
        if (form.passwordNueva.length < 4) { toast.error('La nueva contraseña debe tener mínimo 4 caracteres'); return; }
        const ok = cambiarPassword(usuarioEditando.id, form.passwordAnterior, form.passwordNueva);
        if (!ok) { toast.error('Contraseña actual incorrecta'); return; }
      }

      const ok = actualizarUsuario(usuarioEditando.id, {
        nombreCompleto: form.nombreCompleto,
        cedula: form.cedula,
        username: form.username,
        cargo: form.cargo || undefined,
        telefono: form.telefono || undefined,
        salario: salarioNum,
        fechaContratacion: form.fechaContratacion || undefined,
        permisos,
      });

      if (ok) {
        toast.success('Personal actualizado correctamente');
        cerrarModal();
      } else {
        toast.error('Error al actualizar — verifica que el usuario o cédula no estén repetidos');
      }
    } else {
      // ── Crear nuevo ──
      if (!form.password.trim() || form.password.length < 4) {
        toast.error('La contraseña debe tener al menos 4 caracteres'); return;
      }
      if (usuarios.some(u => u.username.toLowerCase() === form.username.toLowerCase())) {
        toast.error('Ese nombre de usuario ya existe'); return;
      }
      if (usuarios.some(u => u.cedula === form.cedula)) {
        toast.error('Esa cédula ya está registrada'); return;
      }

      const ok = crearUsuario({
        nombreCompleto: form.nombreCompleto,
        cedula: form.cedula,
        cargo: form.cargo || undefined,
        telefono: form.telefono || undefined,
        salario: salarioNum,
        fechaContratacion: form.fechaContratacion || undefined,
        username: form.username,
        password: form.password,
        rol: rolFormulario,
        activo: true,
        creadoPor: usuarioActual?.id || 'SISTEMA',
        permisos,
      });

      if (ok) {
        toast.success(`${rolFormulario === 'tecnico' ? 'Técnico' : 'Cajero'} "${form.nombreCompleto}" creado correctamente`);
        cerrarModal();
      } else {
        toast.error('Error al crear el usuario');
      }
    }
  };

  // ─── Eliminar ────────────────────────────────────────────────────────────────
  const handleEliminar = (u: Usuario) => {
    if (u.rol === 'super_usuario') { toast.error('No se puede eliminar el super usuario'); return; }
    if (u.id === usuarioActual?.id) { toast.error('No puedes eliminar tu propia cuenta'); return; }
    if (!window.confirm(`¿Eliminar a "${u.nombreCompleto}"? Esta acción no se puede deshacer.`)) return;
    if (eliminarUsuario(u.id)) toast.success('Personal eliminado');
    else toast.error('Error al eliminar');
  };

  // ─── Toggle activo/inactivo ──────────────────────────────────────────────────
  const handleToggleActivo = (u: Usuario) => {
    actualizarUsuario(u.id, { activo: !u.activo });
    toast.success(`${u.nombreCompleto} ${!u.activo ? 'activado' : 'desactivado'}`);
  };

  // ─── Helper de permiso con función tipada ────────────────────────────────────
  const setPermiso = (key: keyof PermisosUsuario, val: boolean) =>
    setPermisos(p => ({ ...p, [key]: val }));

  // ─── Color de tab ────────────────────────────────────────────────────────────
  const tabCls = (t: ModalTab) =>
    `px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${
      tabActivo === t
        ? 'bg-indigo-600 text-white shadow-lg'
        : darkMode
        ? 'text-gray-400 hover:text-white hover:bg-slate-700'
        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`;

  const dm = darkMode;

  return (
    <div className={`h-full overflow-y-auto ${dm ? 'bg-transparent' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto p-6 space-y-6 pb-10">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className={`rounded-2xl shadow-xl p-6 ${dm ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Users className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-black ${dm ? 'text-white' : 'text-gray-900'}`}>
                  Personal y Usuarios
                </h1>
                <p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                  Centro de control de equipo — acceso, roles y permisos
                </p>
              </div>
            </div>
            <Button
              onClick={abrirCrear}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold shadow-lg h-11 px-5 rounded-xl"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Nuevo Personal
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total Personal', value: usuarios.length, color: 'text-indigo-500' },
              { label: 'Activos', value: activos, color: 'text-emerald-500' },
              { label: 'Técnicos', value: tecnicos.length, color: 'text-cyan-500' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-3 ${dm ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                <p className={`text-xs font-semibold ${dm ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${dm ? 'bg-amber-900/15 border-amber-700/40' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            <Clock className={`w-5 h-5 mt-0.5 ${dm ? 'text-amber-400' : 'text-amber-700'}`} />
            <div>
              <p className={`text-sm font-bold ${dm ? 'text-amber-300' : 'text-amber-800'}`}>
                Retención de actividad del personal
              </p>
              <p className={`text-xs mt-0.5 ${dm ? 'text-amber-200/90' : 'text-amber-700'}`}>
                Se conservan detalles por {employeeActivityRetentionPolicy.visibleDays} días. Del día 31 al 35 aplica una ventana de gracia de 5 días antes de la depuración automática.
              </p>
            </div>
          </div>
        </div>

        {/* ── BUSCADOR ───────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, usuario, cédula o cargo…"
            className={`pl-10 h-11 rounded-2xl ${dm ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── SUPER USUARIO ─────────────────────────────────────────────── */}
        {superUsuario && (
          <Card className={`shadow-xl ${dm ? 'bg-gradient-to-br from-amber-900/30 to-orange-900/30 border-2 border-amber-700/50' : 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200'}`}>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <Crown className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <CardTitle className={`text-xl flex items-center gap-2 ${dm ? 'text-white' : 'text-gray-900'}`}>
                      {superUsuario.nombreCompleto}
                      <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 text-xs">
                        ADMINISTRADOR
                      </Badge>
                    </CardTitle>
                    <p className={`text-sm mt-0.5 ${dm ? 'text-gray-300' : 'text-gray-600'}`}>
                      @{superUsuario.username} · Cédula: {superUsuario.cedula}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => abrirEditar(superUsuario)}
                  variant="outline"
                  className={dm ? 'border-amber-600 text-amber-400 hover:bg-amber-900/20' : 'border-amber-300 hover:bg-amber-100'}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar Perfil
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* ── TARJETAS DE PERSONAL ──────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-bold flex items-center gap-2 ${dm ? 'text-white' : 'text-gray-900'}`}>
              <Shield className="w-5 h-5 text-indigo-500" />
              Personal Operativo ({cajerosFiltrados.length})
            </h2>
            {cargandoStats && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Actualizando...
              </div>
            )}
          </div>

          {cajerosFiltrados.length === 0 ? (
            <Card className={`border-dashed border-2 ${dm ? 'bg-slate-800/50 border-slate-600' : 'bg-white border-gray-300'}`}>
              <CardContent className="p-12 text-center">
                <Users className={`w-14 h-14 mx-auto mb-4 ${dm ? 'text-gray-600' : 'text-gray-400'}`} />
                <p className={`font-bold text-lg ${dm ? 'text-white' : 'text-gray-900'}`}>
                  {personalOperativo.length === 0 ? 'No hay personal registrado' : 'Sin resultados'}
                </p>
                <p className={`text-sm mt-1 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
                  {personalOperativo.length === 0 ? 'Crea tu primer cajero o técnico para comenzar' : 'Intenta con otro término de búsqueda'}
                </p>
                {personalOperativo.length === 0 && (
                  <Button onClick={abrirCrear} className="mt-4 bg-gradient-to-r from-indigo-600 to-purple-600">
                    <Plus className="w-4 h-4 mr-2" /> Crear Primer Usuario
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              <AnimatePresence>
                {cajerosFiltrados.map((cajero, i) => {
                  const stats = statsMap[cajero.id];
                  const esTecnico = cajero.rol === 'tecnico';
                  const gradiente = !cajero.activo
                    ? 'from-slate-500 to-slate-600'
                    : esTecnico
                    ? 'from-cyan-500 to-blue-600'
                    : 'from-indigo-500 to-purple-600';
                  const colorAccent = esTecnico ? 'text-cyan-400' : 'text-indigo-400';
                  const bgAccent   = esTecnico ? 'bg-cyan-500/10' : 'bg-indigo-500/10';
                  const borderAccent = esTecnico ? 'border-cyan-500/20' : 'border-indigo-500/20';

                  return (
                    <motion.div
                      key={cajero.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 260, damping: 22 }}
                    >
                      <div className={`rounded-2xl border shadow-lg overflow-hidden flex flex-col transition-all hover:shadow-xl ${
                        dm ? 'bg-slate-800 border-slate-700 hover:border-slate-500' : 'bg-white border-gray-200 hover:border-indigo-200'
                      }`}>

                        {/* ── Banda de color + avatar ── */}
                        <div className={`bg-gradient-to-r ${gradiente} px-5 py-4 flex items-center gap-4 relative`}>
                          {/* Indicador de turno activo */}
                          {stats?.turno?.activo && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              <span className="text-white text-[10px] font-bold">EN TURNO</span>
                            </div>
                          )}
                          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-black text-2xl shrink-0 shadow-lg">
                            {cajero.nombreCompleto.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-black text-base leading-tight truncate">
                              {cajero.nombreCompleto}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-white/80 text-xs font-semibold">
                                {esTecnico ? 'Técnico' : 'Cajero'}
                              </span>
                              {cajero.activo ? (
                                <span className="flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                  <div className="w-1 h-1 rounded-full bg-white" />
                                  ACTIVO
                                </span>
                              ) : (
                                <span className="bg-black/20 text-white/60 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                  INACTIVO
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Info del empleado ── */}
                        <div className={`px-5 py-3 flex flex-col gap-1.5 border-b ${dm ? 'border-slate-700' : 'border-gray-100'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-mono ${dm ? 'text-slate-400' : 'text-gray-500'}`}>
                              @{cajero.username}
                            </span>
                            <span className={`text-xs font-mono ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                              CC {cajero.cedula}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {cajero.cargo && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${bgAccent} ${colorAccent}`}>
                                <Briefcase className="w-3 h-3" />
                                {cajero.cargo}
                              </span>
                            )}
                            {cajero.telefono && (
                              <span className={`text-xs flex items-center gap-1 ${dm ? 'text-slate-400' : 'text-gray-500'}`}>
                                <Phone className="w-3 h-3" />
                                {cajero.telefono}
                              </span>
                            )}
                            {cajero.fechaContratacion && (
                              <span className={`text-xs flex items-center gap-1 ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                                <Calendar className="w-3 h-3" />
                                Desde {format(new Date(cajero.fechaContratacion), 'MMM yyyy', { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ── Stats del día ── */}
                        <div className={`px-5 py-3 grid grid-cols-3 gap-2 border-b ${dm ? 'border-slate-700' : 'border-gray-100'}`}>
                          <div className="text-center">
                            <p className={`text-[10px] font-semibold uppercase tracking-wide ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                              Ventas hoy
                            </p>
                            <p className={`text-xl font-black mt-0.5 ${colorAccent}`}>
                              {stats?.ventasHoy ?? 0}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className={`text-[10px] font-semibold uppercase tracking-wide ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                              Monto hoy
                            </p>
                            <p className={`text-sm font-black mt-0.5 ${dm ? 'text-white' : 'text-gray-900'}`}>
                              {fmtCOP(stats?.montoHoy ?? 0)}
                            </p>
                          </div>
                          <div className="text-center">
                            {stats?.turno?.activo ? (
                              <>
                                <p className={`text-[10px] font-semibold uppercase tracking-wide ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                                  En turno
                                </p>
                                <p className="text-sm font-black mt-0.5 text-emerald-500">
                                  {calcTiempoTurno(stats.turno.horaInicio)}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className={`text-[10px] font-semibold uppercase tracking-wide ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                                  Mes actual
                                </p>
                                <p className={`text-sm font-black mt-0.5 ${dm ? 'text-slate-300' : 'text-gray-700'}`}>
                                  {stats?.ventasMes ?? 0} vtas
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Botones de acción ── */}
                        <div className="px-4 py-3 flex items-center gap-2">
                          <button
                            onClick={() => setPanelActividad(cajero)}
                            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-bold transition-all ${bgAccent} ${colorAccent} hover:opacity-80 border ${borderAccent}`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Ver Actividad
                            <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                          </button>
                          <button
                            onClick={() => { setUsuarioModulos(cajero); setModalModulos(true); }}
                            title="Permisos de módulos"
                            className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${
                              dm ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => abrirEditar(cajero)}
                            title="Editar"
                            className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${
                              dm ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(cajero)}
                            title={cajero.activo ? 'Desactivar' : 'Activar'}
                            className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${
                              cajero.activo
                                ? dm ? 'border-emerald-600/40 text-emerald-400 hover:bg-emerald-900/20' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                : dm ? 'border-slate-600 text-slate-500 hover:bg-slate-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <Activity className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEliminar(cajero)}
                            title="Eliminar"
                            className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className={`text-xs ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
            Software diseñado por{' '}
            <a href="https://codecstudio.online/" target="_blank" rel="noopener noreferrer"
              className="font-semibold hover:text-indigo-500 transition-colors">
              CODEC ESTUDIO
            </a>
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL LATERAL — ACTIVIDAD DEL EMPLEADO
      ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {panelActividad && (() => {
          const stats = statsMap[panelActividad.id];
          const esTecnico = panelActividad.rol === 'tecnico';
          const gradiente = esTecnico ? 'from-cyan-500 to-blue-600' : 'from-indigo-500 to-purple-600';
          const colorAccent = esTecnico ? 'text-cyan-400' : 'text-indigo-400';
          const metodos = stats?.ventasPorMetodo ?? { efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, rappi: 0 };
          const totalMetodo = Object.values(metodos).reduce((s, v) => s + v, 0) || 1;
          const metodosLista = [
            { key: 'efectivo', label: 'Efectivo', icon: <Banknote className="w-3.5 h-3.5" />, color: 'bg-emerald-500' },
            { key: 'tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-3.5 h-3.5" />, color: 'bg-blue-500' },
            { key: 'nequi', label: 'Nequi', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-purple-500' },
            { key: 'daviplata', label: 'Daviplata', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-red-500' },
            { key: 'transferencia', label: 'Transf.', icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'bg-cyan-500' },
            { key: 'rappi', label: 'Rappi', icon: <Bike className="w-3.5 h-3.5" />, color: 'bg-orange-500' },
          ] as const;

          return (
            <>
              {/* Overlay */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[60]"
                onClick={() => setPanelActividad(null)}
              />
              {/* Panel lateral derecho */}
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className={`fixed right-0 top-0 h-full w-full max-w-sm z-[61] flex flex-col shadow-2xl overflow-hidden ${
                  dm ? 'bg-slate-900 border-l border-slate-700' : 'bg-white border-l border-gray-200'
                }`}
              >
                {/* Header del panel */}
                <div className={`bg-gradient-to-r ${gradiente} px-5 py-5 flex items-center gap-4 shrink-0`}>
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-black text-2xl shadow-lg">
                    {panelActividad.nombreCompleto.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-base truncate">{panelActividad.nombreCompleto}</p>
                    <p className="text-white/80 text-xs">
                      {esTecnico ? 'Técnico' : 'Cajero'} · @{panelActividad.username}
                    </p>
                    {panelActividad.cargo && (
                      <p className="text-white/70 text-xs mt-0.5">{panelActividad.cargo}</p>
                    )}
                  </div>
                  <button onClick={() => setPanelActividad(null)} className="p-2 rounded-xl hover:bg-white/10">
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  <div className="p-5 space-y-5">

                    <div className={`rounded-xl p-3.5 border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${dm ? 'text-slate-500' : 'text-gray-500'}`}>
                        Filtro de actividad
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className={`text-[10px] ${dm ? 'text-slate-400' : 'text-gray-500'}`}>Desde</Label>
                          <Input
                            type="date"
                            value={fechaActividadDesde}
                            onChange={(e) => setFechaActividadDesde(e.target.value)}
                            className={`h-8 text-xs ${dm ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                          />
                        </div>
                        <div>
                          <Label className={`text-[10px] ${dm ? 'text-slate-400' : 'text-gray-500'}`}>Hasta</Label>
                          <Input
                            type="date"
                            value={fechaActividadHasta}
                            onChange={(e) => setFechaActividadHasta(e.target.value)}
                            className={`h-8 text-xs ${dm ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => descargarReporteActividadPDF(panelActividad, logsActividadEmpleado)}
                          disabled={logsActividadEmpleado.length === 0}
                          className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-all ${
                            logsActividadEmpleado.length === 0
                              ? 'opacity-50 cursor-not-allowed bg-slate-400 text-white'
                              : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                        >
                          Descargar PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => descargarReporteActividadExcel(panelActividad, logsActividadEmpleado)}
                          disabled={logsActividadEmpleado.length === 0}
                          className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-all ${
                            logsActividadEmpleado.length === 0
                              ? 'opacity-50 cursor-not-allowed bg-slate-400 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          Descargar Excel
                        </button>
                      </div>
                    </div>

                    {/* Turno activo */}
                    {stats?.turno?.activo && (
                      <div className={`rounded-2xl p-4 border ${dm ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className={`text-xs font-bold uppercase tracking-wide ${dm ? 'text-emerald-400' : 'text-emerald-700'}`}>
                            Turno en curso
                          </span>
                        </div>
                        <p className={`text-2xl font-black ${dm ? 'text-white' : 'text-gray-900'}`}>
                          {calcTiempoTurno(stats.turno.horaInicio)}
                        </p>
                        <p className={`text-xs mt-1 ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          Inicio: {new Date(stats.turno.horaInicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          {stats.turno.baseInicial > 0 && ` · Base: ${fmtCOP(stats.turno.baseInicial)}`}
                        </p>
                      </div>
                    )}

                    {/* KPIs: Hoy vs Mes */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                        Rendimiento
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Ventas hoy', value: String(stats?.ventasHoy ?? 0), sub: 'transacciones', color: colorAccent },
                          { label: 'Monto hoy', value: fmtCOP(stats?.montoHoy ?? 0), sub: 'facturado', color: dm ? 'text-white' : 'text-gray-900' },
                          { label: 'Ventas mes', value: String(stats?.ventasMes ?? 0), sub: 'este mes', color: colorAccent },
                          { label: 'Monto mes', value: fmtCOP(stats?.montoMes ?? 0), sub: 'facturado', color: dm ? 'text-white' : 'text-gray-900' },
                        ].map(k => (
                          <div key={k.label} className={`rounded-xl p-3.5 border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                            <p className={`text-[10px] font-semibold uppercase tracking-wide ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                              {k.label}
                            </p>
                            <p className={`text-lg font-black mt-0.5 ${k.color}`}>{k.value}</p>
                            <p className={`text-[10px] ${dm ? 'text-slate-600' : 'text-gray-400'}`}>{k.sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Métodos de pago */}
                    {stats?.ventasMes > 0 && (
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                          Métodos de Pago (mes)
                        </p>
                        <div className="space-y-2">
                          {metodosLista.map(({ key, label, icon, color }) => {
                            const val = metodos[key];
                            if (!val) return null;
                            const pct = Math.round((val / totalMetodo) * 100);
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className={`flex items-center gap-1.5 text-xs font-semibold ${dm ? 'text-slate-300' : 'text-gray-600'}`}>
                                    {icon} {label}
                                  </div>
                                  <span className={`text-xs font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
                                    {fmtCOP(val)} <span className={`text-[10px] font-normal ${dm ? 'text-slate-500' : 'text-gray-400'}`}>({pct}%)</span>
                                  </span>
                                </div>
                                <div className={`h-1.5 rounded-full ${dm ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                  <motion.div
                                    initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5, delay: 0.1 }}
                                    className={`h-full rounded-full ${color}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Historial de actividad de turnos */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                        Historial de Actividad ({logsActividadEmpleado.length})
                      </p>
                      {!logsActividadEmpleado.length ? (
                        <div className={`rounded-xl p-6 text-center ${dm ? 'bg-slate-800' : 'bg-gray-50'}`}>
                          <BarChart3 className={`w-8 h-8 mx-auto mb-2 ${dm ? 'text-slate-600' : 'text-gray-300'}`} />
                          <p className={`text-xs ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                            Sin actividad en el rango seleccionado
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {logsActividadEmpleado.map((log) => {
                            const apertura = log.aperturaISO ? new Date(log.aperturaISO) : null;
                            const cierre = log.cierreISO ? new Date(log.cierreISO) : null;
                            return (
                            <div key={log.id} className={`rounded-xl p-3 border flex items-start justify-between gap-3 ${
                              dm ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs font-bold truncate ${dm ? 'text-white' : 'text-gray-900'}`}>
                                  {log.fecha}
                                </p>
                                <p className={`text-[10px] ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                                  Apertura: {apertura ? format(apertura, 'HH:mm', { locale: es }) : '-'} ·
                                  Cierre: {cierre ? format(cierre, 'HH:mm', { locale: es }) : 'Turno abierto'}
                                </p>
                                <p className={`text-[10px] ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                                  Tx: {Number(log.totalTransacciones) || 0} · Efectivo: {fmtCOP(Number(log.resumenOperaciones?.efectivo) || 0)} · Tarjeta: {fmtCOP(Number(log.resumenOperaciones?.tarjeta) || 0)}
                                </p>
                              </div>
                              <span className="text-emerald-500 font-black text-sm shrink-0">
                                {fmtCOP(Number(log.totalVentas) || 0)}
                              </span>
                            </div>
                          );})}
                        </div>
                      )}
                    </div>

                    {/* Info adicional */}
                    <div className={`rounded-xl p-4 border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${dm ? 'text-slate-500' : 'text-gray-400'}`}>
                        Información Laboral
                      </p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className={dm ? 'text-slate-400' : 'text-gray-500'}>Cédula</span>
                          <span className={`font-mono font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>{panelActividad.cedula}</span>
                        </div>
                        {panelActividad.salario != null && (
                          <div className="flex justify-between text-xs">
                            <span className={dm ? 'text-slate-400' : 'text-gray-500'}>Salario</span>
                            <span className={`font-bold text-emerald-500`}>{fmtCOP(panelActividad.salario)}</span>
                          </div>
                        )}
                        {panelActividad.fechaContratacion && (
                          <div className="flex justify-between text-xs">
                            <span className={dm ? 'text-slate-400' : 'text-gray-500'}>Contratación</span>
                            <span className={`font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
                              {format(new Date(panelActividad.fechaContratacion), "d 'de' MMMM, yyyy", { locale: es })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className={dm ? 'text-slate-400' : 'text-gray-500'}>Estado cuenta</span>
                          <span className={`font-bold ${panelActividad.activo ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {panelActividad.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Acciones rápidas del panel */}
                <div className={`p-4 border-t flex gap-2 shrink-0 ${dm ? 'border-slate-700' : 'border-gray-200'}`}>
                  <button
                    onClick={() => { setPanelActividad(null); abrirEditar(panelActividad); }}
                    className={`flex-1 h-10 flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ${
                      esTecnico ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-indigo-600 hover:bg-indigo-700'
                    } text-white`}
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar Perfil
                  </button>
                  <button
                    onClick={() => { setPanelActividad(null); setUsuarioModulos(panelActividad); setModalModulos(true); }}
                    className={`flex-1 h-10 flex items-center justify-center gap-2 rounded-xl text-xs font-bold border transition-all ${
                      dm ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" /> Módulos
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL CREAR / EDITAR PERSONAL
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalAbierto} onOpenChange={open => { if (!open) cerrarModal(); }}>
        <DialogContent className={`max-w-xl max-h-[90vh] overflow-y-auto ${dm ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={`text-xl font-black flex items-center gap-2 ${dm ? 'text-white' : 'text-gray-900'}`}>
              {modoEdicion ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <UserPlus className="w-5 h-5 text-indigo-500" />}
              {modoEdicion ? `Editar — ${usuarioEditando?.nombreCompleto}` : 'Nuevo Personal'}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs del modal */}
          <div className={`flex gap-1.5 p-1 rounded-xl ${dm ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <button className={tabCls('info')} onClick={() => setTabActivo('info')}>
              <IdCard className="w-3.5 h-3.5 inline mr-1.5" />
              Datos Laborales
            </button>
            <button className={tabCls('acceso')} onClick={() => setTabActivo('acceso')}>
              <Lock className="w-3.5 h-3.5 inline mr-1.5" />
              Acceso
            </button>
            {(modoEdicion && (usuarioEditando?.rol === 'cajero' || usuarioEditando?.rol === 'tecnico')) || !modoEdicion ? (
              <button className={tabCls('permisos')} onClick={() => setTabActivo('permisos')}>
                <Shield className="w-3.5 h-3.5 inline mr-1.5" />
                Permisos
              </button>
            ) : null}
          </div>

          <form onSubmit={handleGuardar} className="space-y-4 mt-2">

            {/* ── TAB: DATOS LABORALES ──────────────────────────────────── */}
            {tabActivo === 'info' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>Nombre Completo *</Label>
                    <Input
                      value={form.nombreCompleto}
                      onChange={e => setForm(f => ({ ...f, nombreCompleto: e.target.value }))}
                      placeholder="Ej: María López"
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>Cédula *</Label>
                    <Input
                      value={form.cedula}
                      onChange={e => setForm(f => ({ ...f, cedula: e.target.value.replace(/\D/g, '') }))}
                      placeholder="1234567890"
                      maxLength={10}
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>
                      <Briefcase className="w-3.5 h-3.5 inline mr-1" />
                      Cargo
                    </Label>
                    <Input
                      value={form.cargo}
                      onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                      placeholder="Ej: Cajera, Operaria"
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      Teléfono
                    </Label>
                    <Input
                      value={form.telefono}
                      onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                      placeholder="311 555 0000"
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>
                      <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                      Salario Mensual (COP)
                    </Label>
                    <Input
                      value={form.salario}
                      onChange={e => setForm(f => ({ ...f, salario: e.target.value.replace(/\D/g, '') }))}
                      placeholder="1800000"
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>
                      <Calendar className="w-3.5 h-3.5 inline mr-1" />
                      Fecha de Contratación
                    </Label>
                    <Input
                      type="date"
                      value={form.fechaContratacion}
                      onChange={e => setForm(f => ({ ...f, fechaContratacion: e.target.value }))}
                      className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                    />
                  </div>

                  {!modoEdicion && (
                    <div className="col-span-2 space-y-1.5">
                      <Label className={dm ? 'text-gray-300' : ''}>
                        <Wrench className="w-3.5 h-3.5 inline mr-1" />
                        Rol del sistema *
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: 'cajero', label: 'Cajero / Operario', desc: 'Ventas y caja' },
                          { value: 'tecnico', label: 'Técnico', desc: 'Taller de reparaciones' },
                        ] as const).map(r => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setRolFormulario(r.value)}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                              rolFormulario === r.value
                                ? r.value === 'tecnico'
                                  ? 'border-cyan-500 bg-cyan-500/10'
                                  : 'border-indigo-500 bg-indigo-500/10'
                                : dm
                                ? 'border-slate-600 bg-slate-800 hover:border-slate-500'
                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            <p className={`text-sm font-bold ${
                              rolFormulario === r.value
                                ? r.value === 'tecnico' ? 'text-cyan-400' : 'text-indigo-400'
                                : dm ? 'text-white' : 'text-gray-900'
                            }`}>{r.label}</p>
                            <p className={`text-xs mt-0.5 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>{r.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: ACCESO ───────────────────────────────────────────── */}
            {tabActivo === 'acceso' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className={dm ? 'text-gray-300' : ''}>
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    Nombre de Usuario *
                  </Label>
                  <Input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    placeholder="Ej: mlopez"
                    className={`h-11 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                  />
                </div>

                {!modoEdicion ? (
                  <div className="space-y-1.5">
                    <Label className={dm ? 'text-gray-300' : ''}>
                      <Lock className="w-3.5 h-3.5 inline mr-1" />
                      Contraseña / PIN *
                    </Label>
                    <div className="relative">
                      <Input
                        type={mostrarPass ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Mínimo 4 caracteres"
                        className={`h-11 pr-10 ${dm ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                      />
                      <button type="button" tabIndex={-1}
                        onClick={() => setMostrarPass(!mostrarPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {mostrarPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl space-y-3 ${dm ? 'bg-slate-800' : 'bg-gray-50'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                      Cambiar Contraseña (opcional)
                    </p>
                    <div className="space-y-1.5">
                      <Label className={`text-xs ${dm ? 'text-gray-300' : ''}`}>Contraseña Actual</Label>
                      <div className="relative">
                        <Input
                          type={mostrarPass ? 'text' : 'password'}
                          value={form.passwordAnterior}
                          onChange={e => setForm(f => ({ ...f, passwordAnterior: e.target.value }))}
                          placeholder="Contraseña actual"
                          className={`h-10 pr-9 ${dm ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setMostrarPass(!mostrarPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          {mostrarPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={`text-xs ${dm ? 'text-gray-300' : ''}`}>Nueva Contraseña</Label>
                      <div className="relative">
                        <Input
                          type={mostrarPassNueva ? 'text' : 'password'}
                          value={form.passwordNueva}
                          onChange={e => setForm(f => ({ ...f, passwordNueva: e.target.value }))}
                          placeholder="Nueva contraseña"
                          className={`h-10 pr-9 ${dm ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setMostrarPassNueva(!mostrarPassNueva)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          {mostrarPassNueva ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: PERMISOS OPERACIONALES ───────────────────────────── */}
            {tabActivo === 'permisos' && (
              <div className="space-y-4">

                {/* ─── CAJA (siempre visible, es universal) ─── */}
                <SeccionPermisos titulo="Caja" icono={<Wallet className="w-4 h-4 text-amber-500" />} dm={dm}>
                  <PermisoRow
                    label="Ver Faltante en Caja en tiempo real"
                    desc="Si está desactivado, el cajero registra el conteo pero no ve la diferencia — solo aparece en el reporte impreso."
                    value={permisos.verFaltanteCaja ?? false}
                    onChange={v => setPermiso('verFaltanteCaja', v)}
                    darkMode={dm}
                  />
                  <PermisoRow
                    label="Modificar Base de Apertura"
                    desc="Permite editar el monto inicial de caja al abrir turno."
                    value={permisos.modificarBaseApertura ?? false}
                    onChange={v => setPermiso('modificarBaseApertura', v)}
                    darkMode={dm}
                  />
                </SeccionPermisos>

                {/* ─── PANADERÍA / ONCES (solo si el módulo está activo globalmente) ─── */}
                {modulosActivos.panaderia && (
                  <SeccionPermisos titulo="Panadería y Onces" icono={<Coffee className="w-4 h-4 text-amber-700" />} dm={dm}>
                    <PermisoRow
                      label="Acceso a Ventas"
                      desc="Puede operar el módulo y registrar ventas de onces y panadería."
                      value={permisos.panaderiaVentas ?? true}
                      onChange={v => setPermiso('panaderiaVentas', v)}
                      darkMode={dm}
                    />
                    <PermisoRow
                      label="Administrar Categorías y Productos"
                      desc="Puede crear, editar y eliminar productos y categorías del módulo."
                      value={permisos.panaderiaCategorias ?? false}
                      onChange={v => setPermiso('panaderiaCategorias', v)}
                      darkMode={dm}
                    />
                    <PermisoRow
                      label="Registrar Mermas e Ingredientes"
                      desc="Puede dar de baja ingredientes o registrar pérdidas de inventario."
                      value={permisos.panaderiaMermas ?? false}
                      onChange={v => setPermiso('panaderiaMermas', v)}
                      darkMode={dm}
                    />
                  </SeccionPermisos>
                )}

                {/* ─── TALLER DE REPARACIONES (solo si el módulo está activo globalmente) ─── */}
                {modulosActivos.taller && (
                  <SeccionPermisos titulo="Taller de Reparaciones" icono={<Wrench className="w-4 h-4 text-cyan-500" />} dm={dm}>
                    <PermisoRow
                      label="Crear Órdenes de Reparación"
                      desc="Puede registrar nuevas órdenes de trabajo para equipos o dispositivos."
                      value={permisos.tallerCrearOrdenes ?? true}
                      onChange={v => setPermiso('tallerCrearOrdenes', v)}
                      darkMode={dm}
                    />
                    <PermisoRow
                      label="Editar Precios y Presupuestos"
                      desc="Puede modificar el valor cobrado por cada reparación."
                      value={permisos.tallerEditarPrecios ?? false}
                      onChange={v => setPermiso('tallerEditarPrecios', v)}
                      darkMode={dm}
                    />
                  </SeccionPermisos>
                )}

                {/* ─── Mensaje cuando no hay módulos opcionales activos ─── */}
                {!modulosActivos.panaderia && !modulosActivos.taller && (
                  <div className={`rounded-xl p-5 text-center ${dm ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-dashed border-gray-300'}`}>
                    <LayoutGrid className={`w-8 h-8 mx-auto mb-2 ${dm ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p className={`text-sm font-semibold ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                      No hay módulos adicionales activos
                    </p>
                    <p className={`text-xs mt-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
                      Activa módulos (Panadería, Taller, etc.) desde el Panel de Desarrollador para configurar sus permisos aquí.
                    </p>
                  </div>
                )}

                {/* ─── Módulos del Sidebar ─── */}
                <div className={`rounded-xl p-4 ${dm ? 'bg-indigo-950/40 border border-indigo-800/40' : 'bg-indigo-50 border border-indigo-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ToggleLeft className="w-4 h-4 text-indigo-500" />
                    <h4 className={`font-bold text-sm ${dm ? 'text-white' : 'text-gray-900'}`}>Módulos del Sidebar</h4>
                  </div>
                  <p className={`text-xs mb-3 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
                    Controla qué secciones ve este usuario en el menú lateral al iniciar sesión.
                  </p>
                  {modoEdicion && usuarioEditando ? (
                    <Button
                      type="button"
                      onClick={() => { setUsuarioModulos(usuarioEditando); setModalModulos(true); }}
                      variant="outline"
                      className={`w-full h-10 rounded-xl font-semibold ${dm ? 'border-indigo-600 text-indigo-400 hover:bg-indigo-900/30' : 'border-indigo-400 text-indigo-600 hover:bg-indigo-50'}`}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Abrir Panel de Módulos →
                    </Button>
                  ) : (
                    <p className={`text-xs italic ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                      Guarda primero el usuario para configurar módulos del sidebar.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div className={`flex gap-3 pt-4 border-t ${dm ? 'border-slate-700' : 'border-gray-200'}`}>
              <Button type="button" variant="outline" onClick={cerrarModal} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 font-bold">
                <Save className="w-4 h-4 mr-2" />
                {modoEdicion ? 'Guardar Cambios' : 'Crear Personal'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL DE MÓDULOS DEL SIDEBAR (existente)
      ═══════════════════════════════════════════════════════════════════ */}
      {modalModulos && usuarioModulos && (
        <PermisosUsuarioModal
          userId={usuarioModulos.id}
          userName={usuarioModulos.nombreCompleto}
          userRole={usuarioModulos.rol}
          onClose={() => { setModalModulos(false); setUsuarioModulos(null); }}
        />
      )}
    </div>
  );
}
