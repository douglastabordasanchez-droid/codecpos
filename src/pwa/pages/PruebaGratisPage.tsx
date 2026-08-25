import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { Sparkles, Loader2, Eye, EyeOff, CheckCircle2, Smartphone, Monitor, Share, PlusSquare, Download } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { TIPOS_NEGOCIO } from '../../data/tipos-negocio';

const OPCIONES_TIPO_NEGOCIO = Object.values(TIPOS_NEGOCIO).map((t) => t.nombre);
const URL_DESCARGA_WINDOWS = 'https://github.com/douglastabordasanchez-droid/codecpos/releases/latest';

type Plataforma = 'android' | 'ios' | 'desktop';

function detectarPlataforma(): Plataforma {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS 13+ se reporta como Mac con soporte táctil — hay que distinguirlo.
  if (/iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

/**
 * Registro público de un negocio NUEVO (Fase 5) -- distinto de RegistroPage,
 * que es autoservicio de un EMPLEADO de un negocio que ya tiene licencia.
 * Aquí no existe negocio ni licencia todavía: los crea crear_cuenta_prueba()
 * (migración 0055) en una sola transacción, con una licencia TRIAL de 14
 * días. El backend controla la fecha de vencimiento -- este formulario no
 * decide nada de eso, solo recolecta los datos mínimos.
 */
export default function PruebaGratisPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = usePwaAuth();

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nit, setNit] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [tipoNegocio, setTipoNegocio] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [plataforma] = useState<Plataforma>(detectarPlataforma);
  const [promptInstalacion, setPromptInstalacion] = useState<any>(null);
  const [appInstalada, setAppInstalada] = useState(false);

  // 📲 Chrome/Android disparan este evento cuando la PWA es instalable — lo
  // guardamos para poder mostrar un botón real de "Instalar app" en vez de
  // solo instrucciones manuales. Safari/iOS nunca dispara esto (no lo
  // soporta), de ahí que iOS siempre muestre instrucciones paso a paso.
  useEffect(() => {
    const alDisponible = (e: Event) => {
      e.preventDefault();
      setPromptInstalacion(e);
    };
    const alInstalar = () => setAppInstalada(true);
    window.addEventListener('beforeinstallprompt', alDisponible);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alDisponible);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  const instalarApp = async () => {
    if (!promptInstalacion) return;
    promptInstalacion.prompt();
    await promptInstalacion.userChoice;
    setPromptInstalacion(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombreCompleto.trim() || !nombreNegocio.trim() || !email.trim() || !telefono.trim() || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!aceptaTerminos) {
      setError('Debes aceptar los términos y condiciones para continuar');
      return;
    }

    setLoading(true);
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      setError('nuestra base de datos no está configurada');
      return;
    }

    const { error: rpcError } = await client.rpc('crear_cuenta_prueba', {
      p_nombre_completo: nombreCompleto.trim(),
      p_nombre_negocio: nombreNegocio.trim(),
      p_email: email.trim(),
      p_telefono: telefono.trim(),
      p_password: password,
      p_nit: nit.trim() || null,
      p_ciudad: ciudad.trim() || null,
      p_tipo_negocio: tipoNegocio || null,
    });

    if (rpcError) {
      setLoading(false);
      setError(rpcError.message);
      return;
    }

    const resultado = await iniciarSesion(email.trim(), password);
    setLoading(false);

    if (resultado.ok) {
      setListo(true);
    } else {
      setError(resultado.error || 'Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente. Intenta iniciar sesión.');
    }
  };

  if (listo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center p-6 pt-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/30 shrink-0">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-white text-2xl font-black mb-2">¡Tu prueba gratuita comenzó!</h1>
        <p className="text-slate-400 text-sm mb-6 max-w-xs">
          Te quedan 14 días para probar Codec POS sin restricciones. No necesitas tarjeta ni hacer nada más.
        </p>

        <Button
          onClick={() => navigate('/', { replace: true })}
          className="w-full max-w-xs h-12 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20 mb-6"
        >
          Entrar a Codec POS Web ahora
        </Button>

        <div className="w-full max-w-xs text-left space-y-3">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wide text-center mb-1">
            O instala Codec POS
          </p>

          {/* ── ANDROID ─────────────────────────────────────────────── */}
          {plataforma === 'android' && (
            <div className="bg-slate-900/70 backdrop-blur border border-emerald-800/40 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-white font-bold text-sm">Aplicación para tu celular Android</p>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed mb-3">
                Es la app completa de Codec POS: incluye desbloqueo con huella digital real de tu teléfono.
              </p>
              <a
                href="/download"
                className="w-full h-11 rounded-md flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors mb-3"
              >
                <Download className="w-4 h-4" /> Descargar app (APK)
              </a>

              <div className="border-t border-slate-800 pt-3">
                <p className="text-slate-500 text-[11px] mb-2">O, si prefieres, un acceso directo más simple (sin huella):</p>
                {appInstalada ? (
                  <p className="text-emerald-400 text-xs">¡Ya la instalaste! Ábrela desde tu pantalla de inicio.</p>
                ) : promptInstalacion ? (
                  <Button onClick={instalarApp} variant="outline" className="w-full h-10 border-slate-700 text-slate-300">
                    Agregar acceso directo
                  </Button>
                ) : (
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Toca los <strong>3 puntos ⋮</strong> del navegador → <strong>"Agregar a pantalla de inicio"</strong>.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── iPHONE ───────────────────────────────────────────────── */}
          {plataforma === 'ios' && (
            <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                <p className="text-white font-bold text-sm">Aplicación para tu iPhone</p>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed mb-2">
                <strong className="text-sky-400">Importante:</strong> en iPhone el proceso es diferente al de Android — Apple no
                permite instalar esta app desde fuera de la App Store, así que se agrega así (funciona igual de bien):
              </p>
              <ol className="text-slate-400 text-xs leading-relaxed space-y-1.5 list-decimal list-inside">
                <li>Toca el ícono <Share className="w-3.5 h-3.5 inline mx-0.5 -mt-0.5" /> <strong>Compartir</strong> abajo en Safari.</li>
                <li>Elige <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 -mt-0.5" /> <strong>"Agregar a pantalla de inicio"</strong>.</li>
                <li>Toca <strong>"Agregar"</strong> — listo, ya tienes el ícono de Codec POS.</li>
              </ol>
            </div>
          )}

          {/* ── COMPUTADOR (Windows) ───────────────────────────────────── */}
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-white font-bold text-sm">Aplicación para tu computador (Windows)</p>
            </div>
            {plataforma === 'desktop' ? (
              <a
                href={URL_DESCARGA_WINDOWS}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 rounded-md flex items-center justify-center gap-2 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors"
              >
                <Download className="w-4 h-4" /> Descargar instalador (.exe)
              </a>
            ) : (
              <p className="text-slate-400 text-xs leading-relaxed">
                <strong className="text-amber-400">Esta no se puede instalar desde el celular.</strong> Es el programa para el
                computador de tu negocio (donde cobras). Abre{' '}
                <span className="text-amber-400 font-semibold">{typeof window !== 'undefined' ? window.location.hostname : 'esta página'}</span>{' '}
                desde esa computadora y descarga el instalador ahí.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-xl shadow-orange-500/30">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-white text-xl font-black mb-1">Probar 14 días gratis</h1>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-xs">
        Crea tu cuenta y empieza a usar Codec POS ahora mismo, sin tarjeta de crédito.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu nombre completo</Label>
          <Input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Nombre de tu negocio</Label>
          <Input value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu correo</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">NIT (opcional)</Label>
            <Input value={nit} onChange={(e) => setNit(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Ciudad</Label>
            <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tipo de negocio</Label>
          <select
            value={tipoNegocio}
            onChange={(e) => setTipoNegocio(e.target.value)}
            className="w-full h-12 rounded-lg px-3 text-sm bg-slate-950/60 border border-slate-700 text-white"
          >
            <option value="">Selecciona (opcional)...</option>
            {OPCIONES_TIPO_NEGOCIO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Contraseña</Label>
            <div className="relative">
              <Input
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-10 bg-slate-950/60 border-slate-700 text-white"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Confirmar</Label>
            <Input
              type={mostrarPassword ? 'text' : 'password'}
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              className="h-12 bg-slate-950/60 border-slate-700 text-white"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-400 pt-1">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={(e) => setAceptaTerminos(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950/60 accent-amber-500"
          />
          <span>Acepto los términos de uso y la política de tratamiento de datos de Codec POS.</span>
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? 'Creando tu cuenta...' : 'Empezar mi prueba gratis'}
        </Button>

        <p className="text-center text-sm text-slate-400">
          ¿Ya tienes cuenta? <Link to="/login" className="text-amber-400 font-semibold">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
