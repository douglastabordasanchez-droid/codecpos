// CODEC POS v2.0 — Monitoreo de Terminales en Red Local
// Sistema de vigilancia estilo cybercafé: detecta y supervisa cada terminal POS conectada

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor, Wifi, WifiOff, Activity, Eye, Copy, Check,
  RefreshCw, Search, Server, X, ChevronDown, ChevronUp,
  AlertCircle, Signal, Network, TrendingUp, DollarSign,
  Users, Clock, ShoppingCart, Zap, Radio, Globe,
  CheckCircle2, Settings, Send, Database, ArrowRightLeft,
  Wrench, Shield, Package, Cloud, CloudOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanContext, TerminalCard } from '../../contexts/LanContext';
import { LanConnectionState, lanService } from '../../lib/lanService';
import { getRoleLabel, getRoleBadgeColor } from '../../lib/terminalRoles';
import { tallerService } from '../../services/tallerService';

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getSubnet(ip: string): string {
  if (!ip) return '—';
  const parts = ip.split('.');
  if (parts.length !== 4) return '—';
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface WifiNetwork {
  ssid: string;
  signal: number | null;
  auth: string | null;
  channel: number | null;
}

interface NetworkAuthTerminal {
  ip: string;
  nombre: string;
  username: string;
  rol: string;
  loginAt: string;
  terminalId: string;
  hostname: string;
}

type TransferModulo = 'taller' | 'soporte' | 'restaurante';
type TransferTipo = 'respaldo_caja' | 'ordenes_pendientes' | 'comandas_mesa' | 'bd_local';

const TRANSFER_MODULOS: { id: TransferModulo; label: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'taller',      label: 'Taller Reparaciones',  Icon: Wrench,      desc: 'Órdenes y técnicos' },
  { id: 'soporte',     label: 'Soporte Técnico',       Icon: Shield,      desc: 'Logs y diagnóstico' },
  { id: 'restaurante', label: 'Restaurante / Pan.',    Icon: ShoppingCart,desc: 'Mesas y comandas'   },
];

const TRANSFER_TIPOS: { id: TransferTipo; label: string; desc: string }[] = [
  { id: 'respaldo_caja',      label: 'Respaldo de Caja',      desc: 'Ventas del día + sesiones' },
  { id: 'ordenes_pendientes', label: 'Órdenes Pendientes',    desc: 'Órdenes del taller sin completar' },
  { id: 'comandas_mesa',      label: 'Comandas de Mesa',      desc: 'Cuentas abiertas por mesa' },
  { id: 'bd_local',           label: 'Base de Datos Local',   desc: 'Exportación completa del POS' },
];

const safe = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };

async function collectTransferData(tipo: TransferTipo): Promise<unknown> {
  switch (tipo) {
    case 'respaldo_caja': return {
      ventas: safe('pos-ventas-dia'),
      caja:   safe('pos-caja-sesiones-diarias'),
      gastos: safe('pos-gastos'),
      turno:  safe('pos-turnos'),
    };
    case 'ordenes_pendientes': {
      // El Taller usa IndexedDB (codec_pos_taller) — leer via tallerService
      try {
        await tallerService.init();
        const ordenes = await tallerService.getOrdenes({});
        return { ordenes, clientes: [] };
      } catch {
        return { ordenes: [], clientes: [] };
      }
    }
    case 'comandas_mesa': return {
      // Panadería usa claves específicas de localStorage
      mesas:        safe('codecpos_mesas_config'),
      cuentas:      safe('codecpos_mesas_cuentas'),
      cuentaLibre:  safe('codecpos_panaderia_cuenta_libre'),
      categorias:   safe('codecpos_panaderia_cats'),
    };
    case 'bd_local': {
      const data: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('pos-') || key?.startsWith('codecpos')) data[key!] = safe(key!);
      }
      // Incluir también snapshot de Taller (IndexedDB)
      try {
        await tallerService.init();
        const ordenes = await tallerService.getOrdenes({});
        data['__taller_ordenes_idb__'] = ordenes;
      } catch {}
      return data;
    }
  }
}

// ── LED pulsante ──────────────────────────────────────────────────────────────

function PulsingLed({ connected }: { connected: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {connected && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${connected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
    </span>
  );
}

// ── Badge tipo conexión ───────────────────────────────────────────────────────

function ConnectionTypeBadge({ wifiSsid, dark, transport }: { wifiSsid?: string | null; dark: boolean; transport?: 'lan' | 'cloud' }) {
  // Tercera vía: la terminal no está en esta red — llega por el relay de
  // Supabase (otra sede, datos móviles, otro Wi-Fi). Ver cloudRelayService.ts.
  if (transport === 'cloud') return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-700'}`} title="Conectada por internet (Supabase), fuera de esta red local">
      <Cloud className="w-2.5 h-2.5" />
      Nube
    </span>
  );
  if (wifiSsid === undefined || wifiSsid === null) return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
      <Network className="w-2.5 h-2.5" />
      TCP/IP
    </span>
  );
  if (wifiSsid === '') return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? 'bg-cyan-900/50 text-cyan-300' : 'bg-cyan-50 text-cyan-700'}`}>
      <Network className="w-2.5 h-2.5" />
      LAN Cable
    </span>
  );
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-700'}`} title={`WiFi: ${wifiSsid}`}>
      <Wifi className="w-2.5 h-2.5" />
      WiFi
    </span>
  );
}

// ── Modal de Auditoría ────────────────────────────────────────────────────────

