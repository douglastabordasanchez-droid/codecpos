/**
 * Certificado digital para facturar desde la web.
 *
 * El negocio sube su .p12/.pfx y su clave UNA vez. Viajan por HTTPS a la
 * Edge Function dian-emision, que comprueba que abren, los cifra y los
 * guarda; desde ahí en adelante nadie —ni este navegador— puede volver a
 * leerlos. Aquí solo se muestra a quién pertenece y cuándo vence.
 *
 * El certificado que ya está en CODEC POS de escritorio sigue funcionando
 * por su cuenta: este es el que usan la web, el celular y cualquier caja que
 * no lo tenga instalado.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, ShieldCheck, ShieldAlert, Upload, Trash2, Loader2, X } from 'lucide-react';
import {
  consultarCertificadoNube, subirCertificadoNube, eliminarCertificadoNube, type CertificadoNube,
} from '../../lib/dian/transporteDian';
import { guardarMetadataCertificado, marcarPinConfigurado } from '../../lib/supabase/fiscalProfileService';
import { sha256Hex } from '../../lib/dian/recepcion/zip';

interface Props {
  clienteId: string;
  perfilFiscalId: string;
  soloLectura?: boolean;
}

/** «CN=NEGOCIO SAS, O=..., C=CO» → «NEGOCIO SAS». */
const nombreComun = (dn: string | undefined) => dn?.match(/(?:^|,\s*)CN=([^,]+)/)?.[1] || dn || '';

export function CertificadoDigital({ clienteId, perfilFiscalId, soloLectura }: Props) {
  const [estado, setEstado] = useState<CertificadoNube | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    setEstado(null);
    setError(null);
    consultarCertificadoNube(perfilFiscalId)
      .then((e) => { if (!cancelado) setEstado(e); })
      .catch((e) => { if (!cancelado) setError(e?.message || 'No se pudo consultar el certificado'); });
    return () => { cancelado = true; };
  }, [perfilFiscalId]);

  const cerrar = () => { setAbierto(false); setArchivo(null); setClave(''); };

  async function guardar() {
    if (!archivo || !clave) return;
    setGuardando(true);
    try {
      const nuevo = await subirCertificadoNube(perfilFiscalId, archivo, clave);
      setEstado(nuevo);
      // Datos PÚBLICOS del certificado (nombre, vencimiento) y la marca de
      // «clave configurada»: es lo que revisa el asistente antes de dejar
      // pasar el perfil a producción. Nada secreto se guarda aquí.
      await Promise.all([
        guardarMetadataCertificado(clienteId, perfilFiscalId, {
          nombreArchivo: archivo.name,
          huellaSha256: await sha256Hex(`${archivo.name}:${archivo.size}:${nuevo.venceEl}`),
          fechaVencimiento: (nuevo.venceEl || '').slice(0, 10),
          estado: 'activo',
        }),
        marcarPinConfigurado(perfilFiscalId),
      ]).catch((e) => console.warn('[DIAN] No se pudo registrar la metadata del certificado:', e));
      toast.success('Certificado guardado', { description: 'Ya puedes firmar y transmitir a la DIAN desde la web.' });
      cerrar();
    } catch (e: any) {
      toast.error('No se guardó el certificado', { description: e?.message });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!window.confirm('¿Quitar el certificado del servidor? La web y el celular dejarán de poder firmar hasta que subas otro.')) return;
    try {
      setEstado(await eliminarCertificadoNube(perfilFiscalId));
      toast.success('Certificado eliminado del servidor');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar');
    }
  }

  const diasParaVencer = estado?.venceEl ? Math.floor((new Date(estado.venceEl).getTime() - Date.now()) / 86_400_000) : null;
  const porVencer = diasParaVencer !== null && diasParaVencer <= 30;

  return (
    <>
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${estado?.existe && !porVencer ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
          {estado?.existe && !porVencer ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <KeyRound className="w-4 h-4 text-amber-400" />}
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-bold">Certificado digital para firmar desde la web</p>
          {error ? (
            <p className="text-red-400 text-xs">{error}</p>
          ) : estado === null ? (
            <p className="text-slate-500 text-xs">Consultando...</p>
          ) : estado.existe ? (
            <p className="text-slate-400 text-xs">
              {nombreComun(estado.sujeto)} ·{' '}
              <span className={porVencer ? 'text-amber-400 font-bold' : ''}>
                {diasParaVencer! < 0 ? 'vencido' : `vence el ${new Date(estado.venceEl!).toLocaleDateString('es-CO')}`}
                {porVencer && diasParaVencer! >= 0 && ` (en ${diasParaVencer} días)`}
              </span>
            </p>
          ) : (
            <p className="text-slate-400 text-xs">
              Sin certificado en el servidor: desde la web las facturas quedan pendientes hasta que un computador con CODEC POS las firme.
            </p>
          )}
        </div>
        {!soloLectura && estado !== null && !error && (
          <div className="flex gap-2">
            <button onClick={() => setAbierto(true)} className="h-9 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {estado.existe ? 'Reemplazar' : 'Subir certificado'}
            </button>
            {estado.existe && (
              <button onClick={eliminar} title="Quitar del servidor" className="h-9 w-9 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={cerrar}>
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p className="font-bold text-white">Subir certificado digital</p>
              <button onClick={cerrar} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">
                El archivo y su clave se guardan cifrados en el servidor y solo se usan para firmar los documentos de este negocio.
                No se pueden volver a descargar ni consultar: si pierdes el archivo original, pídeselo de nuevo a tu entidad certificadora.
              </p>
            </div>

            <input ref={inputRef} type="file" accept=".p12,.pfx" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <button onClick={() => inputRef.current?.click()} className="w-full h-11 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-semibold truncate px-3">
              {archivo ? archivo.name : 'Seleccionar archivo .p12 o .pfx'}
            </button>

            <label className="block space-y-1.5">
              <span className="text-xs text-slate-400">Clave del certificado</span>
              <input
                type="password"
                autoComplete="off"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm"
              />
            </label>

            <div className="flex gap-2">
              <button onClick={cerrar} className="flex-1 h-11 rounded-lg border border-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={guardar} disabled={!archivo || !clave || guardando} className="flex-1 h-11 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} {guardando ? 'Verificando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
