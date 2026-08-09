/**
 * CODEC POS v2.0 — Asistente de Configuración DIAN (6 pasos)
 *
 * Crea o continúa UN perfil fiscal (FiscalProfile) hasta dejarlo listo para
 * producción. Nunca edita en el sitio un perfil ya ACTIVE que haya emitido
 * facturas — para pasar de persona natural a SAS se abre este asistente SIN
 * `perfilExistente` (o con uno en borrador) y se crea un perfil nuevo; el
 * perfil viejo queda histórico (ver ConfiguracionDianDirecto.tsx).
 *
 * La firma digital se mantiene "copiar y pegar": el paso 3 es solo un
 * selector de archivo .p12/.pfx + un campo de PIN — nada más que el dueño
 * del negocio deba construir a mano.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Building2, KeyRound, Hash, FlaskConical, Rocket,
  ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertTriangle, Upload, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import type { FiscalProfile, ResolucionDian, TipoPersona, CertificadoDianMeta } from '../../lib/dian/types';
import {
  crearPerfilFiscal, actualizarPerfilFiscal, actualizarEstadoPerfilFiscal, activarPerfilFiscal,
  crearResolucionDian, listarResolucionesPerfil, obtenerUltimoCertificado, guardarMetadataCertificado, marcarPinConfigurado,
  type DatosPerfilFiscalForm,
} from '../../lib/supabase/fiscalProfileService';
import { validateFiscalConfiguration, ETIQUETAS_FALTANTES } from '../../lib/dian/validateFiscalConfiguration';

interface Props {
  clienteId: string;
  perfilExistente: FiscalProfile | null;
  darkMode: boolean;
  onClose: () => void;
  onGuardado: () => void;
}

const PASOS = [
  { id: 1, label: 'Datos del comercio', Icon: Building2 },
  { id: 2, label: 'Configuración DIAN', Icon: ShieldCheck },
  { id: 3, label: 'Certificado digital', Icon: KeyRound },
  { id: 4, label: 'Numeración', Icon: Hash },
  { id: 5, label: 'Pruebas', Icon: FlaskConical },
  { id: 6, label: 'Activar producción', Icon: Rocket },
] as const;

const TIPO_DOCUMENTO_LABEL: Record<ResolucionDian['tipoDocumento'], string> = {
  factura: 'Factura',
  documento_equivalente: 'Doc. equivalente',
  nota_credito: 'Nota crédito',
  nota_debito: 'Nota débito',
};

const RESPONSABILIDADES_COMUNES = [
  'O-13 Gran contribuyente', 'O-15 Autorretenedor', 'O-23 Agente de retención IVA',
  'O-47 Régimen simple de tributación', 'O-49 No responsable de IVA',
];

function inputClass(darkMode: boolean) {
  return `w-full px-3 py-2 rounded-md border ${
    darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-gray-300'
  } focus:outline-none focus:ring-2 focus:ring-orange-500`;
}

export function AsistenteConfiguracionDian({ clienteId, perfilExistente, darkMode, onClose, onGuardado }: Props) {
  const [paso, setPaso] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [perfil, setPerfil] = useState<FiscalProfile | null>(perfilExistente);

  const [form, setForm] = useState<DatosPerfilFiscalForm>({
    tipoPersona: perfilExistente?.tipoPersona || 'natural',
    nombreORazonSocial: perfilExistente?.nombreORazonSocial || '',
    nombreComercial: perfilExistente?.nombreComercial || '',
    nit: perfilExistente?.nit || '',
    digitoVerificacion: perfilExistente?.digitoVerificacion || '',
    direccionFiscal: perfilExistente?.direccionFiscal || '',
    municipioCodigo: perfilExistente?.municipioCodigo || '',
    departamentoCodigo: perfilExistente?.departamentoCodigo || '',
    contactoEmail: perfilExistente?.contactoEmail || '',
    contactoTelefono: perfilExistente?.contactoTelefono || '',
    regimenFiscal: perfilExistente?.regimenFiscal || '',
    responsabilidadesFiscales: perfilExistente?.responsabilidadesFiscales || [],
    identificadorSoftware: perfilExistente?.identificadorSoftware || '',
    claveTecnica: perfilExistente?.claveTecnica || '',
    softwarePin: perfilExistente?.softwarePin || '',
    entregaWhatsappHabilitada: perfilExistente?.entregaWhatsappHabilitada ?? true,
    entregaEmailHabilitada: perfilExistente?.entregaEmailHabilitada ?? false,
    entregaEmailRemitente: perfilExistente?.entregaEmailRemitente || '',
  });
  const [responsabilidadesTexto, setResponsabilidadesTexto] = useState((perfilExistente?.responsabilidadesFiscales || []).join(', '));

  const [resoluciones, setResoluciones] = useState<ResolucionDian[]>([]);
  const [nuevaResolucion, setNuevaResolucion] = useState({ tipoDocumento: 'factura' as ResolucionDian['tipoDocumento'], prefijo: '', resolucionNumero: '', resolucionFecha: '', rangoDesde: '', rangoHasta: '', vigenciaHasta: '' });

  const [certificadoMeta, setCertificadoMeta] = useState<CertificadoDianMeta | null>(null);
  const [certificadoExisteLocal, setCertificadoExisteLocal] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certVencimiento, setCertVencimiento] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfigurado, setPinConfigurado] = useState(perfilExistente?.pinConfigurado ?? false);

  useEffect(() => {
    if (!perfil?.id) return;
    listarResolucionesPerfil(perfil.id).then(setResoluciones);
    obtenerUltimoCertificado(perfil.id).then(setCertificadoMeta);
    window.electron?.dian?.existeCertificado?.(perfil.id).then(setCertificadoExisteLocal).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  function setCampo<K extends keyof DatosPerfilFiscalForm>(campo: K, valor: DatosPerfilFiscalForm[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardarPasoActual(): Promise<boolean> {
    setGuardando(true);
    try {
      if (paso === 1 || paso === 2) {
        const datos: DatosPerfilFiscalForm = paso === 2
          ? { ...form, responsabilidadesFiscales: responsabilidadesTexto.split(',').map((s) => s.trim()).filter(Boolean) }
          : form;
        if (!perfil?.id) {
          const creado = await crearPerfilFiscal(clienteId, datos);
          setPerfil(creado);
          toast.success('Perfil fiscal creado como borrador');
        } else {
          const actualizado = await actualizarPerfilFiscal(perfil.id, datos);
          setPerfil(actualizado);
        }
        if (paso === 1 && perfil) {
          await actualizarEstadoPerfilFiscal(perfil.id!, 'CONFIGURING');
        }
      }
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function irSiguiente() {
    const ok = await guardarPasoActual();
    if (!ok) return;
    setPaso((p) => Math.min(6, p + 1));
  }

  async function subirCertificado() {
    if (!perfil?.id) { toast.error('Guarda primero los datos del comercio (paso 1)'); return; }
    if (!certFile) { toast.error('Selecciona el archivo del certificado (.p12 / .pfx)'); return; }
    if (!certVencimiento) { toast.error('Indica la fecha de vencimiento del certificado'); return; }
    if (!window.electron?.dian) { toast.error('Esta función solo está disponible en la aplicación de escritorio'); return; }

    setGuardando(true);
    try {
      const buffer = await certFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const resultado = await window.electron.dian.guardarCertificado(perfil.id, base64, certFile.name);
      if (!resultado.success) throw new Error(resultado.error || 'No se pudo guardar el certificado');

      const meta: CertificadoDianMeta = {
        perfilFiscalId: perfil.id,
        nombreArchivo: certFile.name,
        huellaSha256: resultado.meta!.huellaSha256,
        fechaVencimiento: certVencimiento,
        estado: 'activo',
      };
      await guardarMetadataCertificado(clienteId, perfil.id, meta);
      setCertificadoMeta(meta);
      setCertificadoExisteLocal(true);
      toast.success('Certificado guardado de forma cifrada en este equipo');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el certificado');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPin() {
    if (!perfil?.id) return;
    if (!pin.trim()) { toast.error('Ingresa el PIN del certificado'); return; }
    if (!window.electron?.dian) { toast.error('Esta función solo está disponible en la aplicación de escritorio'); return; }
    setGuardando(true);
    try {
      const resultado = await window.electron.dian.guardarPin(perfil.id, pin.trim());
      if (!resultado.success) throw new Error(resultado.error || 'No se pudo guardar el PIN');
      await marcarPinConfigurado(perfil.id);
      setPinConfigurado(true);
      setPin('');
      toast.success('PIN guardado de forma cifrada en este equipo');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el PIN');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarResolucion() {
    if (!perfil?.id) return;
    const { tipoDocumento, prefijo, resolucionNumero, resolucionFecha, rangoDesde, rangoHasta, vigenciaHasta } = nuevaResolucion;
    if (!prefijo.trim() || !resolucionNumero.trim() || !rangoDesde || !rangoHasta) {
      toast.error('Completa prefijo, número de resolución y el rango autorizado');
      return;
    }
    setGuardando(true);
    try {
      await crearResolucionDian(clienteId, perfil.id, {
        tipoDocumento,
        prefijo: prefijo.trim(),
        resolucionNumero: resolucionNumero.trim(),
        resolucionFecha: resolucionFecha || undefined,
        rangoDesde: Number(rangoDesde),
        rangoHasta: Number(rangoHasta),
        vigenciaHasta: vigenciaHasta || undefined,
      });
      setResoluciones(await listarResolucionesPerfil(perfil.id));
      setNuevaResolucion({ tipoDocumento: 'factura', prefijo: '', resolucionNumero: '', resolucionFecha: '', rangoDesde: '', rangoHasta: '', vigenciaHasta: '' });
      toast.success('Resolución de numeración registrada');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo registrar la resolución');
    } finally {
      setGuardando(false);
    }
  }

  const resolucionActiva = resoluciones.find((r) => r.estado === 'activa' && r.tipoDocumento === 'factura') || null;
  const validacion = validateFiscalConfiguration({
    perfil,
    resolucionActiva,
    certificado: certificadoMeta,
    pinConfigurado,
  });

  async function pasarAPruebas() {
    if (!perfil?.id) return;
    setGuardando(true);
    try {
      await actualizarEstadoPerfilFiscal(perfil.id, 'TESTING');
      setPerfil({ ...perfil, estado: 'TESTING' });
      toast.success('Perfil marcado en pruebas (ambiente de habilitación)');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo actualizar el estado');
    } finally {
      setGuardando(false);
    }
  }

  async function activarProduccion() {
    if (!perfil?.id || !validacion.ready) return;
    setGuardando(true);
    try {
      await actualizarPerfilFiscal(perfil.id, { ambiente: 'produccion' });
      await actualizarEstadoPerfilFiscal(perfil.id, 'ACTIVE');
      await activarPerfilFiscal(perfil.id);
      toast.success('Facturación electrónica activada en producción');
      onGuardado();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo activar producción');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
      />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700' : 'bg-white border border-gray-200'
          }`}
        >
          <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Configurar facturación DIAN directa</h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Paso {paso} de 6 — {PASOS[paso - 1].label}</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-1 px-6 pt-4">
            {PASOS.map((p) => (
              <div key={p.id} className={`flex-1 h-1.5 rounded-full ${p.id <= paso ? 'bg-orange-500' : darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {paso === 1 && (
              <>
                <div className="flex gap-3">
                  {(['natural', 'juridica'] as TipoPersona[]).map((t) => (
                    <button key={t} onClick={() => setCampo('tipoPersona', t)}
                      className={`flex-1 p-3 rounded-xl border-2 text-sm font-semibold ${form.tipoPersona === t ? 'border-orange-500 bg-orange-500/10 text-orange-500' : darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
                      {t === 'natural' ? 'Persona natural' : 'Persona jurídica (SAS, etc.)'}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Nombre o razón social *</Label>
                  <input className={inputClass(darkMode)} value={form.nombreORazonSocial || ''} onChange={(e) => setCampo('nombreORazonSocial', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Nombre comercial</Label>
                  <input className={inputClass(darkMode)} value={form.nombreComercial || ''} onChange={(e) => setCampo('nombreComercial', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>NIT *</Label>
                    <input className={inputClass(darkMode)} value={form.nit || ''} onChange={(e) => setCampo('nit', e.target.value)} />
                  </div>
                  {form.tipoPersona === 'juridica' && (
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Dígito de verificación *</Label>
                      <input className={inputClass(darkMode)} value={form.digitoVerificacion || ''} onChange={(e) => setCampo('digitoVerificacion', e.target.value)} maxLength={1} />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Dirección fiscal *</Label>
                  <input className={inputClass(darkMode)} value={form.direccionFiscal || ''} onChange={(e) => setCampo('direccionFiscal', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Municipio *</Label>
                    <input className={inputClass(darkMode)} value={form.municipioCodigo || ''} onChange={(e) => setCampo('municipioCodigo', e.target.value)} placeholder="Ej: Bogotá D.C." />
                  </div>
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Departamento *</Label>
                    <input className={inputClass(darkMode)} value={form.departamentoCodigo || ''} onChange={(e) => setCampo('departamentoCodigo', e.target.value)} placeholder="Ej: Cundinamarca" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Correo de contacto</Label>
                    <input className={inputClass(darkMode)} value={form.contactoEmail || ''} onChange={(e) => setCampo('contactoEmail', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-gray-300' : ''}>Teléfono de contacto</Label>
                    <input className={inputClass(darkMode)} value={form.contactoTelefono || ''} onChange={(e) => setCampo('contactoTelefono', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {paso === 2 && (
              <>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Régimen fiscal</Label>
                  <select className={inputClass(darkMode)} value={form.regimenFiscal || ''} onChange={(e) => setCampo('regimenFiscal', e.target.value)}>
                    <option value="">Selecciona...</option>
                    <option value="simplificado">Régimen simplificado</option>
                    <option value="comun">Régimen común</option>
                    <option value="gran_contribuyente">Gran contribuyente</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Responsabilidades fiscales (código RUT, separadas por coma) *</Label>
                  <input className={inputClass(darkMode)} value={responsabilidadesTexto} onChange={(e) => setResponsabilidadesTexto(e.target.value)} placeholder="O-49 No responsable de IVA" />
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Verifica estos códigos contra tu RUT. Comunes: {RESPONSABILIDADES_COMUNES.join(' · ')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Identificador de software (asignado por la DIAN) *</Label>
                  <input className={inputClass(darkMode)} value={form.identificadorSoftware || ''} onChange={(e) => setCampo('identificadorSoftware', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Clave técnica (ClTec, asignada por la DIAN en la habilitación) *</Label>
                  <input className={inputClass(darkMode)} value={form.claveTecnica || ''} onChange={(e) => setCampo('claveTecnica', e.target.value)} />
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    No es el identificador de software — es un dato distinto que entrega la DIAN, necesario para calcular el CUFE. Está en la respuesta del rango de numeración (GetNumberingRange).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>PIN del software (asignado por ti al activar el software en el catálogo DIAN) *</Label>
                  <input type="password" className={inputClass(darkMode)} value={form.softwarePin || ''} onChange={(e) => setCampo('softwarePin', e.target.value)} />
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    No es la clave técnica — es un PIN que tú mismo elegiste al activar el software. Se usa en el CUDE de notas/documento equivalente y en el código de seguridad del software de cada factura.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className={darkMode ? 'text-gray-300' : ''}>Correo remitente para envío de facturas</Label>
                  <input className={inputClass(darkMode)} value={form.entregaEmailRemitente || ''} onChange={(e) => setCampo('entregaEmailRemitente', e.target.value)} />
                </div>
              </>
            )}

            {paso === 3 && (
              <>
                {!perfil?.id ? (
                  <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>Guarda primero el paso 1 (Datos del comercio).</p>
                ) : (
                  <>
                    <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800/60 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {certificadoExisteLocal ? '✓ Certificado cargado en este equipo' : 'Sin certificado cargado'}
                      </p>
                      {certificadoMeta && (
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {certificadoMeta.nombreArchivo} · vence {certificadoMeta.fechaVencimiento}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Archivo del certificado (.p12 / .pfx)</Label>
                      <input type="file" accept=".p12,.pfx" onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                        className={`w-full text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
                    </div>
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Fecha de vencimiento del certificado</Label>
                      <input type="date" className={inputClass(darkMode)} value={certVencimiento} onChange={(e) => setCertVencimiento(e.target.value)} />
                    </div>
                    <Button type="button" onClick={subirCertificado} disabled={guardando} className="bg-gradient-to-b from-orange-500 to-orange-700">
                      <Upload className="w-4 h-4 mr-2" /> Guardar certificado (cifrado localmente)
                    </Button>

                    <div className="pt-4 border-t border-dashed space-y-2" style={{ borderColor: darkMode ? '#334155' : '#e5e7eb' }}>
                      <Label className={darkMode ? 'text-gray-300' : ''}>PIN del certificado {pinConfigurado ? '(ya configurado — deja vacío para no cambiarlo)' : '*'}</Label>
                      <div className="flex gap-2">
                        <input type="password" className={inputClass(darkMode)} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••" />
                        <Button type="button" onClick={guardarPin} disabled={guardando || !pin.trim()} variant="outline">Guardar PIN</Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {paso === 4 && (
              <>
                {!perfil?.id ? (
                  <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>Guarda primero el paso 1 (Datos del comercio).</p>
                ) : (
                  <>
                    {resoluciones.length > 0 && (
                      <div className="space-y-2">
                        {resoluciones.map((r) => (
                          <div key={r.id} className={`p-3 rounded-lg border text-sm flex items-center justify-between ${darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                            <span>
                              <span className="uppercase text-[10px] font-bold opacity-60 mr-1.5">{TIPO_DOCUMENTO_LABEL[r.tipoDocumento]}</span>
                              {r.prefijo} · Res. {r.resolucionNumero} · rango {r.rangoDesde}-{r.rangoHasta} · consecutivo {r.consecutivoActual}
                            </span>
                            <span className={`text-xs font-semibold ${r.estado === 'activa' ? 'text-emerald-500' : 'text-red-400'}`}>{r.estado}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Tipo de documento que numera esta resolución *</Label>
                      <select className={inputClass(darkMode)} value={nuevaResolucion.tipoDocumento} onChange={(e) => setNuevaResolucion((s) => ({ ...s, tipoDocumento: e.target.value as ResolucionDian['tipoDocumento'] }))}>
                        <option value="factura">Factura electrónica</option>
                        <option value="documento_equivalente">Documento equivalente POS</option>
                        <option value="nota_credito">Nota crédito</option>
                        <option value="nota_debito">Nota débito</option>
                      </select>
                      <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        La DIAN autoriza un rango distinto para cada tipo — no reutilices la misma resolución de facturas para notas o documentos equivalentes.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>Prefijo *</Label>
                        <input className={inputClass(darkMode)} value={nuevaResolucion.prefijo} onChange={(e) => setNuevaResolucion((s) => ({ ...s, prefijo: e.target.value }))} placeholder="SETP" />
                      </div>
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>Número de resolución *</Label>
                        <input className={inputClass(darkMode)} value={nuevaResolucion.resolucionNumero} onChange={(e) => setNuevaResolucion((s) => ({ ...s, resolucionNumero: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>Fecha resolución</Label>
                        <input type="date" className={inputClass(darkMode)} value={nuevaResolucion.resolucionFecha} onChange={(e) => setNuevaResolucion((s) => ({ ...s, resolucionFecha: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>Rango desde *</Label>
                        <input type="number" className={inputClass(darkMode)} value={nuevaResolucion.rangoDesde} onChange={(e) => setNuevaResolucion((s) => ({ ...s, rangoDesde: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>Rango hasta *</Label>
                        <input type="number" className={inputClass(darkMode)} value={nuevaResolucion.rangoHasta} onChange={(e) => setNuevaResolucion((s) => ({ ...s, rangoHasta: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className={darkMode ? 'text-gray-300' : ''}>Vigencia hasta</Label>
                      <input type="date" className={inputClass(darkMode)} value={nuevaResolucion.vigenciaHasta} onChange={(e) => setNuevaResolucion((s) => ({ ...s, vigenciaHasta: e.target.value }))} />
                    </div>
                    <Button type="button" onClick={agregarResolucion} disabled={guardando} className="bg-gradient-to-b from-orange-500 to-orange-700">
                      Registrar numeración
                    </Button>
                  </>
                )}
              </>
            )}

            {paso === 5 && (
              <>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Antes de producción, deja el perfil en pruebas (ambiente de habilitación) y verifica manualmente el envío de documentos de prueba a la DIAN.
                </p>
                <ChecklistValidacion validacion={validacion} darkMode={darkMode} />
                <Button type="button" onClick={pasarAPruebas} disabled={guardando || !perfil?.id} className="bg-gradient-to-b from-sky-500 to-sky-700">
                  <FlaskConical className="w-4 h-4 mr-2" /> Marcar como "En pruebas"
                </Button>
              </>
            )}

            {paso === 6 && (
              <>
                <ChecklistValidacion validacion={validacion} darkMode={darkMode} />
                {validacion.ready ? (
                  <Button type="button" onClick={activarProduccion} disabled={guardando} className="bg-gradient-to-b from-emerald-500 to-emerald-700 w-full">
                    {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                    Activar facturación electrónica en producción
                  </Button>
                ) : (
                  <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                    Completa los pasos anteriores antes de activar producción.
                  </p>
                )}
              </>
            )}
          </div>

          <div className={`px-6 py-4 border-t flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <Button type="button" variant="outline" onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={paso === 1}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Atrás
            </Button>
            {paso < 6 ? (
              <Button type="button" onClick={irSiguiente} disabled={guardando} className="bg-gradient-to-b from-orange-500 to-orange-700">
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ChecklistValidacion({ validacion, darkMode }: { validacion: { ready: boolean; missing: string[] }; darkMode: boolean }) {
  return (
    <div className={`p-4 rounded-xl border-2 space-y-2 ${darkMode ? 'bg-slate-800/60 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
      <p className={`text-sm font-semibold flex items-center gap-2 ${validacion.ready ? 'text-emerald-500' : 'text-amber-500'}`}>
        {validacion.ready ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {validacion.ready ? 'Todo listo para producción' : 'Falta completar lo siguiente'}
      </p>
      {!validacion.ready && (
        <ul className="space-y-1">
          {validacion.missing.map((m) => (
            <li key={m} className={`text-xs flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <span className="w-1 h-1 rounded-full bg-current" /> {ETIQUETAS_FALTANTES[m] || m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