function AuditoriaModal({
  terminal,
  onClose,
  onRefresh,
}: {
  terminal: TerminalCard;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { darkMode } = usePOS();
  const dark = darkMode;
  const audit = terminal.auditData;

  const bg = dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const head = dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const cardBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`rounded-2xl shadow-2xl border w-full max-w-2xl max-h-[85vh] overflow-hidden ${bg}`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${head}`}>
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className={`font-bold text-base ${text}`}>Auditoría — {terminal.cajeroNombre}</h3>
              <p className={`text-xs ${muted}`}>{terminal.cajeroIp} · Terminal {terminal.terminalId.slice(-8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <RefreshCw className="w-4 h-4 text-blue-400" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(85vh-80px)] space-y-4">
          {audit === undefined && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
              <p className={`text-sm ${muted}`}>Solicitando snapshot a la terminal…</p>
            </div>
          )}

          {audit === null && (
            <div className="flex flex-col items-center gap-3 py-10">
              <AlertCircle className="w-10 h-10 text-yellow-500" />
              <p className={`text-sm ${muted}`}>No se recibió respuesta. La terminal puede estar ocupada.</p>
              <button onClick={onRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
                Reintentar
              </button>
            </div>
          )}

          {audit && (
            <>
              <div className={`rounded-xl border p-4 ${cardBg}`}>
                <h4 className={`text-xs font-bold uppercase mb-2 ${muted}`}>Info de la Terminal</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: 'Cajero', v: terminal.cajeroNombre },
                    { l: 'IP Local', v: terminal.cajeroIp || '—' },
                    { l: 'Rol', v: terminal.cajeroRol },
                    { l: 'Hostname', v: terminal.machineHostname || '—' },
                    { l: 'Timestamp', v: new Date((audit as any).timestamp || '').toLocaleTimeString('es-CO') },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <p className={`text-xs ${muted}`}>{l}</p>
                      <p className={`text-sm font-semibold ${text}`}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {(audit as any).turnoActivo && (
                <div className={`rounded-xl border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold uppercase mb-2 ${muted}`}>Turno Activo</h4>
                  <p className={`text-sm font-semibold ${text}`}>
                    Iniciado: {new Date((audit as any).turnoActivo?.inicio || '').toLocaleTimeString('es-CO')}
                  </p>
                </div>
              )}

              {Array.isArray((audit as any).ventasHoy) && (audit as any).ventasHoy.length > 0 && (
                <div className={`rounded-xl border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold uppercase mb-3 ${muted}`}>
                    Últimas Ventas ({(audit as any).ventasHoy.length})
                  </h4>
                  <div className="space-y-2">
                    {((audit as any).ventasHoy as any[]).map((v: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className={muted}>
                          {new Date(v.fecha || v.createdAt || '').toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{v.metodoPago || 'N/A'}
                        </span>
                        <span className={`font-bold ${text}`}>
                          ${Number(v.total || 0).toLocaleString('es-CO')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray((audit as any).gastos) && (audit as any).gastos.length > 0 && (
                <div className={`rounded-xl border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold uppercase mb-3 ${muted}`}>Gastos Recientes</h4>
                  <div className="space-y-2">
                    {((audit as any).gastos as any[]).map((g: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className={muted}>{g.categoria || 'General'} — {g.descripcion?.slice(0, 28) || ''}</span>
                        <span className="font-bold text-red-400">-${Number(g.monto || 0).toLocaleString('es-CO')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Barra de señal Wi-Fi ─────────────────────────────────────────────────────

function SignalBars({ signal, dark }: { signal: number | null; dark: boolean }) {
  const pct = signal ?? 0;
  const bars = pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
  const color = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400';
  const dimColor = dark ? 'bg-slate-600' : 'bg-gray-200';
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`w-1.5 rounded-sm transition-colors ${i <= bars ? color : dimColor}`}
             style={{ height: `${i * 4}px` }} />
      ))}
    </div>
  );
}

// ── Lista de redes Wi-Fi detectadas ──────────────────────────────────────────

function WifiNetworksList({ networks, dark, onClose }: {
  networks: WifiNetwork[];
  dark: boolean;
  onClose: () => void;
}) {
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const bg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const row = dark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`rounded-2xl border ${bg}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-blue-400" />
          <h3 className={`text-sm font-bold ${text}`}>Redes Wi-Fi Visibles</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            {networks.length} redes
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className={`w-3.5 h-3.5 ${muted}`} />
        </button>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {networks.map((n, i) => (
          <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${row}`}>
            <SignalBars signal={n.signal} dark={dark} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold truncate ${text}`}>{n.ssid}</p>
              <p className={`text-[10px] ${muted}`}>
                {n.signal != null ? `${n.signal}%` : '—'}
                {n.auth ? ` · ${n.auth.replace('WPA2-Personal', 'WPA2').replace('WPA3-Personal', 'WPA3')}` : ''}
                {n.channel ? ` · ch${n.channel}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Modal de Transferencia POS a POS ─────────────────────────────────────────

function TransferModal({ terminals, localNombre, dark, onClose, onSend }: {
  terminals: TerminalCard[];
  localNombre: string;
  dark: boolean;
  onClose: () => void;
  onSend: (params: { modulo: TransferModulo; tipo: TransferTipo; target: TerminalCard | null; targetIp?: string }) => Promise<void>;
}) {
  const [modulo, setModulo] = useState<TransferModulo>('taller');
  const [tipo, setTipo] = useState<TransferTipo>('respaldo_caja');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [useManualIp, setUseManualIp] = useState(false);
  const [sending, setSending] = useState(false);

  const bg = dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const head = dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const cardBg = dark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-slate-50 border-slate-200 hover:border-slate-300';

  const onlineTerminals = terminals.filter(t => t.connected);

  const canSend = useManualIp
    ? manualIp.trim().length >= 7
    : onlineTerminals.length === 0 || !!targetId;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (useManualIp) {
        await onSend({ modulo, tipo, target: null, targetIp: manualIp.trim() });
      } else {
        const target = onlineTerminals.find(t => t.terminalId === targetId) ?? null;
        await onSend({ modulo, tipo, target });
      }
    } finally { setSending(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`rounded-2xl shadow-2xl border w-full max-w-lg max-h-[90vh] overflow-y-auto ${bg}`}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10 ${head}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow">
              <ArrowRightLeft className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className={`font-bold text-base ${text}`}>Transferir Archivos POS a POS</h3>
              <p className={`text-xs ${muted}`}>Desde: {localNombre}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Terminal destino */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-bold uppercase tracking-wider ${muted}`}>Terminal Destino</p>
              <button
                onClick={() => setUseManualIp(!useManualIp)}
                className={`text-xs font-semibold px-2 py-0.5 rounded-lg transition-colors ${
                  useManualIp
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : dark ? 'bg-slate-700 text-slate-400 border border-slate-600' : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {useManualIp ? 'Usar LAN' : 'IP Manual'}
              </button>
            </div>

            {useManualIp ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={manualIp}
                  onChange={e => setManualIp(e.target.value)}
                  placeholder="192.168.x.x"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    dark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900'
                  }`}
                />
                <p className={`text-xs ${muted}`}>
                  Se conectará a <strong>{manualIp || 'la IP ingresada'}</strong>:4002/api/network/receive-file
                </p>
              </div>
            ) : onlineTerminals.length === 0 ? (
              <div className={`rounded-xl border p-3 text-sm ${dark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                Sin terminales en línea. Usa "IP Manual" para enviar directamente por HTTP.
              </div>
            ) : (
              <div className="space-y-1.5">
                {onlineTerminals.map(t => (
                  <button
                    key={t.terminalId}
                    onClick={() => setTargetId(t.terminalId)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      targetId === t.terminalId
                        ? 'border-violet-500 bg-violet-500/10'
                        : cardBg
                    }`}
                  >
                    <Monitor className={`w-4 h-4 shrink-0 ${targetId === t.terminalId ? 'text-violet-400' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${text}`}>{t.cajeroNombre}</p>
                      <p className={`text-xs ${muted}`}>{t.cajeroIp} · {getRoleLabel(t.cajeroRol)}</p>
                    </div>
                    {targetId === t.terminalId && <Check className="w-4 h-4 text-violet-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Módulo destino */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>Módulo Destino</p>
            <div className="grid grid-cols-3 gap-2">
              {TRANSFER_MODULOS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setModulo(m.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    modulo === m.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : cardBg
                  }`}
                >
                  <m.Icon className={`w-5 h-5 ${modulo === m.id ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-semibold text-center leading-tight ${text}`}>{m.label}</span>
                  <span className={`text-[9px] text-center ${muted}`}>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de información */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${muted}`}>Tipo de Información</p>
            <div className="space-y-1.5">
              {TRANSFER_TIPOS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTipo(t.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    tipo === t.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : cardBg
                  }`}
                >
                  <Database className={`w-4 h-4 shrink-0 ${tipo === t.id ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${text}`}>{t.label}</p>
                    <p className={`text-xs ${muted}`}>{t.desc}</p>
                  </div>
                  {tipo === t.id && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Botón enviar */}
          <button
            onClick={handleSend}
            disabled={sending || !canSend}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/30"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Enviando...</>
              : <><Send className="w-4 h-4" /> Enviar Transferencia</>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Tarjeta de Terminal (estilo cybercafé) ────────────────────────────────────

function TerminalStation({
  terminal,
  stationNumber,
  dark,
  onAudit,
}: {
  terminal: TerminalCard;
  stationNumber: number;
  dark: boolean;
  onAudit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = terminal.connected;
  const isAdmin = terminal.cajeroRol === 'super_usuario';

  const elapsedSec = terminal.lastSeen
    ? Math.round((Date.now() - terminal.lastSeen) / 1000)
    : null;

  const salesEvents = terminal.recentEvents.filter(e => e.raw.type === 'VENTA_NUEVA');
  const totalFromEvents = salesEvents.reduce(
    (sum, e) => sum + Number(e.raw.payload?.total ?? 0), 0
  );

  // 📡 Último cierre de caja recibido de esta terminal (vía LAN) — se muestra
  // aunque el cajero ya haya cerrado sesión, para que el Admin (u otro
  // cajero) tenga el reporte a la vista sin ir físicamente a esa terminal.
  const ultimoCierreEvent = terminal.recentEvents.find(e => e.raw.type === 'CAJA_CIERRE');
  const ultimoCierrePayload = ultimoCierreEvent?.raw.payload as {
    totalVentas?: number; diferencia?: number; cajero?: string;
  } | undefined;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-3xl border-2 overflow-hidden transition-all ${
        isOnline
          ? dark
            ? 'bg-slate-800 border-emerald-700/50 shadow-lg shadow-emerald-900/20'
            : 'bg-white border-emerald-300 shadow-md shadow-emerald-100'
          : dark
          ? 'bg-slate-800/60 border-slate-700/60'
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      {/* Status bar at top */}
      <div className={`h-1 w-full ${
        isOnline ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : dark ? 'bg-slate-700' : 'bg-gray-200'
      }`} />

      <div className="p-5">
        {/* Station header */}
        <div className="flex items-start gap-3 mb-4">
          {/* Monitor icon */}
          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            isOnline
              ? dark ? 'bg-emerald-900/40 border border-emerald-700/50' : 'bg-emerald-50 border border-emerald-200'
              : dark ? 'bg-slate-700/60 border border-slate-600' : 'bg-gray-100 border border-gray-200'
          }`}>
            <Monitor className={`w-7 h-7 ${isOnline ? 'text-emerald-400' : dark ? 'text-slate-500' : 'text-gray-400'}`} />
            <span className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              dark ? 'border-slate-800' : 'border-white'
            } ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`}>
              {isOnline && (
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              )}
            </span>
          </div>

          {/* Name + station */}
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
              Terminal {String(stationNumber).padStart(2, '0')}
            </p>
            <p className={`text-base font-black leading-tight truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
              {terminal.cajeroNombre}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {isAdmin && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                  ADMIN
                </span>
              )}
              {/* Etiqueta de rol según terminalRoles.ts */}
              {(() => {
                const color = getRoleBadgeColor(terminal.cajeroRol);
                const colorMap: Record<string, string> = {
                  amber: 'bg-amber-500/20 text-amber-400',
                  blue: 'bg-blue-500/20 text-blue-400',
                  violet: 'bg-violet-500/20 text-violet-400',
                  orange: 'bg-orange-500/20 text-orange-400',
                  cyan: 'bg-cyan-500/20 text-cyan-400',
                  green: 'bg-green-500/20 text-green-400',
                  slate: 'bg-slate-500/20 text-slate-400',
                };
                return (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colorMap[color] ?? colorMap.slate}`}>
                    {getRoleLabel(terminal.cajeroRol)}
                  </span>
                );
              })()}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isOnline
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : dark ? 'bg-slate-700 text-slate-500' : 'bg-gray-200 text-gray-400'
              }`}>
                {isOnline ? '● En línea' : '○ Offline'}
              </span>
            </div>
          </div>

          {/* Connection type */}
          <ConnectionTypeBadge wifiSsid={terminal.wifiSsid} dark={dark} transport={terminal.transport} />
        </div>

        {/* Stats row */}
        <div className={`grid grid-cols-3 gap-2 p-3 rounded-2xl mb-4 ${dark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
          <div className="text-center">
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>IP</p>
            <p className={`text-xs font-bold font-mono truncate ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
              {terminal.cajeroIp ? terminal.cajeroIp.split('.').slice(-1)[0]
                ? `.${terminal.cajeroIp.split('.').slice(-1)[0]}`
                : '—' : '—'}
            </p>
            <p className={`text-[10px] ${dark ? 'text-slate-600' : 'text-gray-400'}`}>{terminal.cajeroIp || '—'}</p>
          </div>
          <div className="text-center">
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>Ventas</p>
            <p className={`text-sm font-black ${salesEvents.length > 0 ? 'text-emerald-400' : dark ? 'text-slate-500' : 'text-gray-400'}`}>
              {salesEvents.length}
            </p>
            {totalFromEvents > 0 && (
              <p className={`text-[10px] ${dark ? 'text-emerald-600' : 'text-emerald-500'}`}>
                ${totalFromEvents.toLocaleString('es-CO')}
              </p>
            )}
          </div>
          <div className="text-center">
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
              {isOnline ? 'Activo' : 'Visto'}
            </p>
            <p className={`text-xs font-bold ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
              {elapsedSec !== null ? formatElapsed(elapsedSec) : '—'}
            </p>
          </div>
        </div>

        {/* Último cierre de caja recibido por LAN */}
        {ultimoCierrePayload && (
          <div className={`flex items-center justify-between gap-2 p-2.5 rounded-xl mb-3 border ${
            dark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-amber-400' : 'text-amber-600'}`}>
                Último cierre de caja
              </p>
              <p className={`text-xs font-black truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                ${Number(ultimoCierrePayload.totalVentas || 0).toLocaleString('es-CO')}
              </p>
            </div>
            {typeof ultimoCierrePayload.diferencia === 'number' && (
              <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg ${
                Math.abs(ultimoCierrePayload.diferencia) <= 500
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : ultimoCierrePayload.diferencia < 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400'
              }`}>
                {ultimoCierrePayload.diferencia < 0 ? '−' : '+'}${Math.abs(ultimoCierrePayload.diferencia).toLocaleString('es-CO')}
              </span>
            )}
          </div>
        )}

        {/* Activity feed */}
        {terminal.recentEvents.length > 0 && (
          <div className="space-y-1 mb-3">
            {terminal.recentEvents.slice(0, expanded ? 6 : 2).map((ev, i) => (
              <div key={i} className={`flex items-start gap-1.5 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                <Activity className="w-3 h-3 mt-0.5 text-blue-400 shrink-0" />
                <span className="leading-snug">{ev.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hostname */}
        {terminal.machineHostname && (
          <p className={`text-[10px] mb-3 truncate ${dark ? 'text-slate-600' : 'text-gray-400'}`}>
            🖥 {terminal.machineHostname}
          </p>
        )}

        {/* Footer controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onAudit}
            disabled={!terminal.connected}
            className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
          >
            <Eye className="w-3.5 h-3.5" />
            Auditoría
          </button>
          {terminal.recentEvents.length > 2 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`p-2.5 rounded-xl transition-colors ${dark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Panel de configuración del cajero ─────────────────────────────────────────

function ClientConfigPanel({
  connectionState,
  serverIp,
  localIp,
  onSetIp,
  dark,
  wifiSsid,
}: {
  connectionState: LanConnectionState;
  serverIp: string;
  localIp: string;
  onSetIp: (ip: string) => void;
  dark: boolean;
  wifiSsid: string | null;
}) {
  const [inputIp, setInputIp] = useState(serverIp);
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const bg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const inputCls = dark
    ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:ring-blue-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500';

  const stateBadge: Record<LanConnectionState, { label: string; cls: string }> = {
    idle:         { label: 'Inactivo',    cls: 'bg-slate-600 text-slate-300' },
    discovering:  { label: 'Buscando…',  cls: 'bg-yellow-900/60 text-yellow-300' },
    connecting:   { label: 'Conectando…', cls: 'bg-blue-900/60 text-blue-300' },
    connected:    { label: 'Conectado',  cls: 'bg-emerald-900/60 text-emerald-300' },
    disconnected: { label: 'Desconectado', cls: 'bg-red-900/60 text-red-300' },
  };
  const { label: stateLabel, cls: stateCls } = stateBadge[connectionState] ?? stateBadge.idle;

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${bg}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-400" />
          <h3 className={`text-sm font-bold ${text}`}>Conexión al Servidor Administrador</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${stateCls}`}>{stateLabel}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className={`text-xs font-medium ${muted} mb-1`}>IP de esta terminal</p>
          <p className={`text-sm font-bold font-mono ${text}`}>{localIp || 'Obteniendo...'}</p>
          {wifiSsid !== null && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${muted}`}>
              {wifiSsid ? <><Wifi className="w-3 h-3 text-blue-400" /> WiFi: {wifiSsid}</> : <><Network className="w-3 h-3 text-cyan-400" /> Red cableada (LAN)</>}
            </p>
          )}
        </div>
        <div>
          <p className={`text-xs font-medium ${muted} mb-1`}>IP del Servidor Administrador</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputIp}
              onChange={e => setInputIp(e.target.value)}
              placeholder="192.168.x.x"
              className={`flex-1 px-3 py-1.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${inputCls}`}
            />
            <button
              onClick={() => { if (inputIp.trim()) onSetIp(inputIp.trim()); }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Conectar
            </button>
          </div>
        </div>
      </div>

      {wifiSsid === '' && connectionState !== 'connected' && (
        <div className={`p-2.5 rounded-xl border text-xs ${dark ? 'border-yellow-700/40 bg-yellow-900/20 text-yellow-300' : 'border-yellow-300 bg-yellow-50 text-yellow-700'}`}>
          Sin Wi-Fi activo — asegúrate de estar en la misma red que el Administrador (cable o WiFi).
        </div>
      )}
    </div>
  );
}

// ── Log global de actividad ───────────────────────────────────────────────────

function EventLog({ events, dark }: { events: Array<{ raw: any; label: string }>; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const bg = dark ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-slate-200';

  if (events.length === 0) return null;

  return (
    <div className={`rounded-2xl border ${bg}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className={`text-sm font-bold ${text}`}>Log de Actividad en Red</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
            {events.length} eventos
          </span>
        </div>
        {open ? <ChevronUp className={`w-4 h-4 ${muted}`} /> : <ChevronDown className={`w-4 h-4 ${muted}`} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pt-3" style={{ scrollbarWidth: 'thin' }}>
                {events.slice(0, 80).map((ev, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-xs font-semibold shrink-0 ${muted}`}>
                      [{ev.raw.cajeroNombre?.split(' ')[0] || 'Terminal'}]
                    </span>
                    <span className={`text-xs ${muted}`}>{ev.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tarjeta de la tercera vía: relay por la nube (Supabase Realtime) ─────────
//
// Las dos vías existentes (Wi-Fi y LAN cableada) solo alcanzan terminales de la
// MISMA red. Esta tercera vía conecta terminales de redes distintas —otra sede,
// la cocina con su propio router, el técnico de taller desde su casa, el dueño
// en datos móviles— transportando exactamente los mismos eventos.

function CloudRelayCard({
  dark, available, enabled, state, detail, onlineCount, onToggle,
}: {
  dark: boolean;
  available: boolean;
  enabled: boolean;
  state: 'disabled' | 'unavailable' | 'connecting' | 'connected' | 'error';
  detail: string;
  onlineCount: number;
  onToggle: (valor: boolean) => void;
}) {
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  const conectado = state === 'connected';
  const conectando = state === 'connecting';
  const fallo = state === 'error' || state === 'unavailable';

  const estadoLabel = !enabled
    ? 'Desactivada'
    : conectado ? 'Conectada'
    : conectando ? 'Conectando…'
    : state === 'unavailable' ? 'Sin vincular'
    : state === 'error' ? 'Error de conexión'
    : 'Inactiva';

  return (
    <div className={`rounded-2xl border p-4 ${
      conectado
        ? dark ? 'bg-violet-900/20 border-violet-700/40' : 'bg-violet-50 border-violet-200'
        : fallo && enabled
        ? dark ? 'bg-amber-900/15 border-amber-700/40' : 'bg-amber-50 border-amber-200'
        : dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
    }`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PulsingLed connected={conectado} />
          {conectado
            ? <Cloud className="w-4 h-4 text-violet-400" />
            : <CloudOff className={`w-4 h-4 ${dark ? 'text-slate-400' : 'text-slate-400'}`} />
          }
          <span className={`text-sm font-bold ${text}`}>Conexión por la Nube</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
            conectado
              ? dark ? 'bg-violet-900/60 text-violet-300' : 'bg-violet-100 text-violet-700'
              : dark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'
          }`}>
            3.ª vía
          </span>
        </div>

        <span className={`text-xs ${muted}`}>|</span>
        <span className={`text-sm font-semibold ${
          conectado ? (dark ? 'text-violet-300' : 'text-violet-700') : muted
        }`}>
          {estadoLabel}
        </span>

        {conectado && (
          <>
            <span className={`text-xs ${muted}`}>|</span>
            <span className={`text-sm font-bold ${dark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {onlineCount} terminal{onlineCount === 1 ? '' : 'es'} remota{onlineCount === 1 ? '' : 's'} en línea
            </span>
          </>
        )}

        {/* Interruptor */}
        <button
          onClick={() => onToggle(!enabled)}
          disabled={!available && !enabled}
          title={available ? 'Activar / desactivar el relay por internet' : 'Vincula el negocio a la nube para poder activarlo'}
          className={`ml-auto relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            !available && !enabled
              ? dark ? 'bg-slate-700 opacity-50 cursor-not-allowed' : 'bg-gray-200 opacity-50 cursor-not-allowed'
              : enabled ? 'bg-violet-600' : dark ? 'bg-slate-600' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
            enabled ? 'left-[22px]' : 'left-0.5'
          }`} />
        </button>
      </div>

      <p className={`text-xs mt-2 ${muted}`}>
        {!available
          ? 'Vincula esta instalación a un negocio (Configuración → Vinculación con la Nube) para conectar terminales que NO están en esta red: otra sede, la cocina, el taller o el celular del dueño.'
          : !enabled
          ? 'Apagada: esta terminal solo se comunica con las que estén en su misma red Wi-Fi o cableada.'
          : conectado
          ? 'Las terminales de otras redes reciben ventas, órdenes de taller, comandas y cierres de caja igual que si estuvieran en la red local. La LAN sigue siendo la vía principal cuando ambas están disponibles.'
          : detail || 'Estableciendo el canal seguro con la nube…'}
      </p>

      {fallo && enabled && detail && state === 'error' && (
        <p className={`text-xs mt-1 font-semibold ${dark ? 'text-amber-300' : 'text-amber-700'}`}>
          {detail}
        </p>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MonitoreoTerminalesPage() {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();
  const dark = darkMode;

  const {
    mode, connectionState, localIp, serverIp,
    terminals, allEvents, isAvailable,
    emitLanEvent, requestAudit, setServerIp, clearAudit,
    cloudAvailable, cloudEnabled, cloudState, cloudDetail, cloudOnlineCount, setCloudEnabled,
  } = useLanContext();

  const isAdmin = usuarioActual?.rol === 'super_usuario';
  const [auditTarget, setAuditTarget] = useState<TerminalCard | null>(null);
  const [search, setSearch] = useState('');
  const [wifiSsid, setWifiSsid] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const scanRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [httpStatus, setHttpStatus] = useState<{ running: boolean; port: number; ip: string; url: string } | null>(null);
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [showWifiList, setShowWifiList] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [networkAuthTerminals, setNetworkAuthTerminals] = useState<NetworkAuthTerminal[]>([]);

  useEffect(() => {
    const el = (window as any).electron;
    const fetch = async () => {
      try {
        if (el?.network?.getCurrentSSID) {
          const r = await el.network.getCurrentSSID();
          setWifiSsid(r?.ssid ?? '');
          return;
        }
        if (el?.wifi?.getSsid) {
          const ssid = await el.wifi.getSsid();
          setWifiSsid(ssid ?? '');
        }
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 10_000);
    return () => clearInterval(id);
  }, []);

  // Obtener estado del servidor HTTP REST (tablets/comandas) cada 8s en modo servidor
  useEffect(() => {
    if (!isAdmin) return;
    const fetch = () => lanService.getHttpStatus().then(setHttpStatus).catch(() => {});
    fetch();
    const id = setInterval(fetch, 8000);
    return () => clearInterval(id);
  }, [isAdmin]);

  // Auto-refresh every 10s for the admin
  useEffect(() => {
    if (!isAdmin || !isAvailable) return;
    const id = setInterval(() => {
      lanService.getStatus().catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [isAdmin, isAvailable]);

  // Polling de terminales autenticadas via HTTP (antes de conectar TCP)
  useEffect(() => {
    if (!isAdmin) return;
    const el = (window as any).electron;
    if (!el?.lan?.getActiveTerminals) return;
    const poll = async () => {
      try {
        const active: NetworkAuthTerminal[] = await el.lan.getActiveTerminals();
        setNetworkAuthTerminals(active);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [isAdmin]);

  const handleScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanProgress(0);
    setShowWifiList(false);
    toast.info('Escaneando red local y redes Wi-Fi…', { duration: 3500 });

    // Animate progress
    const steps = [15, 35, 60, 80, 95, 100];
    for (const step of steps) {
      await new Promise(r => setTimeout(r, 380));
      setScanProgress(step);
    }

    // Escaneo simultáneo: terminales TCP + redes Wi-Fi visibles
    const [, wifiResult] = await Promise.allSettled([
      lanService.getStatus(),
      (async () => {
        const el = (window as any).electron;
        // Primero canal rápido (solo SSIDs), luego el completo con señal
        if (el?.network?.scanAvailable) {
          const r = await el.network.scanAvailable();
          if (r.ok && r.networks.length > 0) {
            // Enriquecer con señal usando el canal completo (en segundo plano)
            el.network.scanNetworksFull?.().then((full: any) => {
              if (full?.ok && full.networks?.length > 0) {
                setWifiNetworks(full.networks as WifiNetwork[]);
              }
            }).catch(() => {});
            return r.networks as WifiNetwork[];
          }
        }
        if (el?.wifi?.scanNetworks) {
          const r = await el.wifi.scanNetworks();
          return r.ok ? r.networks as WifiNetwork[] : [];
        }
        return [] as WifiNetwork[];
      })(),
    ]);

    const nets = wifiResult.status === 'fulfilled' ? (wifiResult.value as WifiNetwork[]) : [];
    if (nets.length > 0) {
      setWifiNetworks(nets);
      setShowWifiList(true);
      toast.success('Escaneo completado', {
        description: `${terminals.length} terminal(es) · ${nets.length} red(es) Wi-Fi detectada(s)`,
      });
    } else {
      toast.success('Escaneo completado', {
        description: `${terminals.length} terminal(es) conocida(s)`,
      });
    }

    setScanning(false);
    setScanProgress(0);
  };

  const handleTransfer = useCallback(async ({ modulo, tipo, target, targetIp }: {
    modulo: TransferModulo; tipo: TransferTipo; target: TerminalCard | null; targetIp?: string;
  }) => {
    const datos = await collectTransferData(tipo);
    const payload: Record<string, unknown> = {
      modulo, tipo, datos,
      origenNombre: usuarioActual?.username || 'Terminal',
      timestamp: new Date().toISOString(),
    };

    // Opción 1: transferencia directa por IP via HTTP (POST al endpoint del receptor)
    if (targetIp) {
      try {
        const resp = await fetch(`http://${targetIp}:4002/api/network/receive-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        const json = await resp.json();
        if (json.ok) {
          toast.success('Transferencia directa enviada', { description: `→ ${targetIp}:4002` });
        } else {
          toast.error('Error en transferencia directa', { description: json.error });
        }
      } catch (e: any) {
        toast.error('No se pudo conectar', { description: `${targetIp}:4002 — ${e.message}` });
      }
      setTransferModalOpen(false);
      return;
    }

    // Opción 2: vía canal TCP LAN (terminales conectadas)
    if (target) {
      emitLanEvent('TRANSFERENCIA_RECIBIDA', payload, target.userId);
      toast.success('Transferencia enviada', { description: `→ ${target.cajeroNombre} (${target.cajeroIp})` });
    } else {
      emitLanEvent('TRANSFERENCIA_RECIBIDA', payload);
      toast.success('Transferencia broadcast enviada');
    }
    setTransferModalOpen(false);
  }, [usuarioActual, emitLanEvent]);

  const bg = dark ? 'bg-slate-900' : 'bg-slate-50';
  const text = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  // Terminales autenticadas via HTTP que aún no han completado la conexión TCP
  const pendingNetTerminals = networkAuthTerminals.filter(
    nt => !terminals.some(t => t.cajeroIp === nt.ip || t.terminalId === nt.terminalId)
  );

  const filteredTerminals = terminals.filter(t =>
    !search
    || t.cajeroNombre.toLowerCase().includes(search.toLowerCase())
    || t.cajeroIp.includes(search)
    || t.machineHostname.toLowerCase().includes(search.toLowerCase())
  );
  const connectedCount = terminals.filter(t => t.connected).length;
  const offlineCount = terminals.filter(t => !t.connected).length;
  // Las terminales de la nube no cuentan como Wi-Fi/LAN: están en OTRA red.
  const cloudTerminalsCount = terminals.filter(t => t.transport === 'cloud').length;
  const wifiTerminals = terminals.filter(t => t.transport !== 'cloud' && t.wifiSsid && t.wifiSsid !== '').length;
  const lanTerminals = terminals.filter(t => t.transport !== 'cloud' && t.wifiSsid === '').length;
  const totalSalesToday = allEvents
    .filter(e => e.raw.type === 'VENTA_NUEVA')
    .reduce((sum, e) => sum + Number(e.raw.payload?.total ?? 0), 0);

  const subnet = getSubnet(localIp);

  function handleAudit(terminal: TerminalCard) {
    setAuditTarget(terminal);
    requestAudit(terminal.terminalId);
  }

  const auditTerminal = auditTarget
    ? terminals.find(t => t.terminalId === auditTarget.terminalId) ?? auditTarget
    : null;

  // 🛡️ Antes esto cortaba la pantalla entera sin Electron. Ahora solo corta
  // cuando NINGUNA de las tres vías es utilizable: sin bridge LAN pero con
  // negocio vinculado a la nube, el monitoreo sigue siendo útil (terminales
  // remotas vía relay de Supabase).
  if (!isAvailable && !cloudAvailable) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="text-center max-w-sm">
          <div className={`w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center ${dark ? 'bg-slate-800' : 'bg-white shadow-lg'}`}>
            <WifiOff className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${text}`}>Red LAN no disponible</h2>
          <p className={`text-sm ${muted}`}>
            Esta función requiere que CODEC POS esté ejecutándose como aplicación de escritorio (Electron),
            o que esta instalación esté vinculada a un negocio en la nube para usar la conexión por internet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} p-6`}>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Network className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-black ${text}`}>Monitoreo de Red POS</h1>
              <p className={`text-sm ${muted}`}>
                {isAdmin
                  ? `Servidor · Subred: ${subnet} · Puerto TCP 4000`
                  : `Terminal cajero · ${connectionState === 'connected' ? `Conectado a ${serverIp}` : 'Sin conexión al servidor'}`
                }
              </p>
              {wifiSsid !== null && (
                <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${wifiSsid ? 'text-blue-400' : 'text-cyan-400'}`}>
                  {wifiSsid
                    ? <><Wifi className="w-3 h-3" /> WiFi: {wifiSsid}</>
                    : <><Network className="w-3 h-3" /> Red cableada (LAN Ethernet)</>
                  }
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setTransferModalOpen(true)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg
                  bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-violet-900/30`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                Transferir Archivos
              </button>
              <button
                onClick={handleScan}
                disabled={scanning}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                  scanning
                    ? dark ? 'bg-blue-800 text-blue-300' : 'bg-blue-100 text-blue-600'
                    : dark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? `Escaneando ${scanProgress}%` : 'Escanear Red'}
              </button>
            </div>
          )}
        </div>

        {/* ── SCAN PROGRESS ──────────────────────────────────── */}
        {scanning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-4 ${dark ? 'bg-slate-800 border-blue-700/40' : 'bg-blue-50 border-blue-200'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                <p className={`text-sm font-semibold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Escaneando {subnet}
                </p>
              </div>
              <span className={`text-xs font-bold ${dark ? 'text-blue-400' : 'text-blue-600'}`}>{scanProgress}%</span>
            </div>
            <div className={`h-2 rounded-full ${dark ? 'bg-slate-700' : 'bg-blue-100'}`}>
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                animate={{ width: `${scanProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className={`text-xs mt-2 ${dark ? 'text-slate-400' : 'text-blue-600'}`}>
              Buscando instancias de CODEC POS en la red local…
            </p>
          </motion.div>
        )}

        {/* ── LISTA DE REDES WI-FI ───────────────────────────── */}
        <AnimatePresence>
          {showWifiList && wifiNetworks.length > 0 && (
            <WifiNetworksList
              networks={wifiNetworks}
              dark={dark}
              onClose={() => setShowWifiList(false)}
            />
          )}
        </AnimatePresence>

        {/* ── STATS BAR (Admin) ───────────────────────────────── */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                icon: CheckCircle2,
                label: 'En línea',
                value: connectedCount,
                color: 'emerald',
                bg: dark ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-emerald-50 border-emerald-200',
              },
              {
                icon: Globe,
                label: 'Total conocidas',
                value: terminals.length + pendingNetTerminals.length,
                color: 'blue',
                bg: dark ? 'bg-blue-900/20 border-blue-700/40' : 'bg-blue-50 border-blue-200',
              },
              {
                icon: DollarSign,
                label: 'Ventas registradas',
                value: `$${totalSalesToday.toLocaleString('es-CO')}`,
                color: 'purple',
                bg: dark ? 'bg-purple-900/20 border-purple-700/40' : 'bg-purple-50 border-purple-200',
              },
              {
                icon: Wifi,
                label: 'WiFi / LAN / Nube',
                value: `${wifiTerminals} / ${lanTerminals} / ${cloudTerminalsCount}`,
                color: 'cyan',
                bg: dark ? 'bg-cyan-900/20 border-cyan-700/40' : 'bg-cyan-50 border-cyan-200',
              },
            ].map(({ icon: Icon, label, value, color, bg: cardBg }) => (
              <div key={label} className={`rounded-2xl border p-4 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 text-${color}-${dark ? '400' : '500'}`} />
                  <p className={`text-xs font-semibold ${muted}`}>{label}</p>
                </div>
                <p className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── NETWORK INFO BAR (Admin) ────────────────────────── */}
        {isAdmin && mode === 'server' && (
          <div className={`flex items-center gap-3 flex-wrap px-4 py-3 rounded-2xl border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <PulsingLed connected={true} />
              <Server className="w-4 h-4 text-emerald-500" />
              <span className={`text-sm font-semibold ${text}`}>Servidor activo</span>
            </div>
            <span className={`text-xs ${muted}`}>|</span>
            <span className={`font-mono text-sm font-bold ${dark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {localIp}:4000
            </span>
            <span className={`text-xs ${muted}`}>|</span>
            <span className={`text-sm ${muted}`}>Subred: {subnet}</span>
            <span className={`text-xs ${muted}`}>|</span>
            {wifiSsid
              ? <span className={`flex items-center gap-1 text-xs font-semibold text-blue-400`}><Wifi className="w-3 h-3" /> WiFi activo: {wifiSsid}</span>
              : wifiSsid === ''
              ? <span className={`flex items-center gap-1 text-xs font-semibold text-cyan-400`}><Network className="w-3 h-3" /> LAN Ethernet</span>
              : null
            }
            <p className={`ml-auto text-xs ${muted}`}>
              Comparte la IP con los cajeros para que se conecten automáticamente.
            </p>
          </div>
        )}

        {/* ── HTTP API CARD (Admin) — servidor REST para tablets y comandas ── */}
        {isAdmin && mode === 'server' && httpStatus && (
          <div className={`flex items-center gap-3 flex-wrap px-4 py-3 rounded-2xl border ${
            httpStatus.running
              ? dark ? 'bg-violet-900/20 border-violet-700/40' : 'bg-violet-50 border-violet-200'
              : dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2">
              <PulsingLed connected={httpStatus.running} />
              <Globe className={`w-4 h-4 ${httpStatus.running ? 'text-violet-400' : 'text-slate-400'}`} />
              <span className={`text-sm font-semibold ${text}`}>API REST (tablets/comandas)</span>
            </div>
            <span className={`text-xs ${muted}`}>|</span>
            <span className={`font-mono text-sm font-bold ${httpStatus.running ? (dark ? 'text-violet-300' : 'text-violet-700') : muted}`}>
              {httpStatus.url}
            </span>
            <span className={`text-xs ${muted}`}>|</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              httpStatus.running
                ? dark ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-100 text-violet-700'
                : dark ? 'bg-slate-700 text-slate-500' : 'bg-gray-100 text-gray-500'
            }`}>
              {httpStatus.running ? 'Activo' : 'Inactivo'}
            </span>
            <p className={`ml-auto text-xs ${muted}`}>
              Puerto {httpStatus.port} · Rutas: /health /terminals /comanda /ping
            </p>
          </div>
        )}

        {/* ── TERCERA VÍA: CONEXIÓN POR LA NUBE ───────────────── */}
        <CloudRelayCard
          dark={dark}
          available={cloudAvailable}
          enabled={cloudEnabled}
          state={cloudState}
          detail={cloudDetail}
          onlineCount={cloudOnlineCount}
          onToggle={(valor) => {
            setCloudEnabled(valor);
            toast[valor ? 'success' : 'info'](
              valor ? 'Conexión por la nube activada' : 'Conexión por la nube desactivada',
              {
                description: valor
                  ? 'Esta terminal ahora también se comunica con las que están fuera de esta red.'
                  : 'Solo se comunicará con terminales de su misma red Wi-Fi o cableada.',
              }
            );
          }}
        />

        {/* ── PANEL CAJERO ────────────────────────────────────── */}
        {!isAdmin && isAvailable && (
          <ClientConfigPanel
            connectionState={connectionState}
            serverIp={serverIp}
            localIp={localIp}
            onSetIp={setServerIp}
            dark={dark}
            wifiSsid={wifiSsid}
          />
        )}

        {/* ── BÚSQUEDA (Admin) ────────────────────────────────── */}
        {isAdmin && terminals.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, IP, hostname..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                dark
                  ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500'
                  : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
              }`}
            />
          </div>
        )}

        {/* ── TERMINALES AUTENTICADAS (conectando TCP) ───────── */}
        {isAdmin && pendingNetTerminals.length > 0 && (
          <div className={`rounded-2xl border p-4 space-y-3 ${dark ? 'bg-cyan-900/10 border-cyan-700/30' : 'bg-cyan-50 border-cyan-200'}`}>
            <div className="flex items-center gap-2">
              <div className="relative w-2.5 h-2.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-cyan-500" />
              </div>
              <p className={`text-sm font-bold ${dark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                Terminales autenticadas — conectando canal TCP…
              </p>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${dark ? 'bg-cyan-900/50 text-cyan-300' : 'bg-cyan-100 text-cyan-700'}`}>
                {pendingNetTerminals.length} terminal(es)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {pendingNetTerminals.map((nt) => {
                const rolColor = getRoleBadgeColor(nt.rol);
                const colorMap: Record<string, string> = {
                  amber: 'bg-amber-500/20 text-amber-400', blue: 'bg-blue-500/20 text-blue-400',
                  violet: 'bg-violet-500/20 text-violet-400', orange: 'bg-orange-500/20 text-orange-400',
                  cyan: 'bg-cyan-500/20 text-cyan-400', green: 'bg-green-500/20 text-green-400',
                  slate: 'bg-slate-500/20 text-slate-400',
                };
                return (
                  <div key={nt.terminalId} className={`rounded-2xl border p-4 ${dark ? 'bg-slate-800 border-cyan-700/40' : 'bg-white border-cyan-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-cyan-900/40 border border-cyan-700/50' : 'bg-cyan-50 border border-cyan-200'}`}>
                        <Monitor className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{nt.nombre}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colorMap[rolColor] ?? colorMap.slate}`}>
                            {getRoleLabel(nt.rol)}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400`}>
                            ⟳ Conectando…
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`grid grid-cols-2 gap-2 text-xs p-2 rounded-xl ${dark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
                      <div>
                        <p className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>IP</p>
                        <p className={`font-mono font-bold ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{nt.ip}</p>
                      </div>
                      <div>
                        <p className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Login</p>
                        <p className={`font-semibold ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {new Date(nt.loginAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── GRID DE TERMINALES (estilo cybercafé) ──────────── */}
        {isAdmin && (
          <>
            {filteredTerminals.length === 0 && pendingNetTerminals.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`rounded-3xl border-2 border-dashed p-14 text-center ${dark ? 'border-slate-700' : 'border-slate-200'}`}
              >
                <div className={`w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <Monitor className={`w-10 h-10 ${dark ? 'text-slate-600' : 'text-slate-400'}`} />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${text}`}>Sin terminales en la red</h3>
                <p className={`text-sm ${muted} max-w-sm mx-auto mb-4`}>
                  Cuando un cajero inicie sesión en la misma red —o en otra red, si la conexión por la nube
                  está activa— su terminal POS aparecerá aquí automáticamente.
                </p>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-mono font-semibold ${dark ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-slate-100 text-emerald-700 border border-slate-200'}`}>
                  Servidor: {localIp}:4000
                </div>
              </motion.div>
            ) : (
              <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredTerminals.map((terminal, index) => (
                    <TerminalStation
                      key={terminal.terminalId}
                      terminal={terminal}
                      stationNumber={index + 1}
                      dark={dark}
                      onAudit={() => handleAudit(terminal)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {/* ── ESTADO CAJERO CONECTADO/DESCONECTADO ───────────── */}
        {!isAdmin && isAvailable && (
          <div className={`rounded-3xl border-2 p-10 text-center ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {connectionState === 'connected' ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h3 className={`text-lg font-bold mb-1 ${text}`}>Conectado al Administrador</h3>
                <p className={`text-sm ${muted}`}>
                  Tus ventas y acciones se están transmitiendo en tiempo real a {serverIp}.
                </p>
                <div className={`mt-4 inline-flex items-center gap-2 text-xs ${muted}`}>
                  {wifiSsid
                    ? <><Wifi className="w-3.5 h-3.5 text-blue-400" /> Vía WiFi: {wifiSsid}</>
                    : wifiSsid === ''
                    ? <><Network className="w-3.5 h-3.5 text-cyan-400" /> Vía LAN (cable de red)</>
                    : null
                  }
                </div>
              </>
            ) : (
              <>
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${dark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  {connectionState === 'discovering'
                    ? <Radio className="w-8 h-8 text-blue-400 animate-pulse" />
                    : <WifiOff className="w-8 h-8 text-slate-400" />
                  }
                </div>
                <h3 className={`text-base font-bold ${text}`}>
                  {connectionState === 'discovering' ? 'Buscando servidor en la red…' : 'Sin conexión al administrador'}
                </h3>
                <p className={`text-sm ${muted} mt-1 max-w-xs mx-auto`}>
                  {connectionState === 'discovering'
                    ? `Escaneando subred ${subnet} buscando instancia de CODEC POS...`
                    : 'Ingresa la IP del administrador o espera la reconexión automática.'}
                </p>
                {connectionState === 'discovering' && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
                    <span className={`text-xs ${muted}`}>Reintentando…</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── LOG DE ACTIVIDAD ────────────────────────────────── */}
        {isAdmin && <EventLog events={allEvents} dark={dark} />}

      </div>

      {/* ── Modal de Auditoría ──────────────────────────────── */}
      <AnimatePresence>
        {auditTerminal && (
          <AuditoriaModal
            terminal={auditTerminal}
            onClose={() => { setAuditTarget(null); clearAudit(auditTerminal.terminalId); }}
            onRefresh={() => requestAudit(auditTerminal.terminalId)}
          />
        )}
      </AnimatePresence>

      {/* ── Modal Transferencia POS a POS ───────────────────── */}
      <AnimatePresence>
        {transferModalOpen && (
          <TransferModal
            terminals={terminals}
            localNombre={usuarioActual?.username || 'Admin'}
            dark={dark}
            onClose={() => setTransferModalOpen(false)}
            onSend={handleTransfer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
