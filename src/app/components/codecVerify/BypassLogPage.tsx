/**
 * CODEC POS v2.0 — Registro de Bypass de CODEC Verify
 * Vista accesible desde Configuración o CODEC Verify
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileText, AlertTriangle, Clock, User, DollarSign, Search, Download, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import type { BypassLogEntry } from './NequiVerifyModal';

const BYPASS_LOG_KEY = 'codec-verify-bypass-log';

const formatCOP = (v: number) =>
  `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function BypassLogPage() {
  const { darkMode } = usePOS();
  const [logs, setLogs] = useState<BypassLogEntry[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(BYPASS_LOG_KEY) || '[]');
      setLogs(data);
    } catch { setLogs([]); }
  }, []);

  const filtrados = logs.filter(l =>
    l.cajero.toLowerCase().includes(search.toLowerCase()) ||
    l.razon.toLowerCase().includes(search.toLowerCase()) ||
    l.factura?.includes(search)
  );

  const exportar = () => {
    const csv = [
      'ID,Fecha,Hora,Cajero,Factura,Monto,Razón',
      ...logs.map(l => `${l.id},${l.fecha},${l.hora},${l.cajero},${l.factura || ''},${l.monto},"${l.razon}"`)
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `bypass-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Log exportado correctamente');
  };

  const limpiar = () => {
    if (!confirm('¿Limpiar todos los registros de bypass? Esto no puede deshacerse.')) return;
    localStorage.removeItem(BYPASS_LOG_KEY);
    setLogs([]);
    toast.success('Registros eliminados');
  };

  const bg = darkMode ? 'rgba(13,22,45,0.85)' : '#fff';
  const border = darkMode ? 'rgba(255,255,255,0.07)' : '#e5e7eb';
  const textMain = darkMode ? '#fff' : '#0f172a';
  const textSub = darkMode ? '#64748b' : '#94a3b8';

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
            <FileText className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="font-black text-lg" style={{ color: textMain }}>Auditoría de Bypass · CODEC Verify</h2>
            <p className="text-xs" style={{ color: textSub }}>{logs.length} registros totales</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981' }}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
          <button onClick={limpiar} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            <Trash2 className="w-3.5 h-3.5" /> Limpiar
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textSub }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cajero, razón o factura..."
          className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm"
          style={{ background: bg, border: `1px solid ${border}`, color: textMain, outline: 'none' }}
        />
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
            <AlertTriangle className="w-7 h-7 text-yellow-400" />
          </div>
          <p className="font-bold" style={{ color: textMain }}>Sin registros de bypass</p>
          <p className="text-sm" style={{ color: textSub }}>
            {logs.length === 0 ? 'No se han registrado bypasses' : 'Ningún registro coincide con la búsqueda'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl p-4"
              style={{ background: bg, border: `1px solid rgba(234,179,8,0.2)`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm flex items-center gap-2" style={{ color: textMain }}>
                      <User className="w-3.5 h-3.5 text-yellow-400" />
                      {log.cajero}
                      {log.factura && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                        {log.factura}
                      </span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: textSub }}>
                      {log.razon}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-sm" style={{ color: '#f97316' }}>{formatCOP(log.monto)}</p>
                  <p className="text-[10px] flex items-center gap-1 justify-end mt-0.5" style={{ color: textSub }}>
                    <Clock className="w-3 h-3" />
                    {log.hora} · {format(parseISO(log.fecha), "dd MMM yyyy", { locale: es })}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
