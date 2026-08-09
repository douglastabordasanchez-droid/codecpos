/**
 * Facturación Electrónica DIAN — vista móvil, solo lectura.
 *
 * La configuración del certificado/PIN sigue siendo exclusiva de Electron
 * (el asistente vive en Configuración de escritorio) — un celular no es el
 * lugar correcto para manejar la llave privada del negocio. Desde aquí el
 * dueño/admin puede ver el estado del perfil fiscal activo y su historial
 * de facturas, reusando los mismos servicios de src/app/lib/dian y
 * src/app/lib/supabase que ya usa Electron — mismo ecosistema, sin duplicar
 * lógica.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { FileText, ShieldCheck, ShieldAlert, ShieldOff, Send, Mail, Download, Copy, Clock, CheckCircle2, XCircle, FileMinus2, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { listarPerfilesFiscales, listarResolucionesPerfil } from '../../app/lib/supabase/fiscalProfileService';
import { listarFacturasDian } from '../../app/lib/supabase/facturaElectronicaDianService';
import { listarNotasDeFactura } from '../../app/lib/supabase/notaAjusteDianService';
import { ManualDeliveryProvider } from '../../app/lib/dian/deliveryProvider';
import { emitirNotaAjuste } from '../../app/lib/dian/emitirNotaAjuste';
import {
  CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO,
  type FiscalProfile, type FacturaElectronicaDian, type EstadoDocumentoDian,
  type ResolucionDian, type TipoNotaAjuste, type NotaAjusteDian,
} from '../../app/lib/dian/types';

const ESTADO_UI: Record<EstadoDocumentoDian, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  draft: { label: 'Borrador', className: 'bg-slate-500/15 text-slate-400', Icon: FileText },
  pending: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-400', Icon: Clock },
  signing: { label: 'Firmando', className: 'bg-sky-500/15 text-sky-400', Icon: Clock },
  sent: { label: 'Enviada', className: 'bg-sky-500/15 text-sky-400', Icon: Send },
  accepted: { label: 'Aceptada', className: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
  rejected: { label: 'Rechazada', className: 'bg-red-500/15 text-red-400', Icon: XCircle },
  error: { label: 'Error', className: 'bg-red-500/15 text-red-400', Icon: ShieldAlert },
  contingency: { label: 'Contingencia', className: 'bg-orange-500/15 text-orange-400', Icon: ShieldAlert },
  cancelled: { label: 'Anulada', className: 'bg-slate-500/15 text-slate-500', Icon: ShieldOff },
};

const delivery = new ManualDeliveryProvider();

export default function FacturacionPage() {
  const { empleado } = usePwaAuth();
  const puedeVer = empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [perfilActivo, setPerfilActivo] = useState<FiscalProfile | null>(null);
  const [facturas, setFacturas] = useState<FacturaElectronicaDian[]>([]);
  const [cargando, setCargando] = useState(true);
  const [facturaNota, setFacturaNota] = useState<FacturaElectronicaDian | null>(null);
  const [resolucionesPerfil, setResolucionesPerfil] = useState<ResolucionDian[]>([]);
  const [notasFactura, setNotasFactura] = useState<NotaAjusteDian[]>([]);
  const [formNota, setFormNota] = useState({ tipo: 'credito' as TipoNotaAjuste, resolucionId: '', conceptoCodigo: '', motivo: '', total: '' });
  const [emitiendoNota, setEmitiendoNota] = useState(false);

  useEffect(() => {
    if (!empleado || !puedeVer) { setCargando(false); return; }
    (async () => {
      const [perfiles, listaFacturas] = await Promise.all([
        listarPerfilesFiscales(empleado.cliente_id),
        listarFacturasDian({ clienteId: empleado.cliente_id, limite: 30 }),
      ]);
      setPerfilActivo(perfiles.find((p) => p.activo) || null);
      setFacturas(listaFacturas);
      setCargando(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id, puedeVer]);

  async function reenviarWhatsApp(f: FacturaElectronicaDian) {
    const destino = prompt('Número de WhatsApp del cliente (con indicativo):');
    if (!destino) return;
    try {
      await delivery.sendWhatsApp(f, destino);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo reenviar');
    }
  }

  async function reenviarCorreo(f: FacturaElectronicaDian) {
    const destino = prompt('Correo del cliente:');
    if (!destino) return;
    try {
      await delivery.sendEmail(f, destino);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo reenviar');
    }
  }

  function descargarXml(f: FacturaElectronicaDian) {
    if (!f.xml) { toast.error('Esta factura todavía no tiene XML generado'); return; }
    const blob = new Blob([f.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.numeroFactura}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiarCufe(cufe: string) {
    try { await navigator.clipboard.writeText(cufe); toast.success('CUFE copiado'); } catch { /* sin permiso de portapapeles */ }
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
    if (!formNota.resolucionId || !formNota.conceptoCodigo || !formNota.motivo.trim()) {
      toast.error('Completa numeración, concepto y motivo');
      return;
    }
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

  if (!empleado) return null;
  if (!puedeVer) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Facturación Electrónica</h1>
        <p className="text-slate-400 text-sm">Perfil fiscal DIAN e historial de facturas</p>
      </div>

      {cargando ? (
        <p className="text-slate-500 text-sm text-center py-12">Cargando...</p>
      ) : (
        <div className="px-5 space-y-4">
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className={`w-4 h-4 ${perfilActivo ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Perfil fiscal activo</span>
            </div>
            {perfilActivo ? (
              <>
                <p className="text-white font-semibold">{perfilActivo.nombreORazonSocial}</p>
                <p className="text-slate-500 text-xs mt-0.5">NIT {perfilActivo.nit || '—'} · {perfilActivo.estado} · {perfilActivo.ambiente === 'produccion' ? 'Producción' : 'Habilitación'}</p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">
                Sin perfil fiscal activo. Configúralo desde CodecPOS en el computador (Configuración → Facturación electrónica).
              </p>
            )}
          </div>

          <div className="space-y-2">
            {facturas.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">Sin facturas electrónicas todavía</p>
            ) : facturas.map((f) => {
              const info = ESTADO_UI[f.estado];
              const Icon = info.Icon;
              return (
                <div key={f.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white font-mono text-sm font-semibold">{f.numeroFactura}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${info.className}`}>
                      <Icon className="w-3 h-3" /> {info.label}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs">{f.adquirente.nombreORazonSocial} · ${f.total.toLocaleString('es-CO')}</p>
                  {f.cufe && (
                    <button onClick={() => copiarCufe(f.cufe!)} className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-1">
                      CUFE {f.cufe.slice(0, 12)}… <Copy className="w-3 h-3" />
                    </button>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => descargarXml(f)} className="flex-1 h-9 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Download className="w-3.5 h-3.5" /> XML
                    </button>
                    <button onClick={() => reenviarWhatsApp(f)} className="flex-1 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Send className="w-3.5 h-3.5" /> WhatsApp
                    </button>
                    <button onClick={() => reenviarCorreo(f)} className="flex-1 h-9 rounded-lg bg-sky-600/20 text-sky-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Correo
                    </button>
                  </div>
                  {f.estado === 'accepted' && (
                    <button onClick={() => abrirNota(f)} className="w-full h-9 mt-2 rounded-lg bg-orange-600/20 text-orange-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <FileMinus2 className="w-3.5 h-3.5" /> Emitir nota de ajuste
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {facturaNota && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={() => setFacturaNota(null)}>
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-white font-bold text-lg">Nota de ajuste</h2>
                <p className="text-slate-500 text-xs">{facturaNota.numeroFactura} · ${facturaNota.total.toLocaleString('es-CO')}</p>
              </div>
              <button onClick={() => setFacturaNota(null)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            {notasFactura.length > 0 && (
              <div className="px-5 space-y-1.5 mb-3">
                {notasFactura.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300">{n.numeroNota} · {n.tipo === 'credito' ? 'Crédito' : 'Débito'}</span>
                    <span className="text-slate-500">${n.total.toLocaleString('es-CO')} · {n.estado}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 flex gap-2 mb-4">
              {(['credito', 'debito'] as TipoNotaAjuste[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormNota((s) => ({ ...s, tipo: t, conceptoCodigo: '' }))}
                  className={`flex-1 h-11 rounded-lg text-sm font-semibold ${formNota.tipo === t ? 'bg-orange-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}
                >
                  {t === 'credito' ? 'Crédito' : 'Débito'}
                </button>
              ))}
            </div>

            <div className="px-5 space-y-3 mb-4">
              <div className="space-y-1.5">
                <label className="text-slate-400 text-xs">Numeración</label>
                <select value={formNota.resolucionId} onChange={(e) => setFormNota((s) => ({ ...s, resolucionId: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm">
                  <option value="">Selecciona...</option>
                  {resolucionesPerfil.filter((r) => r.estado === 'activa' && r.tipoDocumento === (formNota.tipo === 'credito' ? 'nota_credito' : 'nota_debito')).map((r) => (
                    <option key={r.id} value={r.id}>{r.prefijo} · Res. {r.resolucionNumero}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 text-xs">Concepto</label>
                <select value={formNota.conceptoCodigo} onChange={(e) => setFormNota((s) => ({ ...s, conceptoCodigo: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm">
                  <option value="">Selecciona...</option>
                  {(formNota.tipo === 'credito' ? CONCEPTOS_NOTA_CREDITO : CONCEPTOS_NOTA_DEBITO).map((c) => (
                    <option key={c.codigo} value={c.codigo}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 text-xs">Motivo</label>
                <textarea value={formNota.motivo} onChange={(e) => setFormNota((s) => ({ ...s, motivo: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 text-xs">Valor de la nota</label>
                <input type="number" value={formNota.total} onChange={(e) => setFormNota((s) => ({ ...s, total: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm" />
              </div>
            </div>

            <div className="px-5 pb-8">
              <button onClick={confirmarNota} disabled={emitiendoNota} className="w-full h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-700 text-white font-bold disabled:opacity-50">
                {emitiendoNota ? 'Emitiendo...' : 'Emitir nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
