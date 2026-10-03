/**
 * Botón flotante de WhatsApp de soporte de Codec (el mismo número de la
 * página comercial). Va en toda la app web, también en el inicio de sesión
 * para quien no puede entrar.
 *
 * Dónde se ubica:
 *  · Computador: abajo a la derecha.
 *  · Celular: abajo a la IZQUIERDA y por encima de la barra inferior, para no
 *    chocar con los botones de acción que van a la derecha (el «+» de Personal).
 *  · Se oculta en las pantallas de cobro, que tienen su propia barra fija
 *    abajo: ahí el botón de cobrar no se puede tapar.
 */
import { useLocation } from 'react-router';
import { useIsDesktop } from '../hooks/useIsDesktop';

const NUMERO = '573238646844';
const PANTALLAS_DE_COBRO = ['/vender', '/veterinaria', '/panaderia', '/artes-graficas', '/papeleria-pinateria'];

interface Props {
  /** Celular con la barra inferior visible: el botón sube para no taparla. */
  sobreNavInferior?: boolean;
  /** Computador (layout con menú lateral). Si no se indica, se detecta por el ancho de pantalla. */
  escritorio?: boolean;
  nombre?: string | null;
}

export function BotonWhatsApp({ sobreNavInferior, escritorio: forzarEscritorio, nombre }: Props) {
  const { pathname } = useLocation();
  const pantallaGrande = useIsDesktop();
  const escritorio = forzarEscritorio ?? pantallaGrande;
  if (PANTALLAS_DE_COBRO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const saludo = nombre ? `Hola, soy ${nombre.split(' ')[0]}. ` : 'Hola, ';
  const texto = `${saludo}necesito ayuda con Codec POS.`;
  const href = `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`;

  const posicion = escritorio
    ? 'right-6 bottom-6'
    : sobreNavInferior
      ? 'left-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))]'
      : 'left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))]';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribir a soporte por WhatsApp"
      title="Soporte por WhatsApp"
      className={`group fixed ${posicion} z-30 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${escritorio ? 'w-14 h-14' : 'w-12 h-12'}`}
      style={{ background: '#25D366', boxShadow: '0 8px 24px rgba(37, 211, 102, .35)' }}
    >
      {escritorio && (
        <span
          className="pointer-events-none absolute right-16 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          style={{ background: '#ffffff', color: '#0f172a' }}
        >
          ¿Necesitas ayuda? Escríbenos
        </span>
      )}
      <svg width={escritorio ? 28 : 26} height={escritorio ? 28 : 26} viewBox="0 0 32 32" fill="#ffffff" aria-hidden="true">
        <path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.2 1.6 6.02L4 29l8.13-1.56a12 12 0 0 0 3.91.65h.01C22.68 28.09 28 22.69 28 16.05 28 9.4 22.68 3 16.04 3Zm0 22.9h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-4.83.93.96-4.7-.24-.38a9.84 9.84 0 0 1-1.52-5.12c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.45-4.44 9.85-9.73 9.85Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
      </svg>
    </a>
  );
}
