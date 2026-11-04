/**
 * Mi contador › Certificado digital. El contador trabaja en Codec Document
 * (contabilidad, acuses de compras, nómina) y el negocio sigue facturando en
 * Codec POS, los dos con el mismo certificado:
 *   · Firma por encargo: Codec POS firma lo que el contador manda, sin que el
 *     certificado salga de aquí. Siempre activa si hay certificado.
 *   · Copia compartida: el dueño puede además darle una copia cifrada para
 *     que Codec Document firme por su cuenta. Se puede retirar cuando quiera.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, ShieldCheck, ShieldOff, AlertTriangle, CheckCircle2, Clock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  compartirCertificadoContador, dejarDeCompartirCertificado, guardarDatosNomina, obtenerCertificadoContador, obtenerDatosNomina,
  type CertificadoContador as Estado, type DatosNomina,
} from '../../lib/supabase/contadorService';

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function CertificadoContador({ oscuro = true, contador }: { oscuro?: boolean; contador: string | null }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const suave = oscuro ? 'text-slate-400' : 'text-gray-500';
  const caja = oscuro ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-200';

  const cargar = useCallback(async () => {
    try { setEstado(await obtenerCertificadoContador()); } catch { /* la pantalla principal ya muestra los errores de conexión */ }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(cargar, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  if (!estado) return null;
  const nombre = contador || 'tu contador';

  const compartir = async () => {
    if (!window.confirm(
      `¿Compartir tu certificado digital con ${nombre}?\n\n` +
      'Codec Document guardará una copia cifrada para firmar por su cuenta los acuses de tus compras y tu nómina electrónica. ' +
      'Tú sigues facturando igual. Puedes retirarla cuando quieras, y se borra sola si desconectas al contador.',
    )) return;
    setTrabajando(true);
    try {
      const r = await compartirCertificadoContador();
      toast.success('Certificado compartido', { description: `${nombre} ya puede firmar con él. Vence el ${fecha(r.vence)}.` });
    } catch (e) {
      toast.error('No se pudo compartir el certificado', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTrabajando(false);
      cargar();
    }
  };

  const retirar = async () => {
    if (!window.confirm(`¿Retirar la copia del certificado que tiene ${nombre}? Codec POS seguirá firmando por encargo lo que él te mande.`)) return;
    setTrabajando(true);
    try {
      await dejarDeCompartirCertificado();
      toast.success('Copia del certificado retirada');
    } catch (e) {
      toast.error('No se pudo retirar', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTrabajando(false);
      cargar();
    }
  };

  const Linea = ({ ok, titulo, motivo }: { ok: boolean; titulo: string; motivo: string | null }) => (
    <p className={`text-xs flex items-start gap-1.5 ${ok ? 'text-emerald-400' : suave}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
      <span>{titulo}{!ok && motivo ? `: ${motivo}` : ''}</span>
    </p>
  );

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${caja}`}>
      <p className={`flex items-center gap-2 font-semibold ${texto}`}><KeyRound className="w-4 h-4 text-sky-400" /> Certificado digital</p>

      {!estado.tieneCertificado ? (
        <p className={`text-xs ${suave}`}>
          Sube tu certificado en Facturación, Certificado digital. Con él, {nombre} podrá hacer desde Codec Document los acuses de tus compras
          y tu nómina electrónica mientras tú sigues facturando aquí.
        </p>
      ) : (
        <>
          <p className={`text-xs ${suave}`}>{estado.titular || 'Certificado del negocio'}{estado.vence ? `, vence el ${fecha(estado.vence)}` : ''}.</p>

          <div className="space-y-1">
            <p className={`text-xs font-semibold ${texto}`}>Codec POS firma lo que {nombre} te mande</p>
            <Linea ok={estado.puedeFirmarAcuses} titulo="Acuses de tus compras" motivo={estado.motivoAcuses} />
            <Linea ok={estado.puedeFirmarNomina} titulo="Nómina electrónica" motivo={estado.motivoNomina} />
            {(estado.firmasValidadas > 0 || estado.firmasRechazadas > 0) && (
              <p className={`text-[11px] ${suave}`}>
                {estado.firmasValidadas.toLocaleString('es-CO')} aceptados por la DIAN
                {estado.firmasRechazadas ? `, ${estado.firmasRechazadas.toLocaleString('es-CO')} rechazados` : ''}.
              </p>
            )}
            {estado.firmaError && <p className="text-xs text-amber-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{estado.firmaError}</p>}
            <FormularioNomina oscuro={oscuro} alGuardar={cargar} />
          </div>

          <div className="space-y-1.5 pt-1">
            <p className={`text-xs font-semibold ${texto}`}>Copia para {nombre}</p>
            {estado.compartido ? (
              <>
                <p className="text-xs text-emerald-400 flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Compartido desde el {fecha(estado.compartidoEn)}. Si renuevas el certificado, le llega solo.</p>
                <button type="button" onClick={retirar} disabled={trabajando}
                  className={`w-full h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${oscuro ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-700'}`}>
                  {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />} Retirar la copia
                </button>
              </>
            ) : (
              <>
                <p className={`text-xs ${suave}`}>Opcional: dale una copia cifrada para que firme por su cuenta en Codec Document.</p>
                <button type="button" onClick={compartir} disabled={trabajando}
                  className="w-full h-9 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Compartir certificado con {nombre}
                </button>
              </>
            )}
            {estado.error && <p className="text-xs text-amber-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{estado.error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** Software ID, PIN y set de pruebas de nómina: los da la DIAN al habilitar la empresa para nómina. */
function FormularioNomina({ oscuro, alGuardar }: { oscuro: boolean; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosNomina | null>(null);
  const [guardando, setGuardando] = useState(false);
  const suave = oscuro ? 'text-slate-400' : 'text-gray-500';
  const campo = `w-full h-9 rounded-lg border px-2.5 text-xs ${oscuro ? 'bg-slate-950/60 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;

  useEffect(() => {
    if (abierto && !datos) obtenerDatosNomina().then((d) => setDatos(d ?? { softwareId: '', softwarePin: '', ambiente: 'habilitacion', testSetId: '' })).catch(() => undefined);
  }, [abierto, datos]);

  const guardar = async () => {
    if (!datos) return;
    setGuardando(true);
    try {
      await guardarDatosNomina(datos);
      toast.success('Datos de nómina guardados', { description: 'En un minuto tu contador verá que ya puede enviar la nómina.' });
      setAbierto(false);
      alGuardar();
    } catch (e) {
      toast.error('No se pudieron guardar', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setAbierto((a) => !a)} className={`text-[11px] underline flex items-center gap-1 ${suave}`}>
        <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? 'rotate-180' : ''}`} /> Datos de nómina electrónica
      </button>
      {abierto && (
        datos ? (
          <div className="mt-2 space-y-1.5">
            <input className={campo} placeholder="Software ID de nómina" value={datos.softwareId} onChange={(e) => setDatos({ ...datos, softwareId: e.target.value })} />
            <input className={campo} type="password" placeholder="PIN del software de nómina" value={datos.softwarePin} onChange={(e) => setDatos({ ...datos, softwarePin: e.target.value })} />
            <select className={campo} value={datos.ambiente} onChange={(e) => setDatos({ ...datos, ambiente: e.target.value as DatosNomina['ambiente'] })}>
              <option value="habilitacion">Habilitación (set de pruebas)</option>
              <option value="produccion">Producción</option>
            </select>
            {datos.ambiente === 'habilitacion' && (
              <input className={campo} placeholder="TestSetId de nómina" value={datos.testSetId} onChange={(e) => setDatos({ ...datos, testSetId: e.target.value })} />
            )}
            <p className={`text-[11px] ${suave}`}>Son distintos de los de facturación: la DIAN los da al habilitar la empresa para nómina electrónica.</p>
            <button type="button" onClick={guardar} disabled={guardando}
              className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
            </button>
          </div>
        ) : <p className={`mt-2 text-xs flex items-center gap-1.5 ${suave}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</p>
      )}
    </div>
  );
}
