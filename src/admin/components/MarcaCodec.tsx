import { Moon, Sun } from 'lucide-react';
// Se importa desde el código (no "/logoapp.png"): el admin vive en /admin/ y
// una ruta desde la raíz del dominio no encuentra la imagen.
import logoCodec from '../../../landing/assets/logo-icon.png';
import { useTemaAdmin } from '../lib/temaAdmin';

export function MarcaCodec({ grande = false }: { grande?: boolean }) {
  return (
    <div className={`flex items-center ${grande ? 'gap-3' : 'gap-2.5'} min-w-0`}>
      <img
        src={logoCodec}
        alt="Codec Studio"
        className={`${grande ? 'w-14 h-14 rounded-2xl' : 'w-9 h-9 rounded-xl'} shrink-0 shadow-md shadow-orange-500/25`}
      />
      <div className="min-w-0 leading-tight">
        <p className={`${grande ? 'text-xl' : 'text-[15px]'} font-extrabold tracking-tight text-white truncate`}>Codec Studio</p>
        <p className={`${grande ? 'text-sm' : 'text-[11px]'} font-semibold uppercase tracking-wider text-amber-400`}>Admin Codec POS</p>
      </div>
    </div>
  );
}

export function BotonTema({ compacto = false }: { compacto?: boolean }) {
  const { tema, cambiar } = useTemaAdmin();
  const claro = tema === 'claro';
  const Icono = claro ? Moon : Sun;
  const texto = claro ? 'Modo oscuro' : 'Modo claro';
  return (
    <button
      type="button"
      onClick={cambiar}
      title={texto}
      aria-label={texto}
      className={compacto
        ? 'p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white'
        : 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors'}
    >
      <Icono className="w-4 h-4" />
      {!compacto && texto}
    </button>
  );
}
