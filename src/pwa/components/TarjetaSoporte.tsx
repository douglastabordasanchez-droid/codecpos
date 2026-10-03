/**
 * Contacto de soporte de Codec por WhatsApp (el mismo número de la página
 * comercial). Va en Configuración (administradores) y en Mi perfil (todo el
 * equipo), en la web y en el celular.
 */
import { useState } from 'react';
import { Check, Copy, LifeBuoy } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const NUMERO = '573238646844';
const NUMERO_VISIBLE = '+57 323 864 6844';

export function TarjetaSoporte() {
  const { empleado } = usePwaAuth();
  const [copiado, setCopiado] = useState(false);

  const nombre = empleado?.nombre_completo?.split(' ')[0];
  const texto = nombre ? `Hola, soy ${nombre}. Necesito ayuda con Codec POS.` : 'Hola, necesito ayuda con Codec POS.';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(NUMERO_VISIBLE);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin portapapeles: el número igual está a la vista */ }
  };

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <LifeBuoy className="w-4 h-4 text-emerald-400" />
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Soporte Codec POS</span>
      </div>
      <p className="text-slate-500 text-xs mb-4">¿Tienes dudas o algo no funciona? Escríbenos por WhatsApp y te ayudamos.</p>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/50 border border-slate-800 px-4 py-3 mb-3">
        <div className="min-w-0">
          <p className="text-slate-500 text-[11px]">WhatsApp</p>
          <p className="text-white font-bold tracking-wide">{NUMERO_VISIBLE}</p>
        </div>
        <button
          onClick={copiar}
          className="shrink-0 h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
          title="Copiar número"
        >
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <a
        href={`https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.99]"
        style={{ background: '#25D366', color: '#ffffff' }}
      >
        <svg width="20" height="20" viewBox="0 0 32 32" fill="#ffffff" aria-hidden="true">
          <path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.2 1.6 6.02L4 29l8.13-1.56a12 12 0 0 0 3.91.65h.01C22.68 28.09 28 22.69 28 16.05 28 9.4 22.68 3 16.04 3Zm0 22.9h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-4.83.93.96-4.7-.24-.38a9.84 9.84 0 0 1-1.52-5.12c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.45-4.44 9.85-9.73 9.85Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
        </svg>
        Escribir por WhatsApp
      </a>
    </div>
  );
}
