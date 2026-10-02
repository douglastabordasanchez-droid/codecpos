/**
 * Facturas electrónicas de venta emitidas — tabla principal del módulo.
 *
 * Lee facturas_electronicas (lo que emite el POS al cobrar, desde Electron):
 * el XML firmado ya queda guardado allí en el momento de la emisión, así que
 * esta pantalla no necesita que nadie «pase» archivos de un sistema a otro.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, RefreshCw, Eye, Download, Send, Mail, FileMinus2, CheckCircle2, Clock, Copy, X } from 'lucide-react';
import { listarFacturasDian, marcarCorreoEnviado } from '../../lib/supabase/facturaElectronicaDianService';
import { listarResolucionesPerfil } from '../../lib/supabase/fiscalProfileService';
import { listarNotasDeFactura } from '../../lib/supabase/notaAjusteDianService';
import { ManualDeliveryProvider } from '../../lib/dian/deliveryProvider';
import { emitirNotaAjuste } from '../../lib/dian/emitirNotaAjuste';
import {
  CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO,
  type FacturaElectronicaDian, type EstadoDocumentoDian, type ResolucionDian,
  type TipoNotaAjuste, type NotaAjusteDian,
} from '../../lib/dian/types';
import { VistaDocumentoFactura } from './VistaDocumentoFactura';
import { ESTADO_DIAN_UI, descargarTexto, money } from './comunes';

const delivery = new ManualDeliveryProvider();

type FiltroEstado = '' | 'aprobado' | 'pendiente' | 'rechazado';

const GRUPO_ESTADO: Record<Exclude<FiltroEstado, ''>, EstadoDocumentoDian[]> = {
  aprobado: ['accepted'],
  pendiente: ['draft', 'pending', 'signing', 'sent', 'contingency'],
  rechazado: ['rejected', 'error', 'cancelled'],
};

const campo = 'h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

interface Props {
  clienteId: string;
  /** Cambia para forzar una recarga desde afuera (botón «Actualizar» del módulo). */
  recarga?: number;
}

