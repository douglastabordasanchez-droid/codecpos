import { useState, ReactNode } from 'react';
import { Lock, MessageCircle, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { MotivoBloqueoLicencia, WHATSAPP_CODEC_STUDIO } from '../../lib/bloqueoLicencia';

const TEXTOS: Record<MotivoBloqueoLicencia, { titulo: string; detalle: string; mensaje: string }> = {
  SUSPENDIDA: {
    titulo: 'Tu cuenta está suspendida',
    detalle: 'Codec Studio suspendió el acceso de este negocio. Escríbenos para reactivarlo.',
    mensaje: 'Hola, mi cuenta de Codec POS aparece suspendida. ¿Me ayudan a reactivarla?',
  },
  CANCELADA: {
    titulo: 'Tu licencia fue cancelada',
    detalle: 'Este negocio ya no tiene una licencia activa de Codec POS. Escríbenos para activarla de nuevo.',
    mensaje: 'Hola, mi licencia de Codec POS aparece cancelada. Quiero activarla de nuevo.',
  },
  VENCIDA: {
    titulo: 'Tu licencia venció',
    detalle: 'Renueva tu plan para seguir usando Codec POS. Tus datos están guardados y vuelven apenas renueves.',
    mensaje: 'Hola, mi licencia de Codec POS venció y quiero renovarla.',
  },
};

interface Props {
  motivo: MotivoBloqueoLicencia;
  nombreNegocio?: string;
  onVerificar: () => Promise<void> | void;
  onCerrarSesion: () => void;
  /** Acción extra, por ejemplo "Pagar ahora" en Electron cuando está vencida. */
  accionExtra?: ReactNode;
}

/** Pantalla completa que reemplaza al sistema mientras la licencia esté bloqueada. */
export function PantallaBloqueoLicencia({ motivo, nombreNegocio, onVerificar, onCerrarSesion, accionExtra }: Props) {
  const [verificando, setVerificando] = useState(false);
  const texto = TEXTOS[motivo];

  const verificar = async () => {
    setVerificando(true);
    try { await onVerificar(); } finally { setVerificando(false); }
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-7 h-7 text-red-400" />
        </div>
        {nombreNegocio && <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">{nombreNegocio}</p>}
        <h1 className="text-white font-bold text-xl mb-2">{texto.titulo}</h1>
        <p className="text-slate-400 text-sm mb-6">{texto.detalle}</p>

        <div className="space-y-2.5">
          {accionExtra}
          <a
            href={`https://wa.me/${WHATSAPP_CODEC_STUDIO}?text=${encodeURIComponent(texto.mensaje)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm"
          >
            <MessageCircle className="w-4 h-4" /> Escribir a Codec Studio
          </a>
          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 text-sm font-semibold disabled:opacity-60"
          >
            {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Ya me activaron, verificar
          </button>
          <button
            type="button"
            onClick={onCerrarSesion}
            className="flex items-center justify-center gap-2 w-full h-10 text-slate-400 text-sm"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
