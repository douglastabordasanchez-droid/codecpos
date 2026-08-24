import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Store, Save, Loader2, Layers, Crown, Zap, ShieldCheck, Eye, EyeOff, Copy, Check, RefreshCw, ChevronDown, Mail, Smartphone, PanelLeft, FileText, ChevronRight, Download, Share, SquarePlus, MoreVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient, getSupabasePublicConfig } from '../../app/lib/supabase/config';
import { MODULOS_CATALOGO } from '../../app/lib/permissions';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { NAV_TODOS } from '../lib/sidebarNav';
import { esRutaOculta, alternarRutaOculta } from '../lib/sidebarPrefs';
import { estaEnAppAndroid, abrirAjustesNotificacionesAndroid } from '../lib/androidBridge';

interface NegocioForm {
  nombre_negocio: string;
  nit: string;
  contacto: string;
  telefono: string;
  email: string;
  plan: string;
  webhook_token: string | null;
}

export default function ConfiguracionPage() {
  const { empleado } = usePwaAuth();
  const { tieneModulo, cargando: cargandoModulos } = useModulosActivos();
  const [form, setForm] = useState<NegocioForm | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [generandoToken, setGenerandoToken] = useState(false);
  const [copiado, setCopiado] = useState<'token' | 'url' | 'script' | 'gscript_link' | null>(null);
  const [mostrarGuia, setMostrarGuia] = useState(false);
  const [, forceUpdateSidebar] = useState(0);

  const puedeVer = empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const enAppAndroid = estaEnAppAndroid();

  useEffect(() => {
    if (!empleado || !puedeVer) return;
    const client = getSupabaseClient();
    if (!client) {
      setCargando(false);
      return;
    }
    client
      .from('clientes_pos')
      .select('nombre_negocio, nit, contacto, telefono, email, plan, webhook_token')
      .eq('id', empleado.cliente_id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as NegocioForm | null;
        setForm({
          nombre_negocio: row?.nombre_negocio || '',
          nit: row?.nit || '',
          contacto: row?.contacto || '',
          telefono: row?.telefono || '',
          email: row?.email || '',
          plan: row?.plan || 'BASICO',
          webhook_token: row?.webhook_token || null,
        });
        setCargando(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id, puedeVer]);

  const handleGuardar = async () => {
    if (!empleado || !form) return;
    setGuardando(true);
    setMensaje(null);
    const client = getSupabaseClient();
    const { error } = await client!.rpc('actualizar_perfil_negocio', {
      p_nombre_negocio: form.nombre_negocio,
      p_nit: form.nit,
      p_contacto: form.contacto,
      p_telefono: form.telefono,
      p_email: form.email,
    });
    setGuardando(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } else {
      setMensaje({ tipo: 'ok', texto: 'Cambios guardados' });
    }
  };

  const handleRotarToken = async () => {
    if (!empleado || !form) return;
    setGenerandoToken(true);
    const client = getSupabaseClient()!;
    const { data, error } = await client.rpc('rotar_webhook_token', { p_cliente_id: empleado.cliente_id });
    setGenerandoToken(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
      return;
    }
    setForm({ ...form, webhook_token: data as string });
    setMostrarToken(true);
  };

  const copiarTexto = (texto: string, cual: 'token' | 'url' | 'script' | 'gscript_link') => {
    navigator.clipboard.writeText(texto);
    setCopiado(cual);
    setTimeout(() => setCopiado(null), 2000);
  };

  const GOOGLE_SCRIPT_URL = 'https://script.google.com';

  const publicConfig = getSupabasePublicConfig();
  const webhookUrl = publicConfig ? `${publicConfig.url}/rest/v1/rpc/registrar_pago_automatico` : '';
  const appsScriptCode = form?.webhook_token
    ? `function revisarPagosNequi() {
  var hilos = GmailApp.search('from:nequi.com.co is:unread newer_than:1d', 0, 5);
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      var texto = msg.getPlainBody();
      var monto = texto.match(/\\$\\s?([\\d.,]+)/);
      if (!monto) return;
      var valor = parseInt(monto[1].replace(/[.,]/g, ''), 10);
      UrlFetchApp.fetch('${webhookUrl}', {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: '${publicConfig?.anonKey}', Authorization: 'Bearer ${publicConfig?.anonKey}' },
        payload: JSON.stringify({ p_token: '${form.webhook_token}', p_monto: valor, p_entidad: 'nequi', p_referencia: msg.getFrom() }),
      });
      msg.markRead();
    });
  });
}`
    : '';

  if (!empleado) return null;
  if (!puedeVer) return <Navigate to="/" replace />;

  const modulosVisibles = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador');
  const modulosActivosInfo = modulosVisibles.filter((m) => tieneModulo(m.id));

  const esAdmin = ['admin', 'super_usuario'].includes(empleado.rol);
  const itemsPersonalizables = NAV_TODOS.filter((it) =>
    !it.fijo &&
    (!it.modulo || tieneModulo(it.modulo)) &&
    (!it.soloAdmin || esAdmin) &&
    (!it.soloStaff || empleado.es_staff_codec)
  );

  const handleToggleSidebar = (path: string) => {
    alternarRutaOculta(path);
    forceUpdateSidebar((n) => n + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Configuración</h1>
        <p className="text-slate-400 text-sm">Datos del negocio y módulos activos</p>
      </div>

      {cargando || !form ? (
        <p className="text-slate-500 text-sm text-center py-12">Cargando...</p>
      ) : (
        <>
          <div className="px-5 space-y-4">
            <SeccionDescargarApp />

            <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-amber-400" />
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Datos del negocio</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Nombre comercial</Label>
                <Input
                  value={form.nombre_negocio}
                  onChange={(e) => setForm({ ...form, nombre_negocio: e.target.value })}
                  className="h-12 bg-slate-950/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">NIT</Label>
                <Input
                  value={form.nit}
                  onChange={(e) => setForm({ ...form, nit: e.target.value })}
                  className="h-12 bg-slate-950/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Contacto</Label>
                <Input
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                  className="h-12 bg-slate-950/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="h-12 bg-slate-950/60 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Correo</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-12 bg-slate-950/60 border-slate-700 text-white"
                />
              </div>

              {mensaje && (
                <p className={`text-sm ${mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{mensaje.texto}</p>
              )}

              <Button onClick={handleGuardar} disabled={guardando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>

            <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                {form.plan === 'PREMIUM' ? (
                  <Crown className="w-4 h-4 text-amber-400" />
                ) : (
                  <Zap className="w-4 h-4 text-sky-400" />
                )}
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">
                  Plan {form.plan === 'PREMIUM' ? 'Premium' : 'Básico'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="text-white text-sm font-semibold">
                  {cargandoModulos ? 'Cargando módulos...' : `${modulosActivosInfo.length} de ${modulosVisibles.length} módulos activos`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {modulosActivosInfo.map((m) => (
                  <span key={m.id} className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-800/50 text-emerald-400">
                    {m.icono} {m.nombre}
                  </span>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-3">
                Los módulos se gestionan desde el Panel Desarrollador de Codec Studio. Contáctalos para activar o desactivar alguno.
              </p>
            </div>

            <Link
              to="/facturacion"
              className="flex items-center justify-between gap-3 bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Facturación Electrónica DIAN</p>
                  <p className="text-slate-500 text-xs">Perfil fiscal e historial de facturas</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            </Link>

            <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <PanelLeft className="w-4 h-4 text-sky-400" />
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Personalizar sidebar</span>
              </div>
              <p className="text-slate-500 text-xs mb-4">
                Elige qué módulos aparecen en tu menú lateral. Los que ocultes siguen activos, solo dejan de mostrarse en la navegación.
              </p>
              <div className="space-y-1.5">
                {itemsPersonalizables.map((it) => {
                  const oculto = esRutaOculta(it.path);
                  return (
                    <button
                      key={it.path}
                      onClick={() => handleToggleSidebar(it.path)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-left"
                    >
                      <span className={`flex items-center gap-3 text-sm font-semibold ${oculto ? 'text-slate-500' : 'text-white'}`}>
                        <it.icon className={`w-4 h-4 shrink-0 ${oculto ? 'text-slate-600' : 'text-sky-400'}`} />
                        {it.label}
                      </span>
                      {oculto ? <EyeOff className="w-4 h-4 text-slate-600 shrink-0" /> : <Eye className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/70 backdrop-blur border border-purple-800/40 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Automatización de pagos · Codec Verify</span>
              </div>
              <p className="text-slate-500 text-xs mb-4">
                Conecta un correo o SMS de confirmación de pago (Nequi, Daviplata...) para que el POS se entere solo,
                sin que nadie tenga que escribir el monto a mano. Este token es el único requisito de seguridad — no lo compartas.
              </p>

              {form.webhook_token ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-slate-400 text-xs">Token del negocio</Label>
                    <div className="flex gap-2 mt-1.5">
                      <div className="flex-1 h-11 px-3 rounded-lg bg-slate-950/60 border border-slate-700 flex items-center font-mono text-xs text-white overflow-hidden">
                        {mostrarToken ? form.webhook_token : '•'.repeat(24)}
                      </div>
                      <button onClick={() => setMostrarToken(!mostrarToken)} className="h-11 w-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        {mostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => copiarTexto(form.webhook_token!, 'token')} className="h-11 w-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        {copiado === 'token' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-400 text-xs">URL del webhook</Label>
                    <div className="flex gap-2 mt-1.5">
                      <div className="flex-1 h-11 px-3 rounded-lg bg-slate-950/60 border border-slate-700 flex items-center font-mono text-[10px] text-white overflow-x-auto whitespace-nowrap">
                        {webhookUrl}
                      </div>
                      <button onClick={() => copiarTexto(webhookUrl, 'url')} className="h-11 w-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        {copiado === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setMostrarGuia(!mostrarGuia)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-purple-300 pt-1"
                  >
                    Cómo conectarlo (correo o SMS)
                    <ChevronDown className={`w-4 h-4 transition-transform ${mostrarGuia ? 'rotate-180' : ''}`} />
                  </button>

                  {mostrarGuia && (
                    <div className="space-y-4 pt-1">
                      <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="w-4 h-4 text-sky-400" />
                          <p className="text-white text-sm font-semibold">Por correo (Gmail) — sin instalar nada</p>
                        </div>
                        <ol className="text-slate-400 text-xs space-y-1 list-decimal list-inside mb-3">
                          <li className="flex items-center gap-1.5 flex-wrap">
                            <span>Abre <span className="text-slate-300">script.google.com</span> con el Gmail donde llegan los correos de Nequi</span>
                            <button
                              onClick={() => copiarTexto(GOOGLE_SCRIPT_URL, 'gscript_link')}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300 shrink-0"
                            >
                              {copiado === 'gscript_link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copiar link
                            </button>
                          </li>
                          <li>Crea un proyecto nuevo, pega el código de abajo</li>
                          <li>En "Activadores" (reloj), agrega uno cada 5 minutos para esta función</li>
                        </ol>
                        <div className="relative">
                          <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[10px] text-slate-300 overflow-x-auto max-h-40">{appsScriptCode}</pre>
                          <button
                            onClick={() => copiarTexto(appsScriptCode, 'script')}
                            className="absolute top-2 right-2 h-7 w-7 rounded-md bg-slate-800 flex items-center justify-center text-slate-300"
                          >
                            {copiado === 'script' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Smartphone className="w-4 h-4 text-emerald-400" />
                          <p className="text-white text-sm font-semibold">App Android Codec Verify (recomendado)</p>
                        </div>
                        {enAppAndroid ? (
                          <>
                            <p className="text-slate-400 text-xs mb-3">
                              Ya estás usando la app — lee las notificaciones de Nequi, Bancolombia y Daviplata en
                              tiempo real. Revisa aquí los permisos y el estado del listener.
                            </p>
                            <button
                              onClick={abrirAjustesNotificacionesAndroid}
                              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Ver permisos y estado
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-400 text-xs mb-3">
                              Instala la app en el celular donde llegan los pagos y entra con el mismo usuario y
                              contraseña de aquí — queda configurada sola, lee las notificaciones de Nequi, Bancolombia
                              y Daviplata en tiempo real, y ya no depende de MacroDroid ni de ninguna app de terceros.
                            </p>
                            <a
                              href="/download"
                              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            >
                              <Download className="w-3.5 h-3.5" /> Descargar app Android
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button onClick={handleRotarToken} disabled={generandoToken} className="w-full h-12 bg-gradient-to-r from-purple-600 to-fuchsia-600">
                  {generandoToken ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  {generandoToken ? 'Generando...' : 'Generar token de automatización'}
                </Button>
              )}

              {form.webhook_token && (
                <button
                  onClick={handleRotarToken}
                  disabled={generandoToken}
                  className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-300"
                >
                  <RefreshCw className={`w-3 h-3 ${generandoToken ? 'animate-spin' : ''}`} />
                  Generar un token nuevo (invalida el actual)
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Descargar / instalar la app ─────────────────────────────────────────────

/**
 * Android (Chrome) muestra solo, tarde o temprano, su propio banner
 * "Instalar app" — pero iOS Safari NUNCA lo hace: instalar ahí es un flujo
 * manual (Compartir → Agregar a inicio) que además solo existe en Safari,
 * no en Chrome/otros navegadores de iPhone. Sin instrucciones visibles, un
 * usuario de iPhone no tiene forma de encontrar ese camino solo.
 */
function detectarPlataforma(): 'ios' | 'android' | 'otro' {
  if (typeof navigator === 'undefined') return 'otro';
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'otro';
}

function esSafariIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

function SeccionDescargarApp() {
  const [plataforma] = useState(detectarPlataforma);
  const yaInstalada = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  if (yaInstalada) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
        <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
        <p className="text-emerald-300 text-sm font-semibold">Ya tienes la app instalada en este dispositivo.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-amber-400" />
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Descargar la app en este celular</span>
      </div>

      {plataforma === 'ios' ? (
        <div className="space-y-3">
          {!esSafariIOS() && (
            <p className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5">
              Abre este enlace en <b>Safari</b> — en iPhone, instalar solo funciona desde Safari (no desde Chrome ni otros navegadores).
            </p>
          )}
          <ol className="space-y-2.5">
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-slate-300 text-sm flex items-center gap-1.5 flex-wrap">
                Toca el ícono <Share className="w-4 h-4 text-sky-400 inline" /> <b>Compartir</b> en la barra inferior de Safari
              </p>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-slate-300 text-sm flex items-center gap-1.5 flex-wrap">
                Busca y toca <SquarePlus className="w-4 h-4 text-slate-400 inline" /> <b>Agregar a inicio</b> (puede estar más abajo en la lista)
              </p>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p className="text-slate-300 text-sm">Confirma tocando <b>Agregar</b> — el ícono de CODEC POS aparece en tu pantalla de inicio</p>
            </li>
          </ol>
        </div>
      ) : plataforma === 'android' ? (
        <div className="space-y-3">
          <ol className="space-y-2.5">
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-slate-300 text-sm flex items-center gap-1.5 flex-wrap">
                Toca <MoreVertical className="w-4 h-4 text-slate-400 inline" /> el menú de tres puntos, arriba a la derecha de Chrome
              </p>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-slate-300 text-sm">Toca <b>Instalar aplicación</b> (o "Agregar a pantalla de inicio")</p>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p className="text-slate-300 text-sm">Confirma — el ícono queda en tu pantalla de inicio como una app normal</p>
            </li>
          </ol>
          <p className="text-slate-500 text-xs">A veces Chrome te lo ofrece solo, con un aviso "Instalar app" abajo de la pantalla.</p>
        </div>
      ) : (
        <p className="text-slate-400 text-sm">
          Abre esta página desde el navegador de tu celular (Safari en iPhone, Chrome en Android) para ver los pasos de instalación.
        </p>
      )}
    </div>
  );
}