export function FacturasEmitidas({ clienteId, recarga = 0 }: Props) {
  const [facturas, setFacturas] = useState<FacturaElectronicaDian[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', texto: '', estado: '' as FiltroEstado });

  const [facturaVista, setFacturaVista] = useState<FacturaElectronicaDian | null>(null);
  const [facturaEnvio, setFacturaEnvio] = useState<FacturaElectronicaDian | null>(null);
  const [destino, setDestino] = useState('');

  const [facturaNota, setFacturaNota] = useState<FacturaElectronicaDian | null>(null);
  const [resolucionesPerfil, setResolucionesPerfil] = useState<ResolucionDian[]>([]);
  const [notasFactura, setNotasFactura] = useState<NotaAjusteDian[]>([]);
  const [formNota, setFormNota] = useState({ tipo: 'credito' as TipoNotaAjuste, resolucionId: '', conceptoCodigo: '', motivo: '', total: '' });
  const [emitiendoNota, setEmitiendoNota] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setFacturas(await listarFacturasDian({
        clienteId,
        // Días completos en hora LOCAL: 'YYYY-MM-DD' a secas se compararía
        // como medianoche UTC y correría el corte cinco horas en Colombia.
        desde: filtros.desde ? new Date(`${filtros.desde}T00:00:00`).toISOString() : undefined,
        hasta: filtros.hasta ? new Date(`${filtros.hasta}T23:59:59.999`).toISOString() : undefined,
        limite: 300,
      }));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, recarga, filtros.desde, filtros.hasta]);

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    return facturas.filter((f) => {
      if (filtros.estado && !GRUPO_ESTADO[filtros.estado].includes(f.estado)) return false;
      if (!texto) return true;
      return (
        f.numeroFactura.toLowerCase().includes(texto) ||
        f.adquirente.nombreORazonSocial.toLowerCase().includes(texto) ||
        f.adquirente.numeroDocumento.includes(texto)
      );
    });
  }, [facturas, filtros.texto, filtros.estado]);

  const totalVisible = visibles.reduce((a, f) => a + f.total, 0);

  async function copiarCufe(cufe: string) {
    try { await navigator.clipboard.writeText(cufe); toast.success('CUFE copiado'); } catch { toast.error('No se pudo copiar el CUFE'); }
  }

  function abrirEnvio(f: FacturaElectronicaDian) {
    setFacturaEnvio(f);
    setDestino(f.correoDestino || f.adquirente.email || '');
  }

  async function enviar(canal: 'whatsapp' | 'email') {
    if (!facturaEnvio || !destino.trim()) return;
    try {
      if (canal === 'whatsapp') {
        await delivery.sendWhatsApp(facturaEnvio, destino.trim());
      } else {
        await delivery.sendEmail(facturaEnvio, destino.trim());
        // El envío es manual (abre el correo del equipo): se deja constancia
        // de que se despachó, no hay acuse de entrega que consultar.
        await marcarCorreoEnviado(facturaEnvio.id!, destino.trim());
        setFacturas((lista) => lista.map((f) => (f.id === facturaEnvio.id
          ? { ...f, correoEnviadoAt: new Date().toISOString(), correoDestino: destino.trim() } : f)));
      }
      setFacturaEnvio(null);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo enviar');
    }
  }

  async function abrirNota(f: FacturaElectronicaDian) {
    setFacturaNota(f);
    setFormNota({ tipo: 'credito', resolucionId: '', conceptoCodigo: '', motivo: '', total: String(f.total) });
    const [resoluciones, notas] = await Promise.all([
      listarResolucionesPerfil(f.perfilFiscalId),
      listarNotasDeFactura(f.id!),
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
      // la nota SÍ queda registrada con su número reservado, en 'error'.
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

  const resolucionesNota = resolucionesPerfil.filter(
    (r) => r.estado === 'activa' && r.tipoDocumento === (formNota.tipo === 'credito' ? 'nota_credito' : 'nota_debito'),
  );

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Desde</span>
          <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className={campo} />
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Hasta</span>
          <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className={campo} />
        </label>
        <label className="space-y-1 flex-1 min-w-[180px]">
          <span className="block text-slate-400 text-xs">Comprobante, cliente o NIT</span>
          <span className="relative block">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} placeholder="Buscar..." className={`${campo} w-full pl-9`} />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Estado DIAN</span>
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as FiltroEstado }))} className={campo}>
            <option value="">Todos</option>
            <option value="aprobado">Aprobado</option>
            <option value="pendiente">Pendiente</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </label>
        <button onClick={cargar} className="h-10 px-3 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-2" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-3 font-bold">Fecha</th>
                <th className="text-left px-3 py-3 font-bold">Comprobante</th>
                <th className="text-left px-3 py-3 font-bold">Cliente</th>
                <th className="text-right px-3 py-3 font-bold">Total</th>
                <th className="text-left px-3 py-3 font-bold">Estado DIAN</th>
                <th className="text-left px-3 py-3 font-bold">Estado correo</th>
                <th className="text-right px-3 py-3 font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">Cargando...</td></tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    {facturas.length === 0
                      ? 'Todavía no hay facturas electrónicas. Se crean al cobrar una venta con facturación electrónica activa.'
                      : 'Ninguna factura coincide con los filtros.'}
                  </td>
                </tr>
              ) : visibles.map((f) => {
                const info = ESTADO_DIAN_UI[f.estado];
                return (
                  <tr key={f.id} className="text-slate-300 border-t border-slate-800">
                    <td className="px-3 py-3 whitespace-nowrap text-slate-400">
                      {new Date(f.fechaEmision).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono font-semibold text-white">{f.numeroFactura}</p>
                      {f.cufe && (
                        <button onClick={() => copiarCufe(f.cufe!)} className="flex items-center gap-1 text-[10px] text-slate-500 font-mono" title="Copiar CUFE">
                          {f.cufe.slice(0, 10)}… <Copy className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-white truncate max-w-[180px]">{f.adquirente.nombreORazonSocial}</p>
                      <p className="text-xs text-slate-500 font-mono">{f.adquirente.numeroDocumento}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white whitespace-nowrap">{money(f.total)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${info.className}`}
                        title={f.motivoRechazo || undefined}
                      >
                        <info.Icon className="w-3 h-3" /> {info.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {f.correoEnviadoAt ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400" title={f.correoDestino}>
                          <CheckCircle2 className="w-3 h-3" /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400">
                          <Clock className="w-3 h-3" /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setFacturaVista(f)} className="h-8 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5" /> Ver documento
                        </button>
                        <button
                          title="Descargar XML"
                          onClick={() => f.xml ? descargarTexto(f.xml, `${f.numeroFactura}.xml`, 'application/xml') : toast.error('Esta factura todavía no tiene XML generado')}
                          className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button title="Enviar al cliente" onClick={() => abrirEnvio(f)} className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title={f.estado === 'accepted' ? 'Emitir nota de ajuste (crédito / débito)' : 'Solo se pueden emitir notas sobre facturas aprobadas por la DIAN'}
                          onClick={() => abrirNota(f)}
                          disabled={f.estado !== 'accepted'}
                          className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <FileMinus2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!cargando && visibles.length > 0 && (
          <div className="px-3 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{visibles.length} {visibles.length === 1 ? 'factura' : 'facturas'}</span>
            <span>Total: <span className="font-mono font-bold text-white">{money(totalVisible)}</span></span>
          </div>
        )}
      </div>

      {facturaVista && <VistaDocumentoFactura factura={facturaVista} onCerrar={() => setFacturaVista(null)} />}

      {facturaEnvio && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setFacturaEnvio(null)}>
          <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">Enviar {facturaEnvio.numeroFactura}</p>
              <button onClick={() => setFacturaEnvio(null)} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Se abre tu correo o WhatsApp con el resumen y el {facturaEnvio.tipoDocumento === 'documento_equivalente' ? 'CUDE' : 'CUFE'} listos.
              Adjunta el XML o el PDF de «Ver documento». Al enviar por correo, la factura queda marcada como enviada.
            </p>
            <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Correo o número de WhatsApp" className={`${campo} w-full`} />
            <div className="flex gap-2">
              <button onClick={() => enviar('email')} disabled={!destino.includes('@')} className="flex-1 h-10 rounded-lg bg-sky-600/20 text-sky-400 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                <Mail className="w-4 h-4" /> Correo
              </button>
              <button onClick={() => enviar('whatsapp')} disabled={!/\d{7,}/.test(destino.replace(/\D/g, '')) || destino.includes('@')} className="flex-1 h-10 rounded-lg bg-emerald-600/20 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                <Send className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {facturaNota && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setFacturaNota(null)}>
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-white">Nota de ajuste — {facturaNota.numeroFactura}</p>
                <p className="text-xs text-slate-400">Total original: {money(facturaNota.total)}</p>
              </div>
              <button onClick={() => setFacturaNota(null)} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>

            {notasFactura.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Notas ya emitidas</p>
                {notasFactura.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300">{n.numeroNota} · {n.tipo === 'credito' ? 'Crédito' : 'Débito'}</span>
                    <span className="text-slate-500">{money(n.total)} · {ESTADO_DIAN_UI[n.estado]?.label || n.estado}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {(['credito', 'debito'] as TipoNotaAjuste[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormNota((s) => ({ ...s, tipo: t, resolucionId: '', conceptoCodigo: '' }))}
                  className={`flex-1 h-10 rounded-lg text-sm font-bold ${formNota.tipo === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}
                >
                  {t === 'credito' ? 'Nota crédito' : 'Nota débito'}
                </button>
              ))}
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Numeración de la nota</span>
              <select value={formNota.resolucionId} onChange={(e) => setFormNota((s) => ({ ...s, resolucionId: e.target.value }))} className={`${campo} w-full`}>
                <option value="">Selecciona...</option>
                {resolucionesNota.map((r) => <option key={r.id} value={r.id}>{r.prefijo} · Res. {r.resolucionNumero}</option>)}
              </select>
              {resolucionesNota.length === 0 && (
                <span className="block text-xs text-amber-400">
                  Este perfil no tiene una numeración activa para notas. Regístrala en CODEC POS de escritorio: Configuración → Facturación electrónica → paso Numeración.
                </span>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Concepto</span>
              <select value={formNota.conceptoCodigo} onChange={(e) => setFormNota((s) => ({ ...s, conceptoCodigo: e.target.value }))} className={`${campo} w-full`}>
                <option value="">Selecciona...</option>
                {(formNota.tipo === 'credito' ? CONCEPTOS_NOTA_CREDITO : CONCEPTOS_NOTA_DEBITO).map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.label}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Motivo</span>
              <textarea value={formNota.motivo} onChange={(e) => setFormNota((s) => ({ ...s, motivo: e.target.value }))} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm resize-none" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Valor de la nota</span>
              <input type="number" value={formNota.total} onChange={(e) => setFormNota((s) => ({ ...s, total: e.target.value }))} className={`${campo} w-full`} />
              <span className="block text-xs text-slate-500">Por defecto ajusta la factura completa.</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setFacturaNota(null)} className="flex-1 h-11 rounded-lg border border-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={confirmarNota} disabled={emitiendoNota} className="flex-1 h-11 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold disabled:opacity-50">
                {emitiendoNota ? 'Emitiendo...' : 'Emitir nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
