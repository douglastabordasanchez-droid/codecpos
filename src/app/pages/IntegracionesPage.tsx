/**
 * CODEC POS v2.0 — Página de Integraciones
 * Configuración de webhooks para Zapier y n8n
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Workflow, Webhook, Plus, Trash2, Edit, Play, Copy,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  ChevronDown, ChevronRight, Info, Eye, EyeOff, ToggleLeft,
  ToggleRight, Send, Inbox, Activity, Settings2, X, Save,
  ExternalLink, Shield, Wifi, WifiOff, Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { usePOS } from '../contexts/POSContext';
import {
  WebhookConfig, PlataformaWebhook, TipoEvento,
  EVENTOS_CATALOGO, TipoEventoInfo,
  obtenerWebhooks, crearWebhook, actualizarWebhook, eliminarWebhook,
  obtenerLogDisparos, limpiarLog, LogDisparo,
  obtenerColaPendiente, procesarColaOffline,
  obtenerEstadisticasWebhooks, testWebhook,
} from '../lib/webhookService';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const PLATAFORMAS: Record<PlataformaWebhook, { nombre: string; logo: string; color: string; urlPlaceholder: string; guia: string }> = {
  zapier: {
    nombre: 'Zapier',
    logo: '⚡',
    color: 'orange',
    urlPlaceholder: 'https://hooks.zapier.com/hooks/catch/XXXXXX/XXXXXXX/',
    guia: 'En Zapier: crea un nuevo Zap → elige "Webhooks by Zapier" → "Catch Hook" → copia la URL aquí.',
  },
  n8n: {
    nombre: 'n8n',
    logo: '🔄',
    color: 'purple',
    urlPlaceholder: 'http://tu-servidor-n8n:5678/webhook/XXXXXXXX',
    guia: 'En n8n: crea un Workflow → agrega nodo "Webhook" → copia la URL de prueba o producción aquí.',
  },
  custom: {
    nombre: 'Custom HTTP',
    logo: '🌐',
    color: 'blue',
    urlPlaceholder: 'https://tu-api.com/webhook',
    guia: 'Cualquier endpoint que acepte POST con JSON. El payload incluye el evento y los datos del POS.',
  },
};

const CATEGORIAS_EVENTO: Record<string, { nombre: string; icono: string }> = {
  ventas:     { nombre: 'Ventas',     icono: '💰' },
  inventario: { nombre: 'Inventario', icono: '📦' },
  gestion:    { nombre: 'Gestión',    icono: '🏢' },
  sistema:    { nombre: 'Sistema',    icono: '🔔' },
};

type Tab = 'webhooks' | 'log' | 'cola' | 'guia';

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function IntegracionesPage() {
  const { darkMode } = usePOS();
  const [tab, setTab] = useState<Tab>('webhooks');
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [log, setLog] = useState<LogDisparo[]>([]);
  const [cola, setCola] = useState(obtenerColaPendiente());
  const [stats, setStats] = useState(obtenerEstadisticasWebhooks());
  const [online, setOnline] = useState(navigator.onLine);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<WebhookConfig | null>(null);
  const [testando, setTestando] = useState<string | null>(null); // webhookId
  const [procesandoCola, setProcesandoCola] = useState(false);

  const refrescar = useCallback(() => {
    setWebhooks(obtenerWebhooks());
    setLog(obtenerLogDisparos());
    setCola(obtenerColaPendiente());
    setStats(obtenerEstadisticasWebhooks());
  }, []);

  useEffect(() => {
    refrescar();
    const handleOnline = () => { setOnline(true); refrescar(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refrescar]);

  const handleToggleWebhook = (id: string, activo: boolean) => {
    actualizarWebhook(id, { activo: !activo });
    refrescar();
    toast.info(!activo ? 'Webhook activado' : 'Webhook pausado');
  };

  const handleEliminar = (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el webhook "${nombre}"?`)) return;
    eliminarWebhook(id);
    refrescar();
    toast.success('Webhook eliminado');
  };

  const handleTest = async (webhook: WebhookConfig) => {
    if (!webhook.eventosActivos.length) {
      toast.error('Este webhook no tiene eventos configurados');
      return;
    }
    setTestando(webhook.id);
    const resultado = await testWebhook(webhook, webhook.eventosActivos[0]);
    setTestando(null);
    refrescar();
    if (resultado.ok) {
      toast.success('Test exitoso', { description: resultado.mensaje });
    } else {
      toast.error('Test fallido', { description: resultado.mensaje });
    }
  };

  const handleProcesarCola = async () => {
    setProcesandoCola(true);
    const r = await procesarColaOffline();
    setProcesandoCola(false);
    refrescar();
    toast.info(`Cola procesada: ${r.enviados} enviados, ${r.fallidos} fallidos`);
  };

  const cardBase = `${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'} border rounded-2xl`;

  return (
    <div className={`min-h-screen overflow-y-auto p-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl flex items-center justify-center shadow-xl">
              <Webhook className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black">Integraciones</h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Conecta CODEC POS con Zapier, n8n y cualquier servicio HTTP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Estado de conexión */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${
              online
                ? darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                : darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700'
            }`}>
              {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {online ? 'En línea' : 'Sin conexión'}
            </div>
            <Button
              onClick={() => { setEditando(null); setShowModal(true); }}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 font-bold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Webhook
            </Button>
          </div>
        </motion.div>

        {/* ── ESTADÍSTICAS ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Webhooks', value: stats.totalWebhooks, icon: Webhook, color: 'violet' },
            { label: 'Activos', value: stats.activos, icon: CheckCircle2, color: 'emerald' },
            { label: 'Disparos', value: stats.totalDisparos, icon: Send, color: 'blue' },
            { label: 'Errores', value: stats.totalErrores, icon: XCircle, color: 'red' },
            { label: 'En Cola', value: stats.enCola, icon: Inbox, color: 'amber' },
            { label: 'Hoy OK', value: stats.exitososHoy, icon: Activity, color: 'green' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className={cardBase}>
              <CardContent className="p-4">
                <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
                <p className={`text-2xl font-black text-${color}-500`}>{value}</p>
                <Icon className={`w-5 h-5 text-${color}-400 mt-1 opacity-60`} />
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* ── TABS ── */}
        <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
          {([
            { id: 'webhooks', label: 'Webhooks', icon: Webhook },
            { id: 'log',      label: 'Log de Disparos', icon: Activity },
            { id: 'cola',     label: `Cola Offline${stats.enCola > 0 ? ` (${stats.enCola})` : ''}`, icon: Inbox },
            { id: 'guia',     label: 'Guía de Uso', icon: Info },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                tab === id
                  ? darkMode
                    ? 'bg-violet-700 text-white shadow'
                    : 'bg-white text-violet-700 shadow'
                  : darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>

        {/* ─────────── TAB: WEBHOOKS ─────────── */}
        {tab === 'webhooks' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {webhooks.length === 0 ? (
              <Card className={cardBase}>
                <CardContent className="p-16 text-center">
                  <Webhook className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <h3 className="text-xl font-bold mb-2">Sin webhooks configurados</h3>
                  <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Crea tu primer webhook para conectar el POS con Zapier o n8n
                  </p>
                  <Button
                    onClick={() => { setEditando(null); setShowModal(true); }}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Crear Primer Webhook
                  </Button>
                </CardContent>
              </Card>
            ) : (
              webhooks.map(webhook => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  darkMode={darkMode}
                  testando={testando === webhook.id}
                  onToggle={() => handleToggleWebhook(webhook.id, webhook.activo)}
                  onEdit={() => { setEditando(webhook); setShowModal(true); }}
                  onDelete={() => handleEliminar(webhook.id, webhook.nombre)}
                  onTest={() => handleTest(webhook)}
                />
              ))
            )}
          </motion.div>
        )}

        {/* ─────────── TAB: LOG ─────────── */}
        {tab === 'log' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Últimos {log.length} disparos registrados
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { limpiarLog(); refrescar(); toast.info('Log limpiado'); }}
                className={darkMode ? 'border-slate-600 text-gray-400' : ''}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Limpiar log
              </Button>
            </div>

            {log.length === 0 ? (
              <Card className={cardBase}>
                <CardContent className="p-12 text-center">
                  <Activity className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                    Aún no hay disparos registrados
                  </p>
                </CardContent>
              </Card>
            ) : (
              log.map(entry => (
                <LogEntry key={entry.id} entry={entry} darkMode={darkMode} />
              ))
            )}
          </motion.div>
        )}

        {/* ─────────── TAB: COLA ─────────── */}
        {tab === 'cola' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Cola Offline</h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Eventos que no pudieron enviarse y esperan reintento
                </p>
              </div>
              {cola.length > 0 && (
                <Button
                  onClick={handleProcesarCola}
                  disabled={procesandoCola || !online}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  {procesandoCola ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {procesandoCola ? 'Enviando...' : `Reintentar ${cola.length} eventos`}
                </Button>
              )}
            </div>

            {cola.length === 0 ? (
              <Card className={cardBase}>
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-semibold text-emerald-500">Cola vacía</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Todos los eventos fueron enviados correctamente
                  </p>
                </CardContent>
              </Card>
            ) : (
              cola.map(item => (
                <Card key={item.id} className={`${cardBase} border-l-4 border-l-amber-500`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-amber-500" />
                          <span className="font-semibold text-sm">{item.webhookUrl}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                            Intento {item.intentos + 1}/{item.maxIntentos}
                          </span>
                        </div>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Creado: {new Date(item.creadoEn).toLocaleString('es-CO')}
                        </p>
                        {item.error && (
                          <p className="text-xs text-red-500 mt-1">Error: {item.error}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </motion.div>
        )}

        {/* ─────────── TAB: GUÍA ─────────── */}
        {tab === 'guia' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <GuiaUso darkMode={darkMode} cardBase={cardBase} />
          </motion.div>
        )}

      </div>

      {/* ── MODAL CREAR / EDITAR ── */}
      <AnimatePresence>
        {showModal && (
          <WebhookModal
            darkMode={darkMode}
            editando={editando}
            onClose={() => { setShowModal(false); setEditando(null); }}
            onSaved={refrescar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// TARJETA DE WEBHOOK
// ─────────────────────────────────────────────
function WebhookCard({
  webhook, darkMode, testando,
  onToggle, onEdit, onDelete, onTest,
}: {
  webhook: WebhookConfig;
  darkMode: boolean;
  testando: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const plat = PLATAFORMAS[webhook.plataforma];
  const [expandido, setExpandido] = useState(false);

  return (
    <Card className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border rounded-2xl transition-shadow hover:shadow-lg`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icono plataforma */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
            webhook.plataforma === 'zapier' ? 'bg-orange-500/15' :
            webhook.plataforma === 'n8n' ? 'bg-purple-500/15' : 'bg-blue-500/15'
          }`}>
            {plat.logo}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base">{webhook.nombre}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                webhook.plataforma === 'zapier' ? 'bg-orange-500/15 text-orange-500' :
                webhook.plataforma === 'n8n' ? 'bg-purple-500/15 text-purple-500' : 'bg-blue-500/15 text-blue-500'
              }`}>
                {plat.nombre}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                webhook.activo
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : darkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}>
                {webhook.activo ? '● Activo' : '○ Pausado'}
              </span>
            </div>

            <p className={`text-xs mt-1 font-mono truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {webhook.url}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {webhook.eventosActivos.map(e => {
                const info = EVENTOS_CATALOGO.find(ev => ev.id === e);
                return (
                  <span key={e} className={`text-xs px-2 py-0.5 rounded-full ${
                    darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {info?.icono} {info?.nombre}
                  </span>
                );
              })}
            </div>

            {expandido && (
              <div className={`mt-3 p-3 rounded-xl text-xs grid grid-cols-2 md:grid-cols-4 gap-3 ${
                darkMode ? 'bg-slate-700/40' : 'bg-gray-50'
              }`}>
                <div>
                  <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Disparos</p>
                  <p className="font-bold">{webhook.totalDisparos}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Errores</p>
                  <p className="font-bold text-red-500">{webhook.totalErrores}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Último disparo</p>
                  <p className="font-bold">{webhook.ultimoDisparo ? new Date(webhook.ultimoDisparo).toLocaleDateString('es-CO') : '—'}</p>
                </div>
                <div>
                  <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Creado</p>
                  <p className="font-bold">{new Date(webhook.creadoEn).toLocaleDateString('es-CO')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setExpandido(e => !e)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={testando}
              className="border-violet-500 text-violet-500 hover:bg-violet-50"
              title="Enviar test"
            >
              {testando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            </Button>
            <button
              onClick={onToggle}
              className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${
                webhook.activo ? 'bg-emerald-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${webhook.activo ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <Button size="sm" variant="outline" onClick={onEdit} className={darkMode ? 'border-slate-600' : ''}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={onDelete} className="border-red-500 text-red-500 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// ENTRADA DE LOG
// ─────────────────────────────────────────────
function LogEntry({ entry, darkMode }: { entry: LogDisparo; darkMode: boolean }) {
  const infoEvento = EVENTOS_CATALOGO.find(e => e.id === entry.evento);
  const colorBorder = entry.estado === 'exitoso' ? 'border-l-emerald-500' :
                      entry.estado === 'en_cola' ? 'border-l-amber-500' : 'border-l-red-500';

  return (
    <Card className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl border-l-4 ${colorBorder}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">{infoEvento?.icono}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{infoEvento?.nombre}</span>
              <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>→ {entry.webhookNombre}</span>
              {entry.statusCode && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  entry.statusCode < 300
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : 'bg-red-500/15 text-red-600'
                }`}>
                  {entry.statusCode}
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {entry.mensaje} · {new Date(entry.timestamp).toLocaleString('es-CO')}
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 ${
            entry.estado === 'exitoso' ? 'bg-emerald-500/15 text-emerald-500' :
            entry.estado === 'en_cola' ? 'bg-amber-500/15 text-amber-500' :
            'bg-red-500/15 text-red-500'
          }`}>
            {entry.estado === 'exitoso' ? '✓ OK' : entry.estado === 'en_cola' ? '⏳ Cola' : '✗ Error'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// MODAL CREAR / EDITAR
// ─────────────────────────────────────────────
function WebhookModal({
  darkMode, editando, onClose, onSaved,
}: {
  darkMode: boolean;
  editando: WebhookConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    plataforma: (editando?.plataforma ?? 'zapier') as PlataformaWebhook,
    nombre: editando?.nombre ?? '',
    url: editando?.url ?? '',
    secretHeader: editando?.secretHeader ?? '',
    secretValue: editando?.secretValue ?? '',
    activo: editando?.activo ?? true,
    eventosActivos: (editando?.eventosActivos ?? []) as TipoEvento[],
  });
  const [showSecret, setShowSecret] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const toggleEvento = (id: TipoEvento) => {
    setForm(f => ({
      ...f,
      eventosActivos: f.eventosActivos.includes(id)
        ? f.eventosActivos.filter(e => e !== id)
        : [...f.eventosActivos, id],
    }));
  };

  const seleccionarTodos = () => {
    setForm(f => ({
      ...f,
      eventosActivos: EVENTOS_CATALOGO.map(e => e.id),
    }));
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.url.trim() || !form.url.startsWith('http')) { toast.error('URL inválida — debe comenzar con http'); return; }
    if (form.eventosActivos.length === 0) { toast.error('Selecciona al menos un evento'); return; }

    setGuardando(true);
    await new Promise(r => setTimeout(r, 400)); // UX feedback

    if (editando) {
      actualizarWebhook(editando.id, form);
      toast.success('Webhook actualizado');
    } else {
      crearWebhook(form);
      toast.success('Webhook creado', { description: `Conectado a ${PLATAFORMAS[form.plataforma].nombre}` });
    }

    setGuardando(false);
    onSaved();
    onClose();
  };

  const plat = PLATAFORMAS[form.plataforma];
  const cardBase = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border rounded-xl`;

  // Agrupar eventos por categoría
  const eventosPorCat = EVENTOS_CATALOGO.reduce((acc, e) => {
    if (!acc[e.categoria]) acc[e.categoria] = [];
    acc[e.categoria].push(e);
    return acc;
  }, {} as Record<string, TipoEventoInfo[]>);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 24 }}
        transition={{ type: 'spring', damping: 25, stiffness: 280 }}
        className={`w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
          darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <h2 className="text-xl font-black">{editando ? 'Editar Webhook' : 'Nuevo Webhook'}</h2>
          <button onClick={onClose} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* 1. Plataforma */}
          <div className="space-y-2">
            <Label className={darkMode ? 'text-gray-300' : ''}>Plataforma</Label>
            <div className="grid grid-cols-3 gap-3">
              {(['zapier', 'n8n', 'custom'] as PlataformaWebhook[]).map(p => {
                const info = PLATAFORMAS[p];
                const sel = form.plataforma === p;
                return (
                  <button
                    key={p}
                    onClick={() => setForm(f => ({ ...f, plataforma: p, url: '' }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      sel
                        ? p === 'zapier' ? 'border-orange-500 bg-orange-500/10' :
                          p === 'n8n' ? 'border-purple-500 bg-purple-500/10' :
                          'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 hover:border-slate-500' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div className="text-2xl mb-1">{info.logo}</div>
                    <div className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{info.nombre}</div>
                  </button>
                );
              })}
            </div>

            {/* Guía de la plataforma */}
            <div className={`p-3 rounded-xl text-xs flex gap-2 ${darkMode ? 'bg-slate-800 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {plat.guia}
            </div>
          </div>

          {/* 2. Nombre y URL */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className={darkMode ? 'text-gray-300' : ''}>Nombre descriptivo *</Label>
              <Input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder={`Ej: Ventas → Google Sheets (${plat.nombre})`}
                className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={darkMode ? 'text-gray-300' : ''}>URL del Webhook *</Label>
              <Input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder={plat.urlPlaceholder}
                className={`font-mono text-xs ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
              />
            </div>
          </div>

          {/* 3. Autenticación opcional */}
          <div className={`p-4 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200 bg-gray-50/60'}`}>
            <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <Shield className="w-4 h-4" /> Autenticación (opcional)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Header</Label>
                <Input
                  value={form.secretHeader}
                  onChange={e => setForm(f => ({ ...f, secretHeader: e.target.value }))}
                  placeholder="X-Api-Key"
                  className={`text-xs ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Valor</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={form.secretValue}
                    onChange={e => setForm(f => ({ ...f, secretValue: e.target.value }))}
                    placeholder="••••••••"
                    className={`pr-9 text-xs ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Eventos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className={darkMode ? 'text-gray-300' : ''}>
                Eventos que disparan este webhook *
                <span className={`ml-2 text-xs font-normal ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  ({form.eventosActivos.length} seleccionados)
                </span>
              </Label>
              <button
                onClick={seleccionarTodos}
                className={`text-xs underline ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}
              >
                Seleccionar todos
              </button>
            </div>

            {Object.entries(eventosPorCat).map(([cat, eventos]) => {
              const catInfo = CATEGORIAS_EVENTO[cat];
              return (
                <div key={cat} className={`rounded-xl border p-3 space-y-2 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {catInfo.icono} {catInfo.nombre}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {eventos.map(ev => {
                      const sel = form.eventosActivos.includes(ev.id);
                      return (
                        <button
                          key={ev.id}
                          onClick={() => toggleEvento(ev.id)}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                            sel
                              ? darkMode
                                ? 'border-violet-600 bg-violet-900/20'
                                : 'border-violet-500 bg-violet-50'
                              : darkMode
                              ? 'border-slate-600 hover:border-slate-500'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-base flex-shrink-0 mt-0.5">{ev.icono}</span>
                          <div>
                            <p className={`text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{ev.nombre}</p>
                            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{ev.descripcion}</p>
                          </div>
                          {sel && <CheckCircle2 className="w-4 h-4 text-violet-500 flex-shrink-0 ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <Button variant="outline" onClick={onClose} className={darkMode ? 'border-slate-600 text-gray-300' : ''}>
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={guardando}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 font-bold"
          >
            {guardando ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {editando ? 'Guardar cambios' : 'Crear Webhook'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// GUÍA DE USO
// ─────────────────────────────────────────────
function GuiaUso({ darkMode, cardBase }: { darkMode: boolean; cardBase: string }) {
  return (
    <>
      {/* Arquitectura */}
      <Card className={cardBase}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-500" /> ¿Cómo funciona la integración?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            {[
              { paso: '1', titulo: 'Evento en el POS', desc: 'Se realiza una venta, se registra un gasto, el stock cae...', icono: '🏪' },
              { paso: '2', titulo: 'Webhook disparado', desc: 'CODEC POS envía automáticamente un POST JSON a tu URL configurada', icono: '🚀' },
              { paso: '3', titulo: 'Zapier / n8n actúa', desc: 'Tu flujo de automatización recibe los datos y ejecuta la acción', icono: '⚡' },
            ].map(({ paso, titulo, desc, icono }) => (
              <div key={paso} className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-gray-50'}`}>
                <div className="text-3xl mb-2">{icono}</div>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full mb-2 inline-block ${darkMode ? 'bg-violet-800 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>Paso {paso}</div>
                <p className="font-bold text-sm mb-1">{titulo}</p>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
              </div>
            ))}
          </div>

          <div className={`p-3 rounded-xl text-xs flex gap-2 ${darkMode ? 'bg-amber-900/20 text-amber-300 border border-amber-700/30' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
            <WifiOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span><strong>Modo offline:</strong> Si el POS no tiene internet cuando ocurre un evento, este se guarda en la Cola Offline y se reintenta automáticamente al reconectar (hasta 5 reintentos con backoff exponencial).</span>
          </div>
        </CardContent>
      </Card>

      {/* Zapier */}
      <Card className={`${cardBase} border-l-4 border-l-orange-500`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-500">
            ⚡ Configurar Zapier
          </CardTitle>
          <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
            Conecta el POS con más de 7.000 aplicaciones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'Ve a zapier.com → Crear Zap → Elegir trigger',
            'Busca "Webhooks by Zapier" → selecciona "Catch Hook"',
            'Copia la URL generada (ej: https://hooks.zapier.com/hooks/catch/12345/abcde/)',
            'Pégala en CODEC POS → Nuevo Webhook → Plataforma: Zapier',
            'Activa los eventos que quieras escuchar y guarda',
            'Vuelve a Zapier → haz clic en "Test trigger" para ver el payload',
            'Configura la acción: Gmail, Sheets, WhatsApp, Slack, etc.',
          ].map((paso, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${darkMode ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>{i + 1}</span>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{paso}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* n8n */}
      <Card className={`${cardBase} border-l-4 border-l-purple-500`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-500">
            🔄 Configurar n8n
          </CardTitle>
          <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
            Automatización 100% open source, se puede alojar en tu servidor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'Abre tu instancia n8n (local o cloud) → New Workflow',
            'Agrega un nodo "Webhook" como trigger',
            'Selecciona método: POST → copia la URL de Test o Production',
            'Pégala en CODEC POS → Nuevo Webhook → Plataforma: n8n',
            'Activa los eventos y haz un Test desde CODEC POS',
            'El payload aparecerá en n8n → agrega los nodos siguientes (Email, Airtable, Telegram, etc.)',
            'Activa el workflow en n8n para que esté listo en producción',
          ].map((paso, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>{i + 1}</span>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{paso}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payload ejemplo */}
      <Card className={cardBase}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-violet-500" /> Estructura del Payload JSON
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className={`text-xs rounded-xl p-4 overflow-x-auto ${darkMode ? 'bg-slate-900 text-emerald-400' : 'bg-gray-900 text-emerald-400'}`}>
{`{
  // ── Campos del evento ──
  "evento": "venta_completada",
  "tienda": "Minimercado El Éxito",
  "total": 45800,
  "metodoPago": "Nequi",
  "productos": 3,
  "cajero": "maria_cajera",
  "timestamp": "2026-03-03T14:32:00.000Z",

  // ── Metadatos CODEC POS ──
  "_codec_pos_version": "2.0",
  "_evento": "venta_completada",
  "_timestamp": "2026-03-03T14:32:00.123Z",
  "_online": true,

  // Solo en reintentos de cola:
  "_reintento": 1
}`}
          </pre>
        </CardContent>
      </Card>

      {/* Casos de uso */}
      <Card className={cardBase}>
        <CardHeader>
          <CardTitle>💡 Ideas de automatización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { evento: '💰 Venta completada', accion: 'Registrar en Google Sheets automáticamente' },
              { evento: '⚠️ Stock bajo', accion: 'Enviar WhatsApp al proveedor para pedir' },
              { evento: '🧮 Cierre de caja', accion: 'Email de resumen diario al dueño del negocio' },
              { evento: '👤 Nuevo cliente', accion: 'Agregarlo a CRM o lista de Mailchimp' },
              { evento: '🗓️ Producto por vencer', accion: 'Alerta en Telegram o Slack' },
              { evento: '💸 Gasto registrado', accion: 'Notificar al contador en tiempo real' },
              { evento: '↩️ Devolución', accion: 'Crear tarea en Notion o Trello' },
              { evento: '🚚 Pedido proveedor', accion: 'Enviar email confirmación al proveedor' },
            ].map(({ evento, accion }) => (
              <div key={evento} className={`p-3 rounded-xl flex items-start gap-2.5 ${darkMode ? 'bg-slate-700/40' : 'bg-gray-50'}`}>
                <span className="text-base">{evento.split(' ')[0]}</span>
                <div>
                  <p className={`text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{evento.slice(3)}</p>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>→ {accion}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
