/**
 * PANEL DE DESARROLLADOR - CODEC POS v2.0
 * Acceso exclusivo para gestión de licencias y clientes
 * Solo accesible con credenciales de desarrollador
 *
 * MATRIZ DE PRECIOS INTERNA (NO VISIBLE EN UI):
 * ┌─────────┬──────────┬─────────────┬──────────┬────────────┐
 * │ Plan    │ 1 Mes    │ 3 Meses     │ 1 Año    │ Vitalicio  │
 * ├─────────┼──────────┼─────────────┼──────────┼────────────┤
 * │ BÁSICO  │ $70.000  │ $180.000    │ $450.000 │ $1.950.000 │
 * │ PREMIUM │ $90.000  │ $240.000    │ $850.000 │ $3.200.000 │
 * └─────────┴──────────┴─────────────┴──────────┴────────────┘
 * Mantenimiento: $60.000
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Shield,
  Users,
  Crown,
  Zap,
  CheckCircle2,
  Copy,
  Trash2,
  Edit,
  Plus,
  Lock,
  Unlock,
  Search,
  AlertTriangle,
  Clock,
  Infinity,
  Settings,
  Power,
  RefreshCw,
  Calendar,
  XCircle,
  PauseCircle,
  TrendingUp,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { hashPassword, verificarPassword } from '../../lib/passwordHash';
import { useNavigate } from 'react-router';
import ModulosControlPanel from './ModulosControlPanel';
import { ClienteModulosPanel } from './ClienteModulosPanel';
import { PersonalAdminSection } from './PersonalAdminSection';
import { SistemaBlindajePanel } from './SistemaBlindajePanel';
import { AnimatePresence } from 'motion/react';
import { MODULOS_CATALOGO, MODULOS_CLIENTE_OFICIALES, ModuloPOS } from '../../lib/permissions';
import {
  listarClientesAdmin,
  crearClienteAdmin,
  actualizarClienteAdmin,
  eliminarClienteAdmin,
  cambiarEstadoClienteAdmin,
  actualizarModulosClienteAdmin,
  ClienteAdmin,
} from '../../lib/supabase/clientesAdminService';

// Cliente = fila real de clientes_pos + usuarios_clientes en Supabase (ver
// clientesAdminService.ts) — este panel ya no gestiona datos locales/demo.
type Cliente = ClienteAdmin;

type FilterEstado = 'TODOS' | 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA';
type FilterPlan = 'TODOS' | 'BASICO' | 'PREMIUM';
type SortBy = 'nombre' | 'expiracion' | 'creacion';

interface DaysInfo {
  dias: number;
  total: number;
  pct: number;
  colorBar: string;
  colorText: string;
  urgente: boolean;
}

function getDiasRestantes(cliente: Cliente): DaysInfo | null {
  if (cliente.duracion === 'VITALICIA' || !cliente.fechaExpiracion) return null;
  const now = Date.now();
  const expiry = new Date(cliente.fechaExpiracion).getTime();
  const activation = new Date(cliente.fechaActivacion).getTime();
  const dias = Math.max(0, Math.ceil((expiry - now) / 86_400_000));
  const total = Math.max(1, Math.ceil((expiry - activation) / 86_400_000));
  const pct = Math.min(100, Math.max(0, (dias / total) * 100));
  if (dias === 0) return { dias, total, pct, colorBar: 'bg-red-500', colorText: 'text-red-500', urgente: true };
  if (dias <= 7)  return { dias, total, pct, colorBar: 'bg-red-400',   colorText: 'text-red-400',   urgente: true  };
  if (dias <= 15) return { dias, total, pct, colorBar: 'bg-amber-400', colorText: 'text-amber-500', urgente: true  };
  if (dias <= 30) return { dias, total, pct, colorBar: 'bg-yellow-400', colorText: 'text-yellow-600', urgente: false };
  return { dias, total, pct, colorBar: 'bg-emerald-500', colorText: 'text-emerald-600', urgente: false };
}


export function DeveloperPanel() {
  const { darkMode } = usePOS();
  const { estaAutenticado, esDesarrollador, usuario, usuarioActual } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'clientes' | 'modulos' | 'personal' | 'seguridad' | 'sistema'>('clientes');

  // Protección de respaldo (el gate real ya ocurrió en DeveloperRouteGuard vía
  // StaffLoginGate + Supabase Auth): si por alguna razón se renderiza este
  // componente sin `esDesarrollador`, saca al usuario inmediatamente.
  useEffect(() => {
    if (!esDesarrollador) {
      navigate(estaAutenticado ? '/pos' : '/login', { replace: true });
    }
  }, [estaAutenticado, esDesarrollador, navigate]);

  // ── Estado general ──
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<FilterEstado>('TODOS');
  const [filterPlan, setFilterPlan] = useState<FilterPlan>('TODOS');
  const [sortBy, setSortBy] = useState<SortBy>('creacion');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // ── Modal crear/editar ──
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [clienteModulos, setClienteModulos] = useState<Cliente | null>(null);

  const [formData, setFormData] = useState({
    nombreNegocio: '',
    nit: '',
    contacto: '',
    telefono: '',
    email: '',
    usuario: '',
    contraseña: '',
    plan: 'BASICO' as 'BASICO' | 'PREMIUM',
    duracion: '1_ANO' as '1_MES' | '3_MESES' | '1_ANO' | 'VITALICIA',
    activarPrueba: false,
    diasPrueba: 7,
  });
  const [modulosSeleccionados, setModulosSeleccionados] = useState<Set<ModuloPOS>>(new Set());

  // ── Seguridad ──
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const modulosClienteDisponibles = MODULOS_CATALOGO.filter(m =>
    MODULOS_CLIENTE_OFICIALES.includes(m.id),
  );

  const construirModulosPorPlan = (plan: 'BASICO' | 'PREMIUM') =>
    modulosClienteDisponibles
      .filter(m => (plan === 'PREMIUM' ? true : m.planRequerido === 'basico'))
      .map(m => m.id);

  // ── Guardar clientes ──
  const [cargandoClientes, setCargandoClientes] = useState(true);

  const cargarClientes = async () => {
    setCargandoClientes(true);
    try {
      const lista = await listarClientesAdmin();
      setClientes(lista);
    } catch (error) {
      toast.error('No se pudieron cargar los clientes', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCargandoClientes(false);
    }
  };

  // ── Cargar clientes reales desde Supabase (clientes_pos + usuarios_clientes) ──
  useEffect(() => {
    cargarClientes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers de fecha ──
  const calcularNuevaExpiracion = (desde: number, duracion: Cliente['duracion']): string | undefined => {
    if (duracion === 'VITALICIA') return undefined;
    if (duracion === '1_MES')    return new Date(desde + 30  * 86_400_000).toISOString();
    if (duracion === '3_MESES')  return new Date(desde + 90  * 86_400_000).toISOString();
    return new Date(desde + 365 * 86_400_000).toISOString();
  };

  // ── Renovar licencia (extiende desde la fecha de expiración actual o desde hoy si ya venció) ──
  const handleRenovar = async (id: string) => {
    const c = clientes.find(x => x.id === id);
    if (!c) return;
    const base = c.fechaExpiracion && new Date(c.fechaExpiracion).getTime() > Date.now()
      ? new Date(c.fechaExpiracion).getTime()
      : Date.now();
    const nuevaFecha = calcularNuevaExpiracion(base, c.duracion);
    try {
      await cambiarEstadoClienteAdmin(id, 'ACTIVA', undefined, nuevaFecha);
      setClientes(prev => prev.map(x => x.id === id ? { ...x, estado: 'ACTIVA', fechaExpiracion: nuevaFecha } : x));
      toast.success('Licencia renovada', {
        description: nuevaFecha
          ? `Nueva expiración: ${new Date(nuevaFecha).toLocaleDateString('es-CO')}`
          : 'Licencia vitalicia',
      });
    } catch (error) {
      toast.error('No se pudo renovar la licencia', { description: error instanceof Error ? error.message : undefined });
    }
  };

  // ── Crear / Editar cliente ──
  const handleCreateCliente = async () => {
    if (!formData.nombreNegocio.trim()) { toast.error('El nombre del negocio es requerido'); return; }
    if (!formData.usuario.trim() || formData.usuario.length < 4) { toast.error('El usuario debe tener al menos 4 caracteres'); return; }
    if (!formData.contraseña.trim() || formData.contraseña.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (clientes.some(c => c.usuario === formData.usuario && c.id !== editingCliente?.id)) {
      toast.error('El usuario ya existe');
      return;
    }

    const fechaActivacion = new Date().toISOString();
    let fechaExpiracion: string | undefined;
    let enPrueba = false;
    let diasPruebaRestantes = 0;

    if (formData.activarPrueba) {
      fechaExpiracion = new Date(Date.now() + formData.diasPrueba * 86_400_000).toISOString();
      enPrueba = true;
      diasPruebaRestantes = formData.diasPrueba;
    } else {
      fechaExpiracion = calcularNuevaExpiracion(Date.now(), formData.duracion);
    }

    const modulosActivosArr = Array.from(modulosSeleccionados);

    const datos = {
      ...formData,
      fechaActivacion,
      fechaExpiracion,
      estado: (editingCliente?.estado || 'ACTIVA') as Cliente['estado'],
      enPrueba,
      diasPruebaRestantes,
      modulosActivos: modulosActivosArr,
    };

    try {
      if (editingCliente) {
        const actualizado = await actualizarClienteAdmin(editingCliente.id, datos);
        setClientes(prev => prev.map(c => c.id === editingCliente.id ? actualizado : c));
        toast.success('Cliente actualizado correctamente');
      } else {
        const nuevo = await crearClienteAdmin(datos);
        setClientes(prev => [nuevo, ...prev]);
        toast.success(enPrueba ? `Prueba de ${formData.diasPrueba} días activada` : 'Cliente creado exitosamente', {
          description: enPrueba && fechaExpiracion
            ? `Expira el ${new Date(fechaExpiracion).toLocaleDateString('es-CO')}`
            : `Plan ${formData.plan}`,
        });
      }
      setShowModal(false);
      resetForm();
    } catch (error) {
      toast.error('No se pudo guardar el cliente', { description: error instanceof Error ? error.message : undefined });
    }
  };

  const resetForm = () => {
    setFormData({ nombreNegocio: '', nit: '', contacto: '', telefono: '', email: '', usuario: '', contraseña: '', plan: 'BASICO', duracion: '1_ANO', activarPrueba: false, diasPrueba: 7 });
    setEditingCliente(null);
    setModulosSeleccionados(new Set(construirModulosPorPlan('BASICO')));
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setFormData({
      nombreNegocio: cliente.nombreNegocio, nit: cliente.nit, contacto: cliente.contacto,
      telefono: cliente.telefono, email: cliente.email, usuario: cliente.usuario,
      contraseña: cliente.contraseña, plan: cliente.plan, duracion: cliente.duracion,
      activarPrueba: cliente.enPrueba || false, diasPrueba: cliente.diasPruebaRestantes || 7,
    });
    setModulosSeleccionados(
      cliente.modulosActivos ? new Set(cliente.modulosActivos as ModuloPOS[]) : new Set(construirModulosPorPlan(cliente.plan))
    );
    setShowModal(true);
  };

  useEffect(() => {
    if (showModal && !editingCliente) setModulosSeleccionados(new Set(construirModulosPorPlan(formData.plan)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, editingCliente, formData.plan]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
    try {
      await eliminarClienteAdmin(id);
      setClientes(prev => prev.filter(c => c.id !== id));
      toast.success('Cliente eliminado');
    } catch (error) {
      toast.error('No se pudo eliminar el cliente', { description: error instanceof Error ? error.message : undefined });
    }
  };

  const toggleEstado = async (id: string) => {
    const c = clientes.find(x => x.id === id);
    if (!c) return;
    try {
      if (c.estado === 'ACTIVA') {
        await cambiarEstadoClienteAdmin(id, 'SUSPENDIDA');
        setClientes(prev => prev.map(x => x.id === id ? { ...x, estado: 'SUSPENDIDA' } : x));
        toast.info('Licencia suspendida');
      } else {
        const nuevaFecha = calcularNuevaExpiracion(Date.now(), c.duracion);
        const nuevaActivacion = new Date().toISOString();
        await cambiarEstadoClienteAdmin(id, 'ACTIVA', nuevaActivacion, nuevaFecha);
        setClientes(prev => prev.map(x => x.id === id ? { ...x, estado: 'ACTIVA', fechaActivacion: nuevaActivacion, fechaExpiracion: nuevaFecha } : x));
        toast.success('Licencia reactivada');
      }
    } catch (error) {
      toast.error('No se pudo cambiar el estado', { description: error instanceof Error ? error.message : undefined });
    }
  };

  const copiarCredenciales = (cliente: Cliente) => {
    const texto = `🔐 CREDENCIALES CODEC POS v2.0\n\nNegocio: ${cliente.nombreNegocio}\n👤 Usuario: ${cliente.usuario}\n🔑 Contraseña: ${cliente.contraseña}\n\nEstado: ${cliente.estado}\nActivado: ${new Date(cliente.fechaActivacion).toLocaleDateString('es-CO')}\n${cliente.fechaExpiracion ? `Expira: ${new Date(cliente.fechaExpiracion).toLocaleDateString('es-CO')}` : 'Licencia Vitalicia'}\n\n---\nDesarrollado por Codec Studio`;
    navigator.clipboard.writeText(texto.trim());
    toast.success('Credenciales copiadas al portapapeles');
  };

  // ── Filtrado y ordenamiento ──
  const clientesFiltrados = clientes
    .filter(c => {
      const matchSearch = c.nombreNegocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.nit.includes(searchTerm);
      const matchEstado = filterEstado === 'TODOS' || c.estado === filterEstado;
      const matchPlan = filterPlan === 'TODOS' || c.plan === filterPlan;
      return matchSearch && matchEstado && matchPlan;
    })
    .sort((a, b) => {
      if (sortBy === 'nombre') return a.nombreNegocio.localeCompare(b.nombreNegocio);
      if (sortBy === 'expiracion') {
        const ea = a.fechaExpiracion ? new Date(a.fechaExpiracion).getTime() : Infinity;
        const eb = b.fechaExpiracion ? new Date(b.fechaExpiracion).getTime() : Infinity;
        return ea - eb;
      }
      return b.createdAt - a.createdAt;
    });

  // ── Estadísticas ──
  const ahora = Date.now();
  const stats = {
    total: clientes.length,
    activas: clientes.filter(c => c.estado === 'ACTIVA').length,
    porVencer: clientes.filter(c => {
      if (c.estado !== 'ACTIVA' || !c.fechaExpiracion) return false;
      const dias = Math.ceil((new Date(c.fechaExpiracion).getTime() - ahora) / 86_400_000);
      return dias >= 0 && dias <= 15;
    }).length,
    vencidas: clientes.filter(c => c.estado === 'VENCIDA').length,
    suspendidas: clientes.filter(c => c.estado === 'SUSPENDIDA').length,
  };

  const SORT_LABELS: Record<SortBy, string> = { nombre: 'Nombre A-Z', expiracion: 'Próxima expiración', creacion: 'Más recientes' };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative min-h-screen max-h-screen overflow-y-auto p-6 ${
        darkMode
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'
          : 'bg-gradient-to-br from-gray-50 via-purple-50/30 to-indigo-50/30'
      }`}
      style={{ scrollbarWidth: 'thin', scrollbarColor: darkMode ? '#6366f1 #1e293b' : '#8b5cf6 #e0e7ff' }}
    >
      {/* Glow decorativo de fondo — solo modo oscuro, no interfiere con el contenido */}
      {darkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] bg-purple-600/10 rounded-full blur-[100px]" />
          <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] bg-indigo-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-emerald-600/5 rounded-full blur-[100px]" />
        </div>
      )}

      <div className="relative max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-center justify-between rounded-3xl p-5 ${
            darkMode
              ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20'
              : 'bg-white border border-gray-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-600/30 ring-1 ring-white/10">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-black tracking-tight ${
                darkMode ? 'bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent' : 'text-gray-900'
              }`}>Panel de Administración</h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Gestión de clientes y licencias — CODEC POS v2.0</p>
              {usuario && (
                <p className={`text-xs font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {usuario.nombreCompleto} (@{usuario.username})
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={() => { if (confirm('¿Cerrar sesión?')) navigate('/login', { replace: true }); }}
            variant="outline"
            className={darkMode
              ? 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/50'
              : 'border-red-500 text-red-600 hover:bg-red-50'}
          >
            <Power className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </motion.div>

        {/* ── Estadísticas ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-3"
        >
          {[
            { label: 'Total Clientes',   value: stats.total,       icon: Users,        color: 'text-purple-400',  glow: 'bg-purple-500/10',  ring: 'ring-purple-500/20' },
            { label: 'Activas',          value: stats.activas,     icon: CheckCircle2, color: 'text-emerald-400', glow: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
            { label: 'Por Vencer',       value: stats.porVencer,   icon: AlertTriangle, color: 'text-amber-400',  glow: 'bg-amber-500/10',   ring: stats.porVencer > 0 ? 'ring-amber-500/40' : 'ring-amber-500/20' },
            { label: 'Vencidas',         value: stats.vencidas,    icon: XCircle,      color: 'text-red-400',     glow: 'bg-red-500/10',     ring: stats.vencidas > 0 ? 'ring-red-500/40' : 'ring-red-500/20' },
            { label: 'Suspendidas',      value: stats.suspendidas, icon: PauseCircle,  color: 'text-orange-400',  glow: 'bg-orange-500/10',  ring: 'ring-orange-500/20' },
          ].map(({ label, value, icon: Icon, color, glow, ring }) => (
            <Card
              key={label}
              className={`border-0 transition-all hover:-translate-y-0.5 ${
                darkMode
                  ? `bg-white/[0.03] backdrop-blur-xl ring-1 ${ring} shadow-lg shadow-black/10`
                  : 'bg-white border border-gray-200'
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{label}</p>
                    <p className={`text-2xl font-black ${darkMode ? color : color.replace('400', '600')}`}>{value}</p>
                  </div>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${darkMode ? glow : 'bg-gray-50'}`}>
                    <Icon className={`w-5 h-5 ${darkMode ? color : color.replace('400', '600')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* ── Tabs ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className={`inline-flex flex-wrap gap-1 p-1.5 rounded-2xl ${
            darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white border border-gray-200'
          }`}>
            {([
              { id: 'clientes',  icon: Users,       label: 'Gestión de Clientes' },
              { id: 'modulos',   icon: Settings,    label: 'Control de Módulos' },
              { id: 'personal',  icon: Shield,      label: 'Personal del Sistema' },
              { id: 'sistema',   icon: ShieldCheck, label: 'Sistema y Blindaje' },
              { id: 'seguridad', icon: Lock,        label: 'Seguridad' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-600/30"
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
                  />
                )}
                <tab.icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════════════════
            TAB: CLIENTES
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'clientes' && (
          <>
            {/* Barra de búsqueda y filtros */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className={darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white'}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Búsqueda */}
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                      <Input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar por negocio, usuario o NIT..."
                        className={`pl-9 ${darkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500' : ''}`}
                      />
                    </div>

                    {/* Filtro estado */}
                    <select
                      value={filterEstado}
                      onChange={e => setFilterEstado(e.target.value as FilterEstado)}
                      className={`h-10 px-3 rounded-xl border text-sm ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                    >
                      <option value="TODOS">Todos los estados</option>
                      <option value="ACTIVA">Activas</option>
                      <option value="VENCIDA">Vencidas</option>
                      <option value="SUSPENDIDA">Suspendidas</option>
                    </select>

                    {/* Filtro plan */}
                    <select
                      value={filterPlan}
                      onChange={e => setFilterPlan(e.target.value as FilterPlan)}
                      className={`h-10 px-3 rounded-xl border text-sm ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                    >
                      <option value="TODOS">Todos los planes</option>
                      <option value="BASICO">Solo Básico</option>
                      <option value="PREMIUM">Solo Premium</option>
                    </select>

                    {/* Sort */}
                    <div className="relative">
                      <button
                        onClick={() => setShowSortMenu(v => !v)}
                        className={`h-10 px-3 rounded-xl border text-sm flex items-center gap-2 ${darkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                      >
                        <TrendingUp className="w-4 h-4" />
                        {SORT_LABELS[sortBy]}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showSortMenu && (
                        <div className={`absolute right-0 top-12 z-20 w-52 rounded-xl shadow-2xl border overflow-hidden ${darkMode ? 'bg-slate-900/95 backdrop-blur-xl border-white/10' : 'bg-white border-gray-200'}`}>
                          {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => { setSortBy(key); setShowSortMenu(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                sortBy === key
                                  ? darkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-50 text-purple-700'
                                  : darkMode ? 'text-slate-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Nuevo cliente */}
                    <Button
                      onClick={() => { resetForm(); setShowModal(true); }}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 font-bold shadow-lg shadow-purple-600/20"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Cliente
                    </Button>
                  </div>

                  {/* Resumen de filtros activos */}
                  {(filterEstado !== 'TODOS' || filterPlan !== 'TODOS' || searchTerm) && (
                    <p className={`mt-2 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      Mostrando {clientesFiltrados.length} de {clientes.length} clientes
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Lista de clientes */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
              {cargandoClientes ? (
                <Card className={darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white'}>
                  <CardContent className="p-12 text-center flex items-center justify-center gap-2">
                    <RefreshCw className={`w-5 h-5 animate-spin ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                    <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Cargando clientes...</span>
                  </CardContent>
                </Card>
              ) : clientesFiltrados.length === 0 ? (
                <Card className={darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white'}>
                  <CardContent className="p-12 text-center">
                    <Users className={`w-14 h-14 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                    <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {clientes.length === 0 ? 'Sin clientes registrados' : 'Sin resultados'}
                    </h3>
                    <p className={`mb-4 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {clientes.length === 0
                        ? 'Crea tu primer cliente para comenzar a gestionar accesos'
                        : 'Intenta con otros filtros de búsqueda'}
                    </p>
                    {clientes.length === 0 && (
                      <Button
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Crear Primer Cliente
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                clientesFiltrados.map(cliente => {
                  const diasInfo = getDiasRestantes(cliente);
                  const modulosGuardados = (() => {
                    try {
                      const raw = localStorage.getItem(`codec_pos_modulos_cliente_${cliente.id}`);
                      return raw ? (JSON.parse(raw).modulosActivos || []).length : null;
                    } catch { return null; }
                  })();

                  return (
                    <Card
                      key={cliente.id}
                      className={`border transition-all hover:-translate-y-0.5 ${
                        cliente.estado === 'VENCIDA'
                          ? darkMode ? 'bg-red-500/[0.04] backdrop-blur-xl border-red-500/20 hover:border-red-500/30' : 'bg-red-50/60 border-red-200'
                          : cliente.estado === 'SUSPENDIDA'
                          ? darkMode ? 'bg-orange-500/[0.04] backdrop-blur-xl border-orange-500/20 hover:border-orange-500/30' : 'bg-orange-50/60 border-orange-200'
                          : darkMode ? 'bg-white/[0.03] backdrop-blur-xl border-white/10 hover:border-white/20' : 'bg-white'
                      }`}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Icono de plan */}
                          <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center ${
                            cliente.plan === 'PREMIUM'
                              ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                              : 'bg-gradient-to-br from-blue-500 to-cyan-600'
                          }`}>
                            {cliente.plan === 'PREMIUM'
                              ? <Crown className="w-5 h-5 text-white" />
                              : <Zap className="w-5 h-5 text-white" />}
                          </div>

                          {/* Info principal */}
                          <div className="flex-1 min-w-0">
                            {/* Fila 1: nombre + badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className={`font-bold text-base leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {cliente.nombreNegocio}
                              </h3>

                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                cliente.estado === 'ACTIVA'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : cliente.estado === 'SUSPENDIDA'
                                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}>
                                {cliente.estado === 'ACTIVA' ? '✓ ACTIVA' : cliente.estado === 'SUSPENDIDA' ? '⏸ SUSPENDIDA' : '✗ VENCIDA'}
                              </span>

                              {cliente.duracion === 'VITALICIA' && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                  <Infinity className="w-3 h-3 inline mr-0.5" />VITALICIA
                                </span>
                              )}

                              {cliente.enPrueba && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                  🎁 PRUEBA ({cliente.diasPruebaRestantes}d)
                                </span>
                              )}
                            </div>

                            {/* Fila 2: datos del cliente */}
                            <div className={`grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              <div><span className="font-medium">Usuario:</span> <span className={`font-mono ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{cliente.usuario}</span></div>
                              <div><span className="font-medium">Contacto:</span> <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>{cliente.contacto || '—'}</span></div>
                              <div><span className="font-medium">NIT:</span> <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>{cliente.nit || '—'}</span></div>
                              <div>
                                <span className="font-medium">Módulos:</span>{' '}
                                <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                  {modulosGuardados !== null ? `${modulosGuardados} activos` : 'Por configurar'}
                                </span>
                              </div>
                            </div>

                            {/* Barra de días restantes */}
                            {diasInfo && cliente.estado !== 'SUSPENDIDA' && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className={`w-3 h-3 ${diasInfo.colorText}`} />
                                    <span className={`text-xs font-semibold ${diasInfo.colorText}`}>
                                      {diasInfo.dias === 0
                                        ? 'Venció hoy'
                                        : diasInfo.dias <= 1
                                        ? `Vence mañana`
                                        : `${diasInfo.dias} días restantes`}
                                    </span>
                                    {diasInfo.urgente && diasInfo.dias > 0 && (
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    )}
                                  </div>
                                  <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {cliente.fechaExpiracion ? new Date(cliente.fechaExpiracion).toLocaleDateString('es-CO') : ''}
                                  </span>
                                </div>
                                <div className={`h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                  <div
                                    className={`h-full rounded-full transition-all ${diasInfo.colorBar}`}
                                    style={{ width: `${diasInfo.pct}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Caso VITALICIA: indicador simple */}
                            {cliente.duracion === 'VITALICIA' && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <Infinity className="w-3.5 h-3.5 text-purple-400" />
                                <span className={`text-xs ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                                  Desde {new Date(cliente.fechaActivacion).toLocaleDateString('es-CO')}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Acciones */}
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {/* Renovar — solo si vencida o por vencer urgente */}
                            {(cliente.estado === 'VENCIDA' || (diasInfo?.urgente && cliente.estado === 'ACTIVA')) && cliente.duracion !== 'VITALICIA' && (
                              <Button
                                onClick={() => handleRenovar(cliente.id)}
                                size="sm"
                                className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold text-xs h-8"
                                title="Renovar licencia"
                              >
                                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                Renovar
                              </Button>
                            )}

                            <div className="flex gap-1.5">
                              <Button onClick={() => copiarCredenciales(cliente)} variant="outline" size="sm" className={darkMode ? 'border-slate-600 hover:bg-slate-700 h-8 w-8 p-0' : 'h-8 w-8 p-0'} title="Copiar credenciales">
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button onClick={() => setClienteModulos(cliente)} variant="outline" size="sm" className={`h-8 w-8 p-0 border-purple-500 text-purple-500 hover:bg-purple-50 ${darkMode ? 'dark:hover:bg-purple-900/20' : ''}`} title="Gestionar módulos">
                                <Settings className="w-3.5 h-3.5" />
                              </Button>
                              <Button onClick={() => handleEdit(cliente)} variant="outline" size="sm" className={darkMode ? 'border-slate-600 hover:bg-slate-700 h-8 w-8 p-0' : 'h-8 w-8 p-0'} title="Editar cliente">
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button onClick={() => toggleEstado(cliente.id)} variant="outline" size="sm" className={darkMode ? 'border-slate-600 hover:bg-slate-700 h-8 w-8 p-0' : 'h-8 w-8 p-0'} title={cliente.estado === 'ACTIVA' ? 'Suspender' : 'Activar'}>
                                {cliente.estado === 'ACTIVA'
                                  ? <Lock className="w-3.5 h-3.5 text-orange-500" />
                                  : <Unlock className="w-3.5 h-3.5 text-emerald-500" />}
                              </Button>
                              <Button onClick={() => handleDelete(cliente.id)} variant="outline" size="sm" className={`h-8 w-8 p-0 text-red-500 hover:text-red-600 ${darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}`} title="Eliminar cliente">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </motion.div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: MÓDULOS
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'modulos' && <ModulosControlPanel />}

        {/* ══════════════════════════════════════════════════════
            TAB: PERSONAL DEL SISTEMA
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'personal' && <PersonalAdminSection darkMode={darkMode} />}

        {/* ══════════════════════════════════════════════════════
            TAB: SISTEMA Y BLINDAJE
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'sistema' && <SistemaBlindajePanel darkMode={darkMode} />}

        {/* ══════════════════════════════════════════════════════
            TAB: SEGURIDAD
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'seguridad' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className={darkMode ? 'bg-white/[0.03] backdrop-blur-xl border border-white/10' : 'bg-white'}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20 ring-1 ring-white/10">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>Cambiar Contraseña de Desarrollador</CardTitle>
                    <CardDescription className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Actualiza la contraseña de tu cuenta de administrador</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className={`text-sm font-semibold mb-1 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>Recomendaciones de seguridad</p>
                      <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                        <li>• Usa al menos 8 caracteres</li>
                        <li>• Combina letras mayúsculas, minúsculas, números y símbolos</li>
                        <li>• No uses información personal obvia</li>
                        <li>• Cambia tu contraseña periódicamente</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 max-w-2xl">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Contraseña Actual *</Label>
                    <Input type="password" value={passwordData.currentPassword} onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })} placeholder="Ingresa tu contraseña actual" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>

                  <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />

                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Nueva Contraseña *</Label>
                    <Input type="password" value={passwordData.newPassword} onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })} placeholder="Ingresa tu nueva contraseña" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>

                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Confirmar Nueva Contraseña *</Label>
                    <Input type="password" value={passwordData.confirmPassword} onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} placeholder="Confirma tu nueva contraseña" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>

                  {passwordData.newPassword && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fortaleza:</Label>
                        <span className={`text-sm font-semibold ${
                          passwordData.newPassword.length >= 12 && /[A-Z]/.test(passwordData.newPassword) && /[a-z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword) && /[^A-Za-z0-9]/.test(passwordData.newPassword)
                            ? 'text-green-500' : passwordData.newPassword.length >= 8 && /[A-Z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword)
                            ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                          {passwordData.newPassword.length >= 12 && /[A-Z]/.test(passwordData.newPassword) && /[a-z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword) && /[^A-Za-z0-9]/.test(passwordData.newPassword) ? 'Fuerte 💪' : passwordData.newPassword.length >= 8 && /[A-Z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword) ? 'Media ⚠️' : 'Débil 🔴'}
                        </span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div className={`h-full transition-all ${
                          passwordData.newPassword.length >= 12 && /[A-Z]/.test(passwordData.newPassword) && /[a-z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword) && /[^A-Za-z0-9]/.test(passwordData.newPassword)
                            ? 'bg-green-500 w-full' : passwordData.newPassword.length >= 8 && /[A-Z]/.test(passwordData.newPassword) && /[0-9]/.test(passwordData.newPassword)
                            ? 'bg-yellow-500 w-2/3' : 'bg-red-500 w-1/3'
                        }`} />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button onClick={() => setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })} variant="outline" className={darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}>
                      Limpiar
                    </Button>
                    <Button
                      onClick={() => {
                        if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) { toast.error('Completa todos los campos'); return; }
                        if (passwordData.newPassword.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
                        if (passwordData.newPassword !== passwordData.confirmPassword) { toast.error('Las contraseñas no coinciden'); return; }
                        const usuariosRaw = localStorage.getItem('codecpos_usuarios');
                        if (!usuariosRaw) { toast.error('No se encontró el usuario administrador'); return; }
                        const usuarios = JSON.parse(usuariosRaw);
                        const adminUser = usuarios.find((u: any) => u.username === 'Aadmin');
                        if (!adminUser) { toast.error('No se encontró el usuario Aadmin'); return; }
                        if (!verificarPassword(passwordData.currentPassword, adminUser.password).valido) { toast.error('Contraseña actual incorrecta'); return; }
                        const actualizados = usuarios.map((u: any) => u.username === 'Aadmin' ? { ...u, password: hashPassword(passwordData.newPassword) } : u);
                        localStorage.setItem('codecpos_usuarios', JSON.stringify(actualizados));
                        toast.success('¡Contraseña actualizada exitosamente!');
                        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      }}
                      className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 font-bold"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      Cambiar Contraseña
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

      </div>

      {/* ══ Modal Crear/Editar Cliente ══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && (setShowModal(false), resetForm())}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Card className={darkMode ? 'bg-slate-800 border-2 border-purple-600/30' : 'bg-white border-2 border-purple-200'}>
              <CardHeader>
                <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>{editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</CardTitle>
                <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Completa la información del cliente y configura su acceso</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">

                {/* Información del Negocio */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Nombre del Negocio *</Label>
                    <Input value={formData.nombreNegocio} onChange={e => setFormData({ ...formData, nombreNegocio: e.target.value })} placeholder="Ej: Minimercado El Éxito" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>NIT</Label>
                    <Input value={formData.nit} onChange={e => setFormData({ ...formData, nit: e.target.value })} placeholder="900123456-7" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Nombre de Contacto</Label>
                    <Input value={formData.contacto} onChange={e => setFormData({ ...formData, contacto: e.target.value })} placeholder="Juan Pérez" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Teléfono</Label>
                    <Input value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} placeholder="300 123 4567" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Email</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="contacto@negocio.com" className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                  </div>
                </div>

                {/* Credenciales */}
                <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-indigo-900/20 border-indigo-700/30' : 'bg-indigo-50 border-indigo-200'}`}>
                  <h4 className={`font-bold mb-3 ${darkMode ? 'text-indigo-400' : 'text-indigo-900'}`}>🔐 Credenciales de Acceso</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Usuario *</Label>
                      <Input value={formData.usuario} onChange={e => setFormData({ ...formData, usuario: e.target.value.toLowerCase() })} placeholder="usuario123" className={darkMode ? 'bg-slate-700 border-slate-600 text-white font-mono' : 'font-mono'} />
                    </div>
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Contraseña *</Label>
                      <Input value={formData.contraseña} onChange={e => setFormData({ ...formData, contraseña: e.target.value })} placeholder="Contraseña123" className={darkMode ? 'bg-slate-700 border-slate-600 text-white font-mono' : 'font-mono'} />
                    </div>
                  </div>
                </div>

                {/* Plan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: 'BASICO', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500', selBg: darkMode ? 'bg-blue-900/30 border-blue-500' : 'bg-blue-50 border-blue-500', label: 'Plan Básico', sub: 'Para tiendas pequeñas', features: ['500 productos', '1 mes historial', '2 usuarios', 'Sin Codec Verify'] },
                    { id: 'PREMIUM', icon: Crown, color: 'text-amber-500', bg: 'bg-amber-500', selBg: darkMode ? 'bg-amber-900/30 border-amber-500' : 'bg-amber-50 border-amber-500', label: 'Plan Premium', sub: 'Para negocios profesionales', features: ['20,000 productos', '3 meses historial', '5 usuarios', 'Codec Verify PRO'] },
                  ].map(plan => (
                    <div
                      key={plan.id}
                      onClick={() => setFormData({ ...formData, plan: plan.id as any })}
                      className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${formData.plan === plan.id ? plan.selBg : darkMode ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500' : 'bg-gray-50 border-gray-300 hover:border-gray-400'}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <plan.icon className={`w-7 h-7 ${plan.color}`} />
                        <div>
                          <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{plan.label}</h4>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{plan.sub}</p>
                        </div>
                      </div>
                      <ul className={`text-xs space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {plan.features.map(f => <li key={f}>{plan.id === 'PREMIUM' || !f.startsWith('Sin') ? '✓' : '✗'} {f}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Duración */}
                <div className="space-y-3">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Duración de la Licencia</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { id: '1_MES', icon: Clock, label: '1 Mes', sub: 'Renovación mensual' },
                      { id: '3_MESES', icon: Clock, label: '3 Meses', sub: 'Renovación trimestral' },
                      { id: '1_ANO', icon: Clock, label: '1 Año', sub: 'Renovación anual' },
                      { id: 'VITALICIA', icon: Infinity, label: 'Vitalicia', sub: 'Sin expiración' },
                    ] as const).map(d => {
                      const sel = formData.duracion === d.id;
                      const isVit = d.id === 'VITALICIA';
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, duracion: d.id })}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            sel
                              ? isVit
                                ? darkMode ? 'bg-purple-900/30 border-purple-500' : 'bg-purple-50 border-purple-500 shadow-md'
                                : darkMode ? 'bg-green-900/30 border-green-500' : 'bg-green-50 border-green-500 shadow-md'
                              : darkMode ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500' : 'bg-gray-50 border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <d.icon className={`w-5 h-5 mb-1.5 ${isVit ? 'text-purple-500' : 'text-green-500'}`} />
                          <h5 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{d.label}</h5>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{d.sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Módulos */}
                <div className={`p-4 rounded-lg border ${darkMode ? 'border-slate-600 bg-slate-800/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <Label className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>Módulos habilitados para este cliente</Label>
                    <span className={`text-xs font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>{modulosSeleccionados.size} / {modulosClienteDisponibles.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setModulosSeleccionados(new Set(construirModulosPorPlan(formData.plan)))} className={darkMode ? 'border-slate-500 hover:bg-slate-700' : ''}>Restaurar por plan</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setModulosSeleccionados(new Set(modulosClienteDisponibles.map(m => m.id)))} className={darkMode ? 'border-slate-500 hover:bg-slate-700' : ''}>Activar todos</Button>
                  </div>
                  <div className={`rounded-md border max-h-56 overflow-y-auto ${darkMode ? 'border-slate-600' : 'border-gray-300'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 p-2">
                      {modulosClienteDisponibles.map(modulo => {
                        const activo = modulosSeleccionados.has(modulo.id);
                        return (
                          <button
                            key={modulo.id}
                            type="button"
                            onClick={() => setModulosSeleccionados(prev => { const n = new Set(prev); if (n.has(modulo.id)) n.delete(modulo.id); else n.add(modulo.id); return n; })}
                            className={`text-left px-2.5 py-2 rounded-md border text-sm transition ${activo ? darkMode ? 'border-emerald-500 bg-emerald-900/20 text-emerald-300' : 'border-emerald-500 bg-emerald-50 text-emerald-800' : darkMode ? 'border-slate-600 text-gray-200 hover:bg-slate-700/50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                          >
                            <span className="mr-1.5">{activo ? '☑' : '☐'}</span>
                            <span className="mr-1">{modulo.icono}</span>
                            <span>{modulo.nombre}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Prueba Gratis */}
                <div className={`p-5 rounded-xl border-2 ${formData.activarPrueba ? darkMode ? 'bg-emerald-900/30 border-emerald-500' : 'bg-emerald-50 border-emerald-500' : darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-gray-50 border-gray-300'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.activarPrueba ? 'bg-gradient-to-br from-emerald-500 to-green-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'}`}>
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>🎁 Prueba Gratis</h4>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Acceso temporal sin costo</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, activarPrueba: !formData.activarPrueba })}
                      className={`relative w-14 h-7 rounded-full transition-all ${formData.activarPrueba ? 'bg-gradient-to-r from-emerald-500 to-green-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.activarPrueba ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {formData.activarPrueba && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Días de Prueba</Label>
                          <Input type="number" min="1" max="90" value={formData.diasPrueba} onChange={e => setFormData({ ...formData, diasPrueba: Math.max(1, Math.min(90, parseInt(e.target.value) || 7)) })} className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Expira el</Label>
                          <div className={`h-10 px-3 rounded-md border flex items-center text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-100 border-gray-300'}`}>
                            {new Date(Date.now() + formData.diasPrueba * 86_400_000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[3, 7, 15, 30].map(d => (
                          <button key={d} type="button" onClick={() => setFormData({ ...formData, diasPrueba: d })} className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${formData.diasPrueba === d ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow' : darkMode ? 'bg-slate-600 text-gray-300 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Botones del modal */}
                <div className={`flex justify-end gap-3 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <Button onClick={() => { setShowModal(false); resetForm(); }} variant="outline" className={darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateCliente} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 font-bold">
                    {editingCliente ? 'Guardar Cambios' : 'Crear Cliente'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* ══ Panel de Módulos por Cliente ══ */}
      <AnimatePresence>
        {clienteModulos && (
          <ClienteModulosPanel
            cliente={clienteModulos}
            onClose={() => setClienteModulos(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
