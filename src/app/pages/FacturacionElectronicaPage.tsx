/**
 * CODEC POS v2.0 — Historial de Facturación Electrónica DIAN
 *
 * Lista las facturas emitidas por el perfil fiscal activo (o cualquiera del
 * negocio, filtrable). Ver/descargar XML, reenviar (WhatsApp/correo) y
 * consultar estado. La representación gráfica (PDF con el formato exacto
 * exigido por el Anexo Técnico, con QR de consulta DIAN) todavía no está
 * implementada — pendiente de confirmar esa plantilla contra el Anexo
 * Técnico oficial; por ahora el reenvío comparte el XML y los datos clave
 * (CUFE, total, número) directamente.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Search, RefreshCw, Download, Send, Mail, Copy, ShieldCheck,
  ShieldAlert, ShieldOff, Clock, XCircle, CheckCircle2, Sparkles, FileMinus2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { listarFacturasDian, type FiltrosHistorialFacturas } from '../lib/supabase/facturaElectronicaDianService';
import { listarPerfilesFiscales, listarResolucionesPerfil } from '../lib/supabase/fiscalProfileService';
import { listarNotasDeFactura } from '../lib/supabase/notaAjusteDianService';
import { ManualDeliveryProvider } from '../lib/dian/deliveryProvider';
import { emitirNotaAjuste } from '../lib/dian/emitirNotaAjuste';
import {
  CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO,
  type FacturaElectronicaDian, type EstadoDocumentoDian, type FiscalProfile,
  type ResolucionDian, type TipoNotaAjuste, type NotaAjusteDian,
} from '../lib/dian/types';

const ESTADO_UI: Record<EstadoDocumentoDian, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  draft: { label: 'Borrador', className: 'bg-slate-500/20 text-slate-300', Icon: FileText },
  pending: { label: 'Pendiente', className: 'bg-amber-500/20 text-amber-300', Icon: Clock },
  signing: { label: 'Firmando', className: 'bg-sky-500/20 text-sky-300', Icon: Clock },
  sent: { label: 'Enviada a la DIAN', className: 'bg-sky-500/20 text-sky-300', Icon: Send },
  accepted: { label: 'Aceptada', className: 'bg-emerald-500/20 text-emerald-300', Icon: CheckCircle2 },
  rejected: { label: 'Rechazada', className: 'bg-red-500/20 text-red-300', Icon: XCircle },
  error: { label: 'Error', className: 'bg-red-500/20 text-red-300', Icon: ShieldAlert },
  contingency: { label: 'Contingencia', className: 'bg-orange-500/20 text-orange-300', Icon: ShieldAlert },
  cancelled: { label: 'Anulada', className: 'bg-slate-500/20 text-slate-400', Icon: ShieldOff },
};

const delivery = new ManualDeliveryProvider();

export default function FacturacionElectronicaPage() {
  const clienteId = getLinkedClienteId();
  const [perfiles, setPerfiles] = useState<FiscalProfile[]>([]);
  const [facturas, setFacturas] = useState<FacturaElectronicaDian[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState<{ desde: string; hasta: string; numero: string; estado: EstadoDocumentoDian | '' }>({
    desde: '', hasta: '', numero: '', estado: '',
  });
  const [facturaXml, setFacturaXml] = useState<FacturaElectronicaDian | null>(null);
  const [facturaReenvio, setFacturaReenvio] = useState<FacturaElectronicaDian | null>(null);
  const [destino, setDestino] = useState('');
  const [facturaNota, setFacturaNota] = useState<FacturaElectronicaDian | null>(null);
  const [resolucionesPerfil, setResolucionesPerfil] = useState<ResolucionDian[]>([]);
  const [notasFactura, setNotasFactura] = useState<NotaAjusteDian[]>([]);
  const [formNota, setFormNota] = useState({ tipo: 'credito' as TipoNotaAjuste, resolucionId: '', conceptoCodigo: '', motivo: '', total: '' });
  const [emitiendoNota, setEmitiendoNota] = useState(false);

  async function cargar() {
    if (!clienteId) { setCargando(false); return; }
    setCargando(true);
    try {
      const [listaPerfiles, listaFacturas] = await Promise.all([
        listarPerfilesFiscales(clienteId),
        listarFacturasDian(construirFiltros()),
      ]);
      setPerfiles(listaPerfiles);
      setFacturas(listaFacturas);
    } finally {
      setCargando(false);
    }
  }

  function construirFiltros(): FiltrosHistorialFacturas {
    return {
      clienteId: clienteId!,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      numeroFactura: filtros.numero || undefined,
      estado: filtros.estado || undefined,
    };
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const perfilPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles]);

  function descargarXml(factura: FacturaElectronicaDian) {
    if (!factura.xml) { toast.error('Esta factura todavía no tiene XML generado'); return; }
    const blob = new Blob([factura.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${factura.numeroFactura}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiarCufe(cufe: string) {
    try {
      await navigator.clipboard.writeText(cufe);
      toast.success('CUFE copiado');
    } catch {
      toast.error('No se pudo copiar el CUFE');
    }
  }

  async function abrirNota(factura: FacturaElectronicaDian) {
    setFacturaNota(factura);
    setFormNota({ tipo: 'credito', resolucionId: '', conceptoCodigo: '', motivo: '', total: String(factura.total) });
    const [resoluciones, notas] = await Promise.all([
      listarResolucionesPerfil(factura.perfilFiscalId),
      listarNotasDeFactura(factura.id!),
    ]);
    setResolucionesPerfil(resoluciones);
    setNotasFactura(notas);
  }

  async function confirmarNota() {
    if (!facturaNota?.id) return;
    if (!formNota.resolucionId) { toast.error('Selecciona la numeración de la nota'); return; }
    if (!formNota.conceptoCodigo) { toast.error('Selecciona el concepto'); return; }
    if (!formNota.motivo.trim()) { toast.error('Escribe el motivo'); return; }
    const total = parseFloat(formNota.total);
    if (!Number.isFinite(total) || total <= 0) { toast.error('Total inválido'); return; }

    setEmitiendoNota(true);
    try {
      const nota = await emitirNotaAjuste({
        clienteId: facturaNota.clienteId,
        perfilFiscalId: facturaNota.perfilFiscalId,
        facturaId: facturaNota.id,
        resolucionId: formNota.resolucionId,
        tipo: formNota.tipo,
        conceptoCodigo: formNota.conceptoCodigo,
        motivo: formNota.motivo.trim(),
        total,
      });
      toast.success(`Nota ${nota.numeroNota} registrada`);
      setNotasFactura(await listarNotasDeFactura(facturaNota.id));
    } catch (e: any) {
      // Si falta configuración del perfil (PIN/identificador de software),
      // la nota SÍ queda registrada con su número reservado, en 'error' —
      // se lo decimos tal cual en vez de un error genérico de "no se pudo".
      if (String(e?.message || '').includes('PIN del software')) {
        toast.warning('Nota registrada con número reservado, pero pendiente: completa el PIN del software y el identificador de software en el perfil fiscal.');
        setNotasFactura(await listarNotasDeFactura(facturaNota.id));
      } else {
        toast.error(e?.message || 'No se pudo emitir la nota');
      }
    } finally {
      setEmitiendoNota(false);
    }
  }

  async function reenviar(canal: 'whatsapp' | 'email') {
    if (!facturaReenvio || !destino.trim()) return;
    try {
      if (canal === 'whatsapp') await delivery.sendWhatsApp(facturaReenvio, destino.trim());
      else await delivery.sendEmail(facturaReenvio, destino.trim());
      toast.success('Reenvío iniciado');
      setFacturaReenvio(null);
      setDestino('');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo reenviar');
    }
  }

  if (!clienteId) {
    return (
      <div className="h-screen overflow-y-auto p-6">
        <div className="p-6 rounded-2xl bg-amber-900/30 border-2 border-amber-600 text-amber-200">
          Esta instalación todavía no está vinculada a la nube — el historial de facturación DIAN necesita que primero
          vincules el negocio (Configuración → Vinculación con la nube).
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto p-6 space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                Facturación Electrónica DIAN
                <Sparkles className="w-6 h-6 text-yellow-200" />
              </h1>
              <p className="text-white/80 mt-1">Historial de documentos emitidos con habilitación propia</p>
            </div>
          </div>
          <button onClick={cargar} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 backdrop-blur-sm border border-white/20">
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-800/60 border border-slate-700 p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm" />
        </div>
        <div className="space-y-1 flex-1 min-w-[160px]">
          <label className="text-xs text-slate-400">Número de factura</label>
          <input value={filtros.numero} onChange={(e) => setFiltros((f) => ({ ...f, numero: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm" placeholder="SETP..." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as EstadoDocumentoDian | '' }))}
            className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm">
            <option value="">Todos</option>
            {Object.entries(ESTADO_UI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <button onClick={cargar} className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Buscar
        </button>
      </div>

      <div className="rounded-2xl bg-slate-800/60 border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                <th className="text-left px-4 py-3">Número</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Perfil fiscal</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">CUFE</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {cargando ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">Sin facturas electrónicas todavía</td></tr>
              ) : facturas.map((f) => {
                const info = ESTADO_UI[f.estado];
                const Icon = info.Icon;
                return (
                  <tr key={f.id} className="text-slate-200">
                    <td className="px-4 py-3 font-mono">{f.numeroFactura}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(f.fechaEmision).toLocaleString('es-CO')}</td>
                    <td className="px-4 py-3">{f.adquirente.nombreORazonSocial}</td>
                    <td className="px-4 py-3 text-slate-400">{perfilPorId.get(f.perfilFiscalId)?.nombreORazonSocial || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">${f.total.toLocaleString('es-CO')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${info.className}`}>
                        <Icon className="w-3 h-3" /> {info.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.cufe ? (
                        <button onClick={() => copiarCufe(f.cufe!)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-mono">
                          {f.cufe.slice(0, 10)}… <Copy className="w-3 h-3" />
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button title="Ver XML" onClick={() => setFacturaXml(f)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300"><FileText className="w-4 h-4" /></button>
                        <button title="Descargar XML" onClick={() => descargarXml(f)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300"><Download className="w-4 h-4" /></button>
                        <button title="Reenviar" onClick={() => setFacturaReenvio(f)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300"><Send className="w-4 h-4" /></button>
                        <button
                          title={f.estado === 'accepted' ? 'Emitir nota de ajuste' : 'Solo se pueden emitir notas sobre facturas aceptadas por la DIAN'}
                          onClick={() => f.estado === 'accepted' && abrirNota(f)}
                          disabled={f.estado !== 'accepted'}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <FileMinus2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {facturaXml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setFacturaXml(null)}>
          <div className="w-full max-w-3xl max-h-[80vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
              <p className="font-bold text-white">{facturaXml.numeroFactura} — XML UBL 2.1</p>
              <button onClick={() => setFacturaXml(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap">{facturaXml.xml || 'Sin XML generado todavía.'}</pre>
          </div>
        </div>
      )}

      {facturaReenvio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setFacturaReenvio(null)}>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-white">Reenviar {facturaReenvio.numeroFactura}</p>
            <p className="text-xs text-slate-400">
              Se reutiliza esta misma factura ya emitida — no se genera una nueva. La representación gráfica en PDF todavía no está disponible; se comparte el resumen y el XML.
            </p>
            <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Número WhatsApp o correo"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
            <div className="flex gap-2">
              <button onClick={() => reenviar('whatsapp')} className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
                <Send className="w-4 h-4" /> WhatsApp
              </button>
              <button onClick={() => reenviar('email')} className="flex-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" /> Correo
              </button>
            </div>
          </div>
        </div>
      )}
      {facturaNota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setFacturaNota(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="font-bold text-white">Nota de ajuste — {facturaNota.numeroFactura}</p>
              <p className="text-xs text-slate-400">Total original: ${facturaNota.total.toLocaleString('es-CO')}</p>
            </div>

            {notasFactura.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Notas ya emitidas</p>
                {notasFactura.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-xs bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="text-slate-300">{n.numeroNota} · {n.tipo === 'credito' ? 'Crédito' : 'Débito'}</span>
                    <span className="text-slate-400">${n.total.toLocaleString('es-CO')} · {n.estado}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {(['credito', 'debito'] as TipoNotaAjuste[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormNota((s) => ({ ...s, tipo: t, conceptoCodigo: '' }))}
                  className={`flex-1 h-10 rounded-lg text-sm font-semibold ${formNota.tipo === t ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                >
                  {t === 'credito' ? 'Nota crédito' : 'Nota débito'}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Numeración de la nota</label>
              <select value={formNota.resolucionId} onChange={(e) => setFormNota((s) => ({ ...s, resolucionId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm">
                <option value="">Selecciona...</option>
                {resolucionesPerfil.filter((r) => r.estado === 'activa' && r.tipoDocumento === (formNota.tipo === 'credito' ? 'nota_credito' : 'nota_debito')).map((r) => (
                  <option key={r.id} value={r.id}>{r.prefijo} · Res. {r.resolucionNumero}</option>
                ))}
              </select>
              {resolucionesPerfil.filter((r) => r.estado === 'activa' && r.tipoDocumento === (formNota.tipo === 'credito' ? 'nota_credito' : 'nota_debito')).length === 0 && (
                <p className="text-xs text-amber-400">Este perfil no tiene una numeración activa para notas — regístrala primero (Configuración → Facturación electrónica → asistente → paso Numeración).</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Concepto</label>
              <select value={formNota.conceptoCodigo} onChange={(e) => setFormNota((s) => ({ ...s, conceptoCodigo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm">
                <option value="">Selecciona...</option>
                {(formNota.tipo === 'credito' ? CONCEPTOS_NOTA_CREDITO : CONCEPTOS_NOTA_DEBITO).map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Motivo</label>
              <textarea value={formNota.motivo} onChange={(e) => setFormNota((s) => ({ ...s, motivo: e.target.value }))} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Valor de la nota</label>
              <input type="number" value={formNota.total} onChange={(e) => setFormNota((s) => ({ ...s, total: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
              <p className="text-xs text-slate-500">Por defecto ajusta la factura completa. Para un ajuste parcial de ítems específicos, usa el historial detallado (próximamente).</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setFacturaNota(null)} className="flex-1 h-11 rounded-lg border border-slate-700 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={confirmarNota} disabled={emitiendoNota} className="flex-1 h-11 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold disabled:opacity-50">
                {emitiendoNota ? 'Emitiendo...' : 'Emitir nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
