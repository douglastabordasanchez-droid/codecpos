/**
 * CODEC POS v2.0 - Página de Login con Bendición de Dios
 * El mejor sistema POS del mercado colombiano
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2, Shield, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAuth } from '../../contexts/AuthContext';
import { RecuperarPasswordModal } from './RecuperarPasswordModal';
import { toast } from 'sonner';
import logoImage from '/logo.png';
import { useDeveloperShortcut } from '../../hooks/useDeveloperShortcut';

interface AdminServer { ip: string; httpPort: number; }

export default function LoginPage() {
  const navigate = useNavigate();
  const { iniciarSesion, estaAutenticado, registrarSesionRedLocal } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [wifiSsid, setWifiSsid] = useState<string | null>(null);
  const [onLine, setOnLine] = useState(() => navigator.onLine);
  const [adminServer, setAdminServer] = useState<AdminServer | null>(null);
  const [discoveringServer, setDiscoveringServer] = useState(true);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);

  // ⚡ ATAJO DE TECLADO: Ctrl+Shift+D para Panel de Desarrollador
  useDeveloperShortcut();

  // ✅ FIX: Solo redirigir UNA VEZ si ya está autenticado
  useEffect(() => {
    if (estaAutenticado) {
      navigate('/pos', { replace: true });
    }
  }, [estaAutenticado, navigate]);

  // 🔍 Descubrir servidor admin en la red al iniciar (escucha UDP broadcast 2.5s)
  useEffect(() => {
    const el = (window as any).electron;
    if (!el?.lan?.discoverServers) { setDiscoveringServer(false); return; }
    el.lan.discoverServers()
      .then((servers: AdminServer[]) => {
        if (servers.length > 0) setAdminServer({ ip: servers[0].ip, httpPort: servers[0].httpPort || 4002 });
      })
      .catch(() => {})
      .finally(() => setDiscoveringServer(false));
  }, []);

  // 📡 Polling de red: SSID cada 6s + estado online/offline en tiempo real
  useEffect(() => {
    const handleOnline  = () => setOnLine(true);
    const handleOffline = () => setOnLine(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    const el = (window as any).electron;

    const fetchSsid = async () => {
      try {
        // Primero intenta el canal nativo mejorado
        if (el?.network?.getCurrentSSID) {
          const result = await el.network.getCurrentSSID();
          setWifiSsid(result?.ssid ?? '');
          return;
        }
        // Fallback al canal legacy
        if (el?.wifi?.getSsid) {
          const ssid = await el.wifi.getSsid();
          setWifiSsid(ssid ?? '');
          return;
        }
      } catch {}
      setWifiSsid('');
    };

    // 🛡️ FIX FLUIDEZ: consultar el SSID lanza un proceso "netsh" del sistema
    // operativo (child_process) desde el main process. Hacerlo de inmediato,
    // justo cuando el login recién monta, compite por CPU con el arranque de
    // React/el primer pintado — exactamente la ventana en la que el usuario
    // ya está intentando escribir usuario/contraseña. Se retrasa el primer
    // sondeo y se espacía el intervalo (era cada 6s) porque es solo una
    // insignia decorativa, no algo crítico para operar.
    const primerSondeo = setTimeout(fetchSsid, 2500);
    const timer = setInterval(fetchSsid, 15000);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(primerSondeo);
      clearInterval(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast.error('Campos incompletos', { description: 'Por favor ingresa usuario y contraseña' });
      return;
    }

    setLoading(true);

    try {
      // ── PASO 1: Autenticación local (Admin y empleados registrados en este equipo) ──
      console.log('🔐 Intentando autenticación local...');
      const localExito = await iniciarSesion(username, password);

      if (localExito) {
        console.log('✅ Login local exitoso');
        toast.success('¡Que Dios bendiga tu jornada!', { description: 'Bienvenido a CODEC POS', duration: 2500 });
        setTimeout(() => navigate('/pos', { replace: true }), 100);
        return;
      }

      // ── PASO 2: Autenticación en red local (contra el servidor Admin) ──────────────
      if (adminServer) {
        console.log(`🌐 Intentando login en red con servidor ${adminServer.ip}...`);
        try {
          const el = (window as any).electron;
          const machineId = el?.getMachineId ? await el.getMachineId().catch(() => `t_${Date.now()}`) : `t_${Date.now()}`;
          const localIp = el?.lan?.getLocalIp ? await el.lan.getLocalIp().catch(() => '') : '';

          const resp = await fetch(
            `http://${adminServer.ip}:${adminServer.httpPort}/api/auth/network-login`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                usuario: username,
                password,
                terminalInfo: {
                  terminalId: `term_${String(machineId).slice(0, 8)}`,
                  hostname: navigator.userAgent.slice(0, 50),
                },
              }),
              signal: AbortSignal.timeout(5000),
            }
          );
          const data = await resp.json();

          if (data.ok && data.usuario) {
            console.log('✅ Login de red exitoso:', data.usuario.nombreCompleto);
            // Registrar sesión localmente con los datos del servidor
            registrarSesionRedLocal(data.usuario);
            toast.success('¡Sesión iniciada en red!', {
              description: `Autenticado por ${adminServer.ip} · Bienvenido ${data.usuario.nombreCompleto}`,
              duration: 3000,
            });
            // Conectar TCP al servidor para aparecer en el Monitoreo
            if (el?.lan?.startClient) {
              el.lan.startClient({
                identity: {
                  terminalId: `term_${String(machineId).slice(0, 8)}`,
                  cajeroNombre: data.usuario.nombreCompleto,
                  cajeroIp: localIp,
                  cajeroRol: data.usuario.rol,
                  userId: data.usuario.id,
                },
                serverIp: adminServer.ip,
              }).catch((err: Error) => console.warn('[LAN Client] No se pudo conectar TCP:', err.message));
            }
            setTimeout(() => navigate('/pos', { replace: true }), 150);
            return;
          }

          // El servidor respondió pero con error de credenciales
          toast.error('Credenciales incorrectas', {
            description: data.error || 'El servidor administrador rechazó las credenciales.',
            duration: 3500,
          });
          setPassword('');
          return;
        } catch (netErr: any) {
          console.warn('[Network Login] Error de red:', netErr?.message);
          // Si el servidor no responde, caer en el error genérico
        }
      }

      // ── PASO 3: Fallo total ───────────────────────────────────────────────────────
      console.log('❌ Autenticación fallida en local y red');
      toast.error('Credenciales incorrectas', {
        description: adminServer
          ? 'No encontrado en este equipo ni en el servidor administrador de la red.'
          : 'Usuario o contraseña inválidos. Si este equipo es secundario, asegúrate de que el servidor administrador esté encendido.',
        duration: 4000,
      });
      setPassword('');
    } catch (err) {
      console.error('❌ ERROR en autenticación:', err);
      toast.error('Error del sistema', { description: 'No se pudo procesar el inicio de sesión.' });
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Indicador servidor LAN — esquina superior izquierda */}
      <div className="absolute top-4 left-4 z-20">
        {discoveringServer ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-slate-800 border-slate-700/50 text-slate-400">
            <Loader2 className="w-3.5 h-3.5 shrink-0" />
            <span>Buscando red POS...</span>
          </div>
        ) : adminServer ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-cyan-900 border-cyan-700/50 text-cyan-300">
            <div className="relative w-2 h-2">
              <span className="relative inline-flex w-2 h-2 rounded-full bg-cyan-500" />
            </div>
            <span>Red POS: {adminServer.ip}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-slate-800 border-slate-700/30 text-slate-500">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Modo local</span>
          </div>
        )}
      </div>

      {/* Indicador Wi-Fi — esquina superior derecha (siempre visible) */}
      <div className="absolute top-4 right-4 z-20">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold
          ${!onLine
            ? 'bg-red-900 border-red-700/50 text-red-300'
            : wifiSsid
              ? 'bg-emerald-900 border-emerald-700/50 text-emerald-300'
              : 'bg-slate-800 border-slate-700/50 text-slate-400'
          }`}>
          {wifiSsid === null ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0" />
          ) : !onLine ? (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          ) : wifiSsid ? (
            <Wifi className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>
            {wifiSsid === null
              ? 'Red...'
              : !onLine
                ? 'Sin conexión'
                : wifiSsid
                  ? `Conectado a: ${wifiSsid}`
                  : 'Sin Wi-Fi'}
          </span>
        </div>
      </div>

      {/* Manchas de color de fondo (sólidas, sin blur — el blur es muy costoso
          de rasterizar en equipos sin aceleración por GPU) */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-500/10 rounded-full" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-500/10 rounded-full" />

      <div
        className="w-full max-w-md relative z-10"
        style={{
          maxHeight: '95vh',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#10b981 #1e293b'
        }}
      >
        {/* Card principal */}
        <div className="bg-slate-800 rounded-3xl shadow-xl border border-slate-700/50 overflow-hidden my-4">
          <div className="p-6">
            {/* Logo y título */}
            <div className="text-center mb-6">
              {/* Logo principal de marca */}
              <div className="w-24 h-24 mx-auto mb-4 relative">
                <div className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl flex items-center justify-center border border-slate-600/50 p-2">
                  <img
                    src={logoImage}
                    alt="Codec Studio"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Título */}
              <h1 className="text-2xl font-black text-white mb-2 tracking-tight">
                CODEC POS
              </h1>
              <p className="text-amber-400 font-bold text-sm">
                Sistema de Punto de Venta
              </p>
              <p className="text-slate-400 text-xs mt-1">
                v2.0 • Codec Studio
              </p>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campo Usuario */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Usuario
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ingresa tu usuario"
                    className="pl-10 h-12 rounded-xl bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                  <Input
                    type={mostrarPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña"
                    className="pl-10 pr-10 h-12 rounded-xl bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                  >
                    {mostrarPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Botón de Login */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 transition-all duration-300 border-0 mt-4"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    Ingresar al Sistema
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </Button>

              <button
                type="button"
                onClick={() => setMostrarRecuperar(true)}
                className="w-full text-center text-xs text-slate-400 hover:text-amber-400 transition-colors pt-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>

            {/* Indicador de seguridad + Estado de conexión */}
            <div className="mt-4 space-y-3">
              {/* Estado del sistema */}
              <div className="p-3 rounded-xl border bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-500">
                    <HardDrive className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-xs">
                      💾 Modo Interno Local
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      Sistema de seguridad y autenticación local habilitado
                    </p>
                  </div>
                </div>
              </div>

              {/* Seguridad */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-amber-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-xs">
                      Sistema de acceso seguro
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      Cada empleado debe usar sus credenciales
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Versículo Bíblico */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-slate-300 text-[10px] text-center italic leading-relaxed">
                "No temas, porque yo estoy contigo; no desmayes,
                porque yo soy tu Dios que te esfuerzo; siempre te
                ayudaré, siempre te sustentaré con la diestra de mi
                justicia."
              </p>
              <p className="text-amber-400 text-[10px] text-center mt-1.5 font-semibold">
                Isaías 41:10
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-900/50 px-6 py-3 border-t border-slate-700/50">
            <p className="text-slate-500 text-[10px] text-center">
              © 2026 <span className="text-amber-400 font-semibold">Codec Studio</span> - Todos los derechos reservados
            </p>
          </div>
        </div>

        {/* Texto inferior */}
        <div className="mt-4 text-center mb-4">
          <p className="text-slate-400 text-xs font-medium">
            Sistema de Control de Acceso Activo
          </p>
          <p className="text-slate-500 text-[10px] mt-0.5">
            Autenticación segura y encriptada
          </p>
        </div>
      </div>

      {mostrarRecuperar && <RecuperarPasswordModal onClose={() => setMostrarRecuperar(false)} />}
    </div>
  );
}