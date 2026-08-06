/**
 * 💳 PÁGINA DE FIDELIZACIÓN — CODEC POS v2.0
 * Dashboard premium con glassmorphism, gestión completa de clientes,
 * niveles de lealtad, historial de puntos y configuración del programa.
 * 100% offline — localStorage + IndexedDB
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift, Plus, Search, Star, Crown, Zap, TrendingUp,
  Users, CreditCard, BarChart3, History, Settings,
  User, Phone, Mail, QrCode, Edit, ChevronRight,
  ChevronLeft, Sparkles, Target, Medal, Trophy,
  RefreshCw, Check, X, ArrowUpRight, ArrowDownRight,
  Info, FileText,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Cliente,
  MovimientoPuntos,
  ConfiguracionFidelizacion,
  crearCliente,
  listarClientes,
  buscarCliente,
  actualizarCliente,
  acumularPuntos,
  redimirPuntos,
  obtenerHistorialPuntos,
  obtenerTopClientes,
  obtenerEstadisticasFidelizacion,
  obtenerConfiguracionFidelizacion,
  actualizarConfiguracionFidelizacion,
} from '../lib/fidelizacionService';
import { toast } from 'sonner';
import { usePOS } from '../contexts/POSContext';

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const NIVEL_META: Record<string, {
  label: string;
  color: string;
  gradient: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  emoji: string;
}> = {
  bronce: {
    label: 'Bronce',
    color: 'text-orange-400',
    gradient: 'from-orange-500 to-amber-600',
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/40',
    icon: <Medal className="w-4 h-4" />,
    emoji: '🥉',
  },
  plata: {
    label: 'Plata',
    color: 'text-slate-300',
    gradient: 'from-slate-400 to-gray-500',
    bg: 'bg-slate-400/20',
    border: 'border-slate-400/40',
    icon: <Star className="w-4 h-4" />,
    emoji: '🥈',
  },
  oro: {
    label: 'Oro',
    color: 'text-yellow-400',
    gradient: 'from-yellow-400 to-amber-500',
    bg: 'bg-yellow-400/20',
    border: 'border-yellow-400/40',
    icon: <Trophy className="w-4 h-4" />,
    emoji: '🥇',
  },
  platino: {
    label: 'Platino',
    color: 'text-purple-400',
    gradient: 'from-purple-500 to-indigo-600',
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/40',
    icon: <Crown className="w-4 h-4" />,
    emoji: '💎',
  },
};

function NivelBadge({ nivel, size = 'sm' }: { nivel: string; size?: 'xs' | 'sm' | 'md' }) {
  const meta = NIVEL_META[nivel] || NIVEL_META.bronce;
  const sizes = { xs: 'px-2 py-0.5 text-xs', sm: 'px-3 py-1 text-xs', md: 'px-4 py-1.5 text-sm' };
  return (
    <span className={`inline-flex items-center gap-1.5 ${sizes[size]} rounded-full font-bold bg-gradient-to-r ${meta.gradient} text-white shadow-sm`}>
      {meta.icon} {meta.label}
    </span>
  );
}

function fmt(n: number) { return n.toLocaleString('es-CO'); }
function fmtCOP(n: number) { return `$${n.toLocaleString('es-CO')}`; }

// ─────────────────────────────────────────────
//  MODAL: NUEVO / EDITAR CLIENTE
// ─────────────────────────────────────────────

interface ModalClienteProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clienteEditar?: Cliente | null;
}

function ModalCliente({ isOpen, onClose, onSuccess, clienteEditar }: ModalClienteProps) {
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: '', documento: '', telefono: '', email: '', notas: '',
  });

  useEffect(() => {
    if (isOpen) {
      setPaso(1);
      if (clienteEditar) {
        setForm({
          nombre: clienteEditar.nombre,
          documento: clienteEditar.documento,
          telefono: clienteEditar.telefono || '',
          email: clienteEditar.email || '',
          notas: clienteEditar.notas || '',
        });
      } else {
        setForm({ nombre: '', documento: '', telefono: '', email: '', notas: '' });
      }
    }
  }, [isOpen, clienteEditar]);

  const handleSubmit = async () => {
    if (!form.nombre || !form.documento || !form.telefono) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    setLoading(true);
    try {
      if (clienteEditar) {
        await actualizarCliente(clienteEditar.id, form);
        toast.success('✅ Cliente actualizado');
      } else {
        await crearCliente(form);
        toast.success('✅ Cliente registrado');
        toast.info('🎁 Se otorgaron puntos de bienvenida');
      }
      onSuccess();
      onClose();
    } catch (e) {
      toast.error('Error al guardar cliente');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const pasos = [
    { n: 1, label: 'Datos personales', icon: User },
    { n: 2, label: 'Contacto', icon: Phone },
    { n: 3, label: 'Confirmación', icon: Check },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 50%, rgba(15,23,42,0.97) 100%)' }}>

          {/* Decoración */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                  <Gift className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {clienteEditar ? 'Editar Cliente' : 'Nuevo Cliente'}
                  </h2>
                  <p className="text-purple-100 text-sm">Programa de fidelización CODEC POS</p>
                </div>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-xl transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pasos */}
            <div className="flex items-center gap-2 mt-5">
              {pasos.map((p, i) => (
                <React.Fragment key={p.n}>
                  <button
                    onClick={() => p.n < paso || (paso === 1 && p.n === 1) ? setPaso(p.n) : null}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      paso === p.n ? 'bg-white text-purple-700 shadow-lg' :
                      paso > p.n ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    <p.icon className="w-3.5 h-3.5" />
                    {p.label}
                  </button>
                  {i < pasos.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full ${paso > p.n ? 'bg-white/60' : 'bg-white/20'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative p-6 space-y-5">

            {/* Paso 1: Datos personales */}
            {paso === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white/80 mb-2">
                    Nombre Completo <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all"
                    placeholder="Juan Carlos Pérez"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/80 mb-2">
                    Documento (CC / NIT) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={form.documento}
                      onChange={e => setForm({ ...form, documento: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all"
                      placeholder="1023456789"
                    />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-purple-300 text-sm font-semibold">¿Sabías qué?</p>
                      <p className="text-purple-300/70 text-xs mt-1">
                        Al registrarse, el cliente recibe puntos de bienvenida automáticamente y comenzará en nivel Bronce.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Paso 2: Contacto */}
            {paso === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white/80 mb-2">
                    Teléfono / WhatsApp <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="tel"
                      value={form.telefono}
                      onChange={e => setForm({ ...form, telefono: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all"
                      placeholder="300 123 4567"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/80 mb-2">
                    Correo Electrónico <span className="text-white/40 text-xs">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all"
                      placeholder="cliente@gmail.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/80 mb-2">
                    Notas <span className="text-white/40 text-xs">(Opcional)</span>
                  </label>
                  <textarea
                    value={form.notas}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all resize-none"
                    placeholder="Preferencias del cliente, alergias, etc."
                  />
                </div>
              </div>
            )}

            {/* Paso 3: Confirmación */}
            {paso === 3 && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <h3 className="font-bold text-white/90 text-sm uppercase tracking-wide">Resumen del cliente</h3>
                  {[
                    { label: 'Nombre', value: form.nombre || '—', icon: User },
                    { label: 'Documento', value: form.documento || '—', icon: CreditCard },
                    { label: 'Teléfono', value: form.telefono || '—', icon: Phone },
                    { label: 'Email', value: form.email || 'No registrado', icon: Mail },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2 text-white/50 text-sm">
                        <row.icon className="w-4 h-4" />
                        {row.label}
                      </div>
                      <span className="text-white font-semibold text-sm">{row.value}</span>
                    </div>
                  ))}
                </div>
                {!clienteEditar && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Gift className="w-5 h-5 text-yellow-400" />
                      <span className="font-bold text-yellow-300 text-sm">Beneficios automáticos al registrar</span>
                    </div>
                    <ul className="text-yellow-300/70 text-xs space-y-1">
                      <li>🎁 Puntos de bienvenida automáticos</li>
                      <li>🥉 Nivel Bronce inicial con multiplicador x1</li>
                      <li>🎯 Tarjeta EAN-13 exclusiva generada</li>
                      <li>📈 Sube de nivel automáticamente según sus compras</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Botones de navegación */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                onClick={() => paso > 1 ? setPaso(paso - 1) : onClose()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white font-semibold text-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                {paso === 1 ? 'Cancelar' : 'Anterior'}
              </button>
              {paso < 3 ? (
                <button
                  onClick={() => {
                    if (paso === 1 && (!form.nombre || !form.documento)) {
                      toast.error('Nombre y Documento son obligatorios');
                      return;
                    }
                    if (paso === 2 && !form.telefono) {
                      toast.error('El teléfono es obligatorio');
                      return;
                    }
                    setPaso(paso + 1);
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/30"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-sm transition-all shadow-lg shadow-green-500/30 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {clienteEditar ? 'Actualizar Cliente' : 'Registrar Cliente'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MODAL: GESTIÓN DE PUNTOS (acumular / redimir / bono)
// ─────────────────────────────────────────────

interface ModalPuntosProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cliente: Cliente;
  modo: 'acumular' | 'redimir' | 'bono';
}

function ModalPuntos({ isOpen, onClose, onSuccess, cliente, modo }: ModalPuntosProps) {
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isOpen) setValor(''); }, [isOpen]);

  const modoMeta = {
    acumular: { title: 'Acumular Puntos', icon: TrendingUp, gradient: 'from-green-500 to-emerald-600', desc: 'Ingresa el monto de compra para calcular los puntos', label: 'Monto de Compra ($)', color: 'text-green-400' },
    redimir: { title: 'Redimir Puntos', icon: ArrowDownRight, gradient: 'from-red-500 to-orange-600', desc: 'Indica cuántos puntos desea redimir el cliente', label: 'Puntos a Redimir', color: 'text-red-400' },
    bono: { title: 'Otorgar Bono de Puntos', icon: Gift, gradient: 'from-purple-500 to-indigo-600', desc: 'Otorga puntos de bonificación manualmente', label: 'Puntos Bono', color: 'text-purple-400' },
  }[modo];

  const handleConfirmar = async () => {
    const num = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
    if (!num || num <= 0) { toast.error('Ingresa un valor válido'); return; }

    if (modo === 'redimir' && num > cliente.puntos) {
      toast.error('El cliente no tiene suficientes puntos');
      return;
    }

    setLoading(true);
    try {
      if (modo === 'acumular') {
        const pts = await acumularPuntos(cliente.id, num);
        toast.success(`✅ +${fmt(pts)} puntos acumulados`);
      } else if (modo === 'redimir') {
        const desc = await redimirPuntos(cliente.id, num);
        toast.success(`✅ Descuento de ${fmtCOP(desc)} aplicado`);
      } else {
        // Bono: ajuste manual de puntos
        await actualizarCliente(cliente.id, {
          puntos: cliente.puntos + num,
          puntosAcumulados: cliente.puntosAcumulados + num,
        });
        toast.success(`🎁 +${fmt(num)} puntos bono otorgados`);
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Error al procesar');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 100%)' }}>
          {/* Header */}
          <div className={`bg-gradient-to-r ${modoMeta.gradient} p-5 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-xl">
                <modoMeta.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">{modoMeta.title}</h3>
                <p className="text-white/70 text-xs">{cliente.nombre}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Info cliente */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
              <div>
                <p className="text-white/50 text-xs">Puntos disponibles</p>
                <p className={`text-2xl font-bold ${modoMeta.color}`}>{fmt(cliente.puntos)}</p>
                <p className="text-white/40 text-xs">{fmtCOP(cliente.puntos * 10)} en descuentos</p>
              </div>
              <NivelBadge nivel={cliente.nivelFidelidad} size="md" />
            </div>

            <p className="text-white/50 text-sm">{modoMeta.desc}</p>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-2">{modoMeta.label}</label>
              <input
                type="number"
                value={valor}
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmar()}
                className="w-full px-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white text-xl placeholder-white/20 focus:outline-none focus:border-purple-400 transition-all text-center font-bold"
                placeholder="0"
                min="1"
              />
              {modo === 'acumular' && valor && (
                <p className="text-center text-green-400 text-sm mt-2">
                  ≈ <strong>+{fmt(Math.floor(parseFloat(valor || '0')))}</strong> puntos a ganar
                </p>
              )}
              {modo === 'redimir' && valor && (
                <p className="text-center text-red-400 text-sm mt-2">
                  = <strong>{fmtCOP(parseFloat(valor || '0') * 10)}</strong> de descuento
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white font-semibold transition-all">
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${modoMeta.gradient} text-white font-bold transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MODAL: DETALLE DE CLIENTE
// ─────────────────────────────────────────────

interface ModalDetalleProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente;
  historial: MovimientoPuntos[];
  onAccion: (modo: 'acumular' | 'redimir' | 'bono') => void;
  onEditar: () => void;
}

function ModalDetalle({ isOpen, onClose, cliente, historial, onAccion, onEditar }: ModalDetalleProps) {
  const meta = NIVEL_META[cliente.nivelFidelidad] || NIVEL_META.bronce;
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 100%)' }}>

          {/* Decoración */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header del cliente */}
          <div className={`relative bg-gradient-to-br ${meta.gradient} p-6`}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                <User className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-white">{cliente.nombre}</h2>
                  <NivelBadge nivel={cliente.nivelFidelidad} size="md" />
                </div>
                <p className="text-white/70 text-sm mt-1">CC: {cliente.documento}</p>
                <div className="flex items-center gap-4 mt-2">
                  {cliente.telefono && <span className="text-white/60 text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{cliente.telefono}</span>}
                  {cliente.email && <span className="text-white/60 text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{cliente.email}</span>}
                </div>
              </div>
            </div>

            {/* Puntos banner */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
                <p className="text-white/70 text-xs mb-1">Puntos Disponibles</p>
                <p className="text-3xl font-bold text-white">{fmt(cliente.puntos)}</p>
                <p className="text-white/60 text-xs mt-1">{fmtCOP(cliente.puntos * 10)}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
                <p className="text-white/70 text-xs mb-1">Compras Totales</p>
                <p className="text-2xl font-bold text-white">{fmtCOP(cliente.totalCompras)}</p>
                <p className="text-white/60 text-xs mt-1">{cliente.numeroCompras} visitas</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
                <p className="text-white/70 text-xs mb-1">Pts. Redimidos</p>
                <p className="text-2xl font-bold text-white">{fmt(cliente.puntosRedimidos)}</p>
                <p className="text-white/60 text-xs mt-1">{fmtCOP(cliente.puntosRedimidos * 10)}</p>
              </div>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="relative p-4 border-b border-white/10 flex flex-wrap gap-3">
            <button onClick={() => onAccion('acumular')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-green-500/20">
              <TrendingUp className="w-4 h-4" /> Acumular Puntos
            </button>
            <button onClick={() => onAccion('redimir')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-red-500/20">
              <ArrowDownRight className="w-4 h-4" /> Redimir Puntos
            </button>
            <button onClick={() => onAccion('bono')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-purple-500/20">
              <Gift className="w-4 h-4" /> Dar Bono
            </button>
            <button onClick={onEditar} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-semibold text-sm transition-all ml-auto">
              <Edit className="w-4 h-4" /> Editar
            </button>
          </div>

          {/* Código de barras */}
          {cliente.codigoBarras && (
            <div className="relative px-6 py-3 flex items-center gap-3 bg-white/5 border-b border-white/10">
              <QrCode className="w-4 h-4 text-white/40" />
              <span className="text-white/50 text-xs">Tarjeta:</span>
              <span className="font-mono text-white/80 text-sm tracking-widest">{cliente.codigoBarras}</span>
            </div>
          )}

          {/* Historial */}
          <div className="relative p-6">
            <h3 className="font-bold text-white/90 flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-purple-400" />
              Historial de Movimientos
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {historial.length === 0 ? (
                <div className="text-center py-8 text-white/30">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Sin movimientos registrados</p>
                </div>
              ) : historial.map(mov => {
                const esPositivo = mov.puntos > 0;
                const tipoMeta: Record<string, { color: string; bg: string; label: string }> = {
                  acumulacion: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', label: 'Acumulación' },
                  redencion: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Redención' },
                  bono: { color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', label: 'Bono' },
                  ajuste: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Ajuste' },
                  expiracion: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', label: 'Expiración' },
                };
                const tm = tipoMeta[mov.tipo] || tipoMeta.ajuste;
                return (
                  <div key={mov.id} className={`flex items-center justify-between p-3 rounded-xl border ${tm.bg} transition-all`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${tm.color}`}>{tm.label}</span>
                        <span className="text-white/30 text-xs">{new Date(mov.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-white/60 text-xs mt-0.5 truncate">{mov.motivo}</p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className={`font-bold ${esPositivo ? 'text-green-400' : 'text-red-400'}`}>
                        {esPositivo ? '+' : ''}{fmt(mov.puntos)}
                      </p>
                      <p className="text-white/30 text-xs">Saldo: {fmt(mov.saldo)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MODAL: CONFIGURACIÓN DEL PROGRAMA
// ─────────────────────────────────────────────

interface ModalConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ModalConfig({ isOpen, onClose, onSuccess }: ModalConfigProps) {
  const [config, setConfig] = useState<ConfiguracionFidelizacion | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      obtenerConfiguracionFidelizacion().then(c => { setConfig(c); setLoading(false); });
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await actualizarConfiguracionFidelizacion(config);
      toast.success('✅ Configuración guardada');
      onSuccess();
      onClose();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  if (!isOpen || !config) return null;

  const field = (label: string, key: keyof ConfiguracionFidelizacion, type = 'number', hint?: string) => (
    <div key={key}>
      <label className="block text-sm font-semibold text-white/80 mb-1">{label}</label>
      {hint && <p className="text-white/40 text-xs mb-2">{hint}</p>}
      <input
        type={type}
        value={config[key] as number}
        onChange={e => setConfig({ ...config, [key]: parseFloat(e.target.value) || 0 })}
        className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-400 transition-all"
        min={0}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 100%)' }}>
          <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-xl"><Settings className="w-5 h-5 text-white" /></div>
              <div>
                <h3 className="font-bold text-white">Configuración del Programa</h3>
                <p className="text-white/60 text-xs">Personaliza las reglas de fidelización</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-6 space-y-6">
            {/* Puntos */}
            <div>
              <h4 className="font-bold text-white/90 mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-purple-400" /> Reglas de Puntos</h4>
              <div className="grid grid-cols-2 gap-4">
                {field('Puntos por Peso ($)', 'puntosXPeso', 'number', 'Ej: 1 = 1 punto por cada $1')}
                {field('Pesos por Punto ($)', 'pesosXPunto', 'number', 'Ej: 10 = 1 punto vale $10')}
                {field('Puntos de Bienvenida', 'puntosBienvenida', 'number', 'Puntos al registrar cliente nuevo')}
                {field('Expiración (meses)', 'expiracionMeses', 'number', '0 = sin expiración')}
              </div>
            </div>

            {/* Multiplicadores */}
            <div>
              <h4 className="font-bold text-white/90 mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /> Multiplicadores por Nivel</h4>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Multiplicador Bronce', 'multiplicadorBronce'],
                  ['Multiplicador Plata', 'multiplicadorPlata'],
                  ['Multiplicador Oro', 'multiplicadorOro'],
                  ['Multiplicador Platino', 'multiplicadorPlatino'],
                ].map(([label, key]) => field(label, key as keyof ConfiguracionFidelizacion))}
              </div>
            </div>

            {/* Umbrales */}
            <div>
              <h4 className="font-bold text-white/90 mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Umbrales de Nivel (puntos acumulados)</h4>
              <div className="grid grid-cols-3 gap-4">
                {[
                  ['Umbral Plata', 'plata'],
                  ['Umbral Oro', 'oro'],
                  ['Umbral Platino', 'platino'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-white/80 mb-2">{label}</label>
                    <input
                      type="number"
                      value={config.umbrales[key as keyof typeof config.umbrales]}
                      onChange={e => setConfig({ ...config, umbrales: { ...config.umbrales, [key]: parseInt(e.target.value) || 0 } })}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-400 transition-all"
                      min={0}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Activo */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
              <div>
                <p className="font-semibold text-white/90">Programa Activo</p>
                <p className="text-white/50 text-xs">Habilita o deshabilita el programa completo</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, activo: !config.activo })}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${config.activo ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-white/20'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${config.activo ? 'left-7' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white font-semibold transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold transition-all shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  TARJETA DE CLIENTE
// ─────────────────────────────────────────────

function TarjetaCliente({ cliente, rank, onClick }: { cliente: Cliente; rank?: number; onClick: () => void }) {
  const meta = NIVEL_META[cliente.nivelFidelidad] || NIVEL_META.bronce;
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl ${dm('border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-xl', 'border-gray-200 bg-white hover:border-gray-300 shadow-sm')}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${meta.gradient} rounded-l-2xl`} />

      <div className="relative p-5 pl-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {rank && (
              <span className={`text-sm font-black ${rank <= 3 ? 'text-yellow-400' : dm('text-white/30', 'text-gray-300')}`}>
                #{rank}
              </span>
            )}
            <div className={`p-2 rounded-xl bg-gradient-to-br ${meta.gradient} shadow-lg`}>
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className={`font-bold text-sm leading-tight ${dm('text-white', 'text-gray-900')}`}>{cliente.nombre}</p>
              <p className={`text-xs ${dm('text-white/40', 'text-gray-400')}`}>{cliente.telefono}</p>
            </div>
          </div>
          <NivelBadge nivel={cliente.nivelFidelidad} size="xs" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={`text-xs mb-0.5 ${dm('text-white/40', 'text-gray-400')}`}>Puntos</p>
            <p className={`font-bold ${meta.color} text-sm`}>{fmt(cliente.puntos)}</p>
          </div>
          <div>
            <p className={`text-xs mb-0.5 ${dm('text-white/40', 'text-gray-400')}`}>Compras</p>
            <p className={`font-bold text-sm ${dm('text-white', 'text-gray-900')}`}>{fmtCOP(cliente.totalCompras)}</p>
          </div>
          <div>
            <p className={`text-xs mb-0.5 ${dm('text-white/40', 'text-gray-400')}`}>Visitas</p>
            <p className={`font-bold text-sm ${dm('text-white', 'text-gray-900')}`}>{cliente.numeroCompras}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className={`h-1.5 rounded-full overflow-hidden ${dm('bg-white/10', 'bg-gray-100')}`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r ${meta.gradient} transition-all`}
              style={{ width: `${Math.min(100, (cliente.puntos / 500) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-all ${dm('text-white/20 group-hover:text-white/50', 'text-gray-200 group-hover:text-gray-400')}`}>
        <ChevronRight className="w-5 h-5" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  PÁGINA PRINCIPAL
// ─────────────────────────────────────────────

type TabType = 'clientes' | 'top10' | 'configuracion';

export default function FidelizacionPage() {
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;
  // Estados
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [topClientes, setTopClientes] = useState<Cliente[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabType>('clientes');
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<string>('todos');

  // Modales
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [modalConfigOpen, setModalConfigOpen] = useState(false);
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null);
  const [clienteDetalle, setClienteDetalle] = useState<Cliente | null>(null);
  const [historialDetalle, setHistorialDetalle] = useState<MovimientoPuntos[]>([]);
  const [modalPuntos, setModalPuntos] = useState<{ open: boolean; modo: 'acumular' | 'redimir' | 'bono' }>({ open: false, modo: 'acumular' });

  // ── Cargar datos ──
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [clientesData, topData, statsData] = await Promise.all([
        listarClientes(true),
        obtenerTopClientes(10),
        obtenerEstadisticasFidelizacion(),
      ]);
      setClientes(clientesData);
      setTopClientes(topData);
      setEstadisticas(statsData);
    } catch (e) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── Ver detalle ──
  const handleVerDetalle = async (cliente: Cliente) => {
    setClienteDetalle(cliente);
    const hist = await obtenerHistorialPuntos(cliente.id, 30);
    setHistorialDetalle(hist);
  };

  // ── Buscar ──
  const handleBuscar = async () => {
    if (!busqueda.trim()) { cargarDatos(); return; }
    try {
      const res = await buscarCliente(busqueda);
      if (res) setClientes([res]);
      else { toast.error('Cliente no encontrado'); setClientes([]); }
    } catch { toast.error('Error en búsqueda'); }
  };

  // ── Filtrado ──
  const clientesFiltrados = clientes.filter(c => {
    const matchBusq = !busqueda ||
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.documento.includes(busqueda) ||
      (c.telefono || '').includes(busqueda);
    const matchNivel = filtroNivel === 'todos' || c.nivelFidelidad === filtroNivel;
    return matchBusq && matchNivel;
  });

  // ── Distribución niveles ──
  const distribucion = estadisticas?.distribucionNiveles || { bronce: 0, plata: 0, oro: 0, platino: 0 };
  const totalDist = Object.values(distribucion).reduce((a: number, b: any) => a + b, 0) as number;

  // ── Exportar PDF ──
  const exportarPDF = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = config.nombreComercial || 'MI NEGOCIO';
      const nit = config.nit ? `NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const ahora = new Date();

      doc.setFillColor(109, 40, 217);
      doc.rect(0, 0, W, 32, 'F');
      if (config.logoUrl) {
        try {
          const ext = config.logoUrl.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(config.logoUrl, ext, W - 34, 4, 22, 22);
        } catch { /* skip */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(empresa, 14, 12);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      if (nit) doc.text(nit, 14, 18);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE FIDELIZACIÓN DE CLIENTES', 14, 27);
      doc.setTextColor(0, 0, 0);

      let y = 38;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, 14, y);
      if (estadisticas) {
        y += 5;
        doc.text(
          `Total clientes: ${estadisticas.totalClientes} · Puntos en circulación: ${fmt(estadisticas.puntosCirculacion)} · Valor: ${fmtCOP(estadisticas.valorEnPesos)}`,
          14, y,
        );
        y += 4;
        doc.text(
          `Distribución — Bronce: ${distribucion.bronce}  Plata: ${distribucion.plata}  Oro: ${distribucion.oro}  Platino: ${distribucion.platino}`,
          14, y,
        );
      }
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['#', 'Cliente', 'Documento', 'Nivel', 'Puntos', 'Total Compras', 'Visitas', 'Último Contacto']],
        body: clientesFiltrados.map((c, i) => [
          i + 1,
          c.nombre,
          c.documento,
          (NIVEL_META[c.nivelFidelidad]?.emoji || '') + ' ' + (NIVEL_META[c.nivelFidelidad]?.label || c.nivelFidelidad),
          fmt(c.puntos),
          fmtCOP(c.totalCompras),
          c.numeroCompras,
          c.ultimaVisita ? new Date(c.ultimaVisita).toLocaleDateString('es-CO') : '—',
        ]),
        headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'center' },
          7: { halign: 'center' },
        },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} — CODEC POS v2.0`, W / 2, 290, { align: 'center' });
      }

      doc.save(`Fidelizacion-${ahora.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF de fidelización generado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar PDF');
    }
  };

  // ─────────────────────────────────────────
  return (
    <div className={`h-screen overflow-y-auto p-6 space-y-6 ${dm('', 'bg-gray-50')}`}>

      {/* ── HEADER PREMIUM ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-700 via-indigo-700 to-blue-700 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-300/10 rounded-full blur-3xl" />
        {/* Estrellas decorativas */}
        <div className="absolute top-6 right-32 w-2 h-2 bg-yellow-300 rounded-full animate-ping" />
        <div className="absolute top-16 right-52 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        <div className="absolute bottom-8 right-20 w-2 h-2 bg-purple-300 rounded-full animate-bounce" />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm animate-pulse">
                <Crown className="w-8 h-8 text-yellow-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                  Programa de Fidelización
                  <Sparkles className="w-7 h-7 text-yellow-300 animate-bounce" />
                </h1>
                <p className="text-white/70 text-lg mt-1">
                  Recompensa a tus clientes frecuentes y aumenta su lealtad
                </p>
              </div>
            </div>

            {/* Niveles rápidos */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['bronce', 'plata', 'oro', 'platino'] as const).map(n => (
                <span key={n} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white/80 text-xs backdrop-blur-sm">
                  {NIVEL_META[n].emoji} {NIVEL_META[n].label}: {distribucion[n] || 0}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={exportarPDF}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-5 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 border border-white/20"
            >
              <FileText className="w-5 h-5" />
              PDF
            </button>
            <button
              onClick={() => setModalConfigOpen(true)}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 border border-white/30"
            >
              <Settings className="w-5 h-5" />
              Configurar
            </button>
            <button
              onClick={() => { setClienteEditar(null); setModalClienteOpen(true); }}
              className="bg-white text-purple-700 hover:bg-white/90 px-6 py-3 rounded-xl font-bold transition-all shadow-xl flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuevo Cliente
            </button>
          </div>
        </div>
      </div>

      {/* ── ESTADÍSTICAS ── */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              label: 'Clientes Activos', value: fmt(estadisticas.totalClientes), sub: 'en el programa',
              icon: Users, gradient: 'from-blue-500 to-indigo-600', trend: TrendingUp, trendColor: 'text-green-400',
            },
            {
              label: 'Puntos Circulando', value: fmt(estadisticas.puntosCirculacion), sub: `${fmtCOP(estadisticas.valorEnPesos)} en valor`,
              icon: Star, gradient: 'from-yellow-500 to-orange-500', trend: TrendingUp, trendColor: 'text-green-400',
            },
            {
              label: 'Pts. Redimidos Total', value: fmt(estadisticas.puntosRedimidosTotal || 0), sub: fmtCOP((estadisticas.puntosRedimidosTotal || 0) * 10),
              icon: Gift, gradient: 'from-purple-500 to-pink-600', trend: ArrowUpRight, trendColor: 'text-purple-400',
            },
            {
              label: 'Tasa de Redención', value: `${(estadisticas.tasaRedencion || 0).toFixed(1)}%`, sub: 'puntos usados / acumulados',
              icon: BarChart3, gradient: 'from-green-500 to-emerald-600', trend: TrendingUp, trendColor: 'text-green-400',
            },
          ].map((stat, i) => (
            <div key={i} className={`group relative overflow-hidden rounded-2xl p-6 hover:scale-105 transition-transform cursor-default shadow-xl border ${dm('bg-white/5 backdrop-blur-xl border-white/10', 'bg-white border-gray-200')}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`bg-gradient-to-br ${stat.gradient} p-3 rounded-xl shadow-lg`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <stat.trend className={`w-5 h-5 ${stat.trendColor}`} />
                </div>
                <div className={`text-3xl font-bold mb-1 ${dm('text-white', 'text-gray-900')}`}>{stat.value}</div>
                <div className={`text-sm font-semibold ${dm('text-white/50', 'text-gray-500')}`}>{stat.label}</div>
                <div className={`text-xs mt-1 ${dm('text-white/30', 'text-gray-400')}`}>{stat.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DISTRIBUCIÓN DE NIVELES ── */}
      {totalDist > 0 && (
        <div className={`rounded-2xl p-6 shadow-xl border ${dm('bg-white/5 backdrop-blur-xl border-white/10', 'bg-white border-gray-200')}`}>
          <h3 className={`font-bold mb-5 flex items-center gap-2 ${dm('text-white/90', 'text-gray-800')}`}>
            <Trophy className="w-5 h-5 text-yellow-400" />
            Distribución por Niveles de Lealtad
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['bronce', 'plata', 'oro', 'platino'] as const).map(n => {
              const meta = NIVEL_META[n];
              const count = distribucion[n] || 0;
              const pct = totalDist > 0 ? (count / totalDist) * 100 : 0;
              return (
                <div key={n} className={`rounded-xl p-4 border ${meta.bg} ${meta.border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`flex items-center gap-2 font-bold ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </div>
                    <span className={`text-xs ${dm('text-white/40', 'text-gray-400')}`}>{meta.emoji}</span>
                  </div>
                  <div className={`text-3xl font-black mb-2 ${dm('text-white', 'text-gray-900')}`}>{count}</div>
                  <div className={`h-2 rounded-full overflow-hidden ${dm('bg-white/10', 'bg-gray-200')}`}>
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${meta.gradient} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1.5 ${dm('text-white/40', 'text-gray-400')}`}>{pct.toFixed(1)}% del total</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TABS ── */}
      <div className={`flex items-center gap-2 rounded-2xl p-1.5 w-fit border ${dm('bg-white/5 backdrop-blur-xl border-white/10', 'bg-white border-gray-200 shadow-sm')}`}>
        {([
          { id: 'clientes', label: 'Todos los Clientes', icon: Users },
          { id: 'top10', label: 'Top 10', icon: Trophy },
          { id: 'configuracion', label: 'Configuración', icon: Settings },
        ] as { id: TabType; label: string; icon: any }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === t.id
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
                : dm('text-white/50 hover:text-white hover:bg-white/10', 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: CLIENTES ── */}
      {tab === 'clientes' && (
        <>
          {/* Búsqueda y filtros */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${dm('text-white/30', 'text-gray-400')}`} />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                placeholder="Buscar por nombre, documento o teléfono..."
                className={`w-full pl-12 pr-4 py-3.5 rounded-2xl border focus:outline-none focus:border-purple-400 transition-all ${dm('bg-white/10 border-white/20 text-white placeholder-white/30 backdrop-blur-xl', 'bg-white border-gray-300 text-gray-900 placeholder-gray-400')}`}
              />
            </div>
            <select
              value={filtroNivel}
              onChange={e => setFiltroNivel(e.target.value)}
              className={`px-4 py-3.5 rounded-2xl border focus:outline-none focus:border-purple-400 transition-all appearance-none cursor-pointer ${dm('bg-white/10 border-white/20 text-white backdrop-blur-xl', 'bg-white border-gray-300 text-gray-900')}`}
            >
              <option value="todos">Todos los niveles</option>
              <option value="bronce" className="bg-slate-800">🥉 Bronce</option>
              <option value="plata" className="bg-slate-800">🥈 Plata</option>
              <option value="oro" className="bg-slate-800">🥇 Oro</option>
              <option value="platino" className="bg-slate-800">💎 Platino</option>
            </select>
            <button
              onClick={cargarDatos}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl border font-semibold text-sm transition-all ${dm('bg-white/10 hover:bg-white/15 border-white/20 text-white/70 hover:text-white backdrop-blur-xl', 'bg-white hover:bg-gray-50 border-gray-300 text-gray-600 hover:text-gray-900')}`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>

          {/* Grid de clientes */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
              ))}
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-20 ${dm('text-white/30', 'text-gray-400')}`}>
              <Users className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-semibold">No hay clientes registrados</p>
              <p className="text-sm mt-1">¡Registra el primer cliente del programa!</p>
              <button
                onClick={() => { setClienteEditar(null); setModalClienteOpen(true); }}
                className="mt-4 flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-sm hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" /> Nuevo Cliente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clientesFiltrados.map(c => (
                <TarjetaCliente key={c.id} cliente={c} onClick={() => handleVerDetalle(c)} />
              ))}
            </div>
          )}

          <p className={`text-sm text-center ${dm('text-white/30', 'text-gray-400')}`}>
            {clientesFiltrados.length} de {clientes.length} clientes
          </p>
        </>
      )}

      {/* ── PESTAÑA: TOP 10 ── */}
      {tab === 'top10' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <h2 className={`text-xl font-bold ${dm('text-white', 'text-gray-900')}`}>Top 10 Clientes más Leales</h2>
          </div>
          {topClientes.length === 0 ? (
            <div className={`text-center py-16 ${dm('text-white/30', 'text-gray-400')}`}>
              <Trophy className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>Aún no hay clientes en el ranking</p>
            </div>
          ) : (
            topClientes.map((c, i) => (
              <div key={c.id} className={`relative overflow-hidden rounded-2xl border transition-all cursor-pointer group ${dm('border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/8', 'border-gray-200 bg-white hover:border-gray-300 shadow-sm')}`}
                onClick={() => handleVerDetalle(c)}>
                {i < 3 && (
                  <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${
                    i === 0 ? 'from-yellow-400 to-amber-500' :
                    i === 1 ? 'from-gray-300 to-gray-500' : 'from-orange-400 to-amber-600'
                  } rounded-l-2xl`} />
                )}
                <div className="flex items-center gap-5 p-5 pl-6">
                  {/* Posición */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-lg shadow-yellow-500/30' :
                    i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white' :
                    i === 2 ? 'bg-gradient-to-br from-orange-400 to-amber-600 text-white' :
                    'bg-white/10 text-white/50'
                  }`}>
                    {i + 1}
                  </div>

                  {/* Avatar con nivel */}
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${NIVEL_META[c.nivelFidelidad]?.gradient} shadow-lg`}>
                    <User className="w-5 h-5 text-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`font-bold ${dm('text-white', 'text-gray-900')}`}>{c.nombre}</span>
                      <NivelBadge nivel={c.nivelFidelidad} size="xs" />
                    </div>
                    <p className={`text-sm ${dm('text-white/40', 'text-gray-400')}`}>{c.telefono} · {c.numeroCompras} compras · {fmtCOP(c.totalCompras)}</p>
                  </div>

                  {/* Puntos */}
                  <div className="text-right shrink-0">
                    <p className={`text-2xl font-black ${NIVEL_META[c.nivelFidelidad]?.color}`}>{fmt(c.puntos)}</p>
                    <p className={`text-xs ${dm('text-white/30', 'text-gray-400')}`}>puntos</p>
                  </div>

                  <ChevronRight className={`w-5 h-5 transition-all shrink-0 ${dm('text-white/20 group-hover:text-white/50', 'text-gray-200 group-hover:text-gray-400')}`} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── PESTAÑA: CONFIGURACIÓN ── */}
      {tab === 'configuracion' && (
        <div className={`rounded-2xl p-8 shadow-xl border ${dm('bg-white/5 backdrop-blur-xl border-white/10', 'bg-white border-gray-200')}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-slate-500 to-slate-700 p-3 rounded-xl">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-xl font-bold ${dm('text-white', 'text-gray-900')}`}>Configuración del Programa</h2>
                <p className={`text-sm ${dm('text-white/50', 'text-gray-500')}`}>Ajusta las reglas de puntos y niveles</p>
              </div>
            </div>
            <button
              onClick={() => setModalConfigOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg"
            >
              <Edit className="w-4 h-4" />
              Editar Configuración
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'Reglas de Puntos', icon: Target, gradient: 'from-blue-500 to-indigo-600',
                items: [
                  '1 punto por cada $1 en compras',
                  '1 punto = $10 de descuento',
                  '100 puntos de bienvenida',
                  'Expiración a los 12 meses',
                ]
              },
              {
                title: 'Multiplicadores', icon: Zap, gradient: 'from-yellow-500 to-orange-500',
                items: [
                  '🥉 Bronce: x1 (base)',
                  '🥈 Plata: x1.2',
                  '🥇 Oro: x1.5',
                  '💎 Platino: x2',
                ]
              },
              {
                title: 'Umbrales de Nivel', icon: Trophy, gradient: 'from-purple-500 to-pink-600',
                items: [
                  '🥈 Plata: 5,000 pts acumulados',
                  '🥇 Oro: 15,000 pts acumulados',
                  '💎 Platino: 50,000 pts acumulados',
                  'Actualización automática',
                ]
              },
            ].map((card, i) => (
              <div key={i} className={`rounded-2xl p-5 border ${dm('bg-white/5 border-white/10', 'bg-gray-50 border-gray-200')}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`bg-gradient-to-br ${card.gradient} p-2.5 rounded-xl`}>
                    <card.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className={`font-bold ${dm('text-white/90', 'text-gray-800')}`}>{card.title}</h3>
                </div>
                <ul className="space-y-2">
                  {card.items.map((item, j) => (
                    <li key={j} className={`flex items-center gap-2 text-sm ${dm('text-white/60', 'text-gray-600')}`}>
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODALES ── */}
      <ModalCliente
        isOpen={modalClienteOpen}
        onClose={() => { setModalClienteOpen(false); setClienteEditar(null); }}
        onSuccess={cargarDatos}
        clienteEditar={clienteEditar}
      />

      <ModalConfig
        isOpen={modalConfigOpen}
        onClose={() => setModalConfigOpen(false)}
        onSuccess={cargarDatos}
      />

      {clienteDetalle && (
        <>
          <ModalDetalle
            isOpen={!!clienteDetalle}
            onClose={() => setClienteDetalle(null)}
            cliente={clienteDetalle}
            historial={historialDetalle}
            onAccion={(modo) => setModalPuntos({ open: true, modo })}
            onEditar={() => {
              setClienteEditar(clienteDetalle);
              setClienteDetalle(null);
              setModalClienteOpen(true);
            }}
          />
          <ModalPuntos
            isOpen={modalPuntos.open}
            onClose={() => setModalPuntos({ ...modalPuntos, open: false })}
            onSuccess={async () => {
              await cargarDatos();
              // Refrescar historial
              const hist = await obtenerHistorialPuntos(clienteDetalle.id, 30);
              setHistorialDetalle(hist);
              // Refrescar cliente
              const updated = await buscarCliente(clienteDetalle.documento);
              if (updated) setClienteDetalle(updated);
            }}
            cliente={clienteDetalle}
            modo={modalPuntos.modo}
          />
        </>
      )}
    </div>
  );
}
