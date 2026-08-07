import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Store, Save, Loader2, Layers, Crown, Zap, ShieldCheck, Eye, EyeOff, Copy, Check, RefreshCw, ChevronDown, Mail, Smartphone } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient, getSupabasePublicConfig } from '../../app/lib/supabase/config';
import { MODULOS_CATALOGO } from '../../app/lib/permissions';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';

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
  const [copiado, setCopiado] = useState<'token' | 'url' | 'script' | null>(null);
  const [mostrarGuia, setMostrarGuia] = useState(false);

  const puedeVer = empleado && ['admin', 'super_usuario'].includes(empleado.rol);

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
    const { error } = await client!
      .from('clientes_pos')
      .update({
        nombre_negocio: form.nombre_negocio,
        nit: form.nit,
        contacto: form.contacto,
        telefono: form.telefono,
        email: form.email,
      })
      .eq('id', empleado.cliente_id);
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

  const copiarTexto = (texto: string, cual: 'token' | 'url' | 'script') => {
    navigator.clipboard.writeText(texto);
    setCopiado(cual);
    setTimeout(() => setCopiado(null), 2000);
  };

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
                          <li>Abre <span className="text-slate-300">script.google.com</span> con el Gmail donde llegan los correos de Nequi</li>
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

                      <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Smartphone className="w-4 h-4 text-emerald-400" />
                          <p className="text-white text-sm font-semibold">Por SMS (Tasker / MacroDroid)</p>
                        </div>
                        <ol className="text-slate-400 text-xs space-y-1 list-decimal list-inside">
                          <li>Instala Tasker o MacroDroid en el celular donde llegan los SMS de pago</li>
                          <li>Crea una automatización: "Cuando llegue un SMS que contenga 'Nequi'"</li>
                          <li>Acción: HTTP Request POST a la URL de arriba, header <span className="text-slate-300 font-mono">apikey</span> con la anon key del proyecto</li>
                          <li>Cuerpo JSON: <span className="text-slate-300 font-mono">{'{"p_token":"...","p_monto":<extraído del SMS>,"p_entidad":"nequi"}'}</span></li>
                        </ol>
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
