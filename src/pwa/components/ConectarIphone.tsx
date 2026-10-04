/**
 * Guía para que un iPhone detecte pagos para Codec Verify.
 *
 * Apple no deja que una app lea las notificaciones de otras apps (Nequi,
 * Bancolombia...). Lo que sí permite es una automatización de la app Atajos
 * que corre al llegar un SMS o un correo del banco y envía su texto a la
 * dirección del negocio (Edge Function codec-verify-entrada). El pago queda
 * registrado y lo ven al instante Electron, la web y la app.
 */
import { useState } from 'react';
import { Apple, Copy, Check, Loader2, MessageSquare, Mail, ShieldCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabasePublicConfig } from '../../app/lib/supabase/config';

type Via = 'notificacion' | 'sms' | 'correo';
const BANCOS: Array<[string, string]> = [['nequi', 'Nequi'], ['bancolombia', 'Bancolombia'], ['daviplata', 'Daviplata'], ['davivienda', 'Davivienda'], ['bre_b', 'Otro banco (Bre-B)']];

export function urlEntradaIphone(token: string) {
  const base = (getSupabasePublicConfig()?.url || 'https://ophsckohhjajcsqniqvw.supabase.co').replace(/\/$/, '');
  return `${base}/functions/v1/codec-verify-entrada?t=${encodeURIComponent(token)}`;
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{n}</span>
      <span className="text-slate-300 text-xs leading-relaxed">{children}</span>
    </li>
  );
}

export function ConectarIphone({ token }: { token: string }) {
  const [via, setVia] = useState<Via>('notificacion');
  const [banco, setBanco] = useState('nequi');
  const [copiado, setCopiado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  // Por notificación se crea una automatización por app, y el enlace lleva el banco (la notificación no siempre lo nombra).
  const url = via === 'notificacion' ? `${urlEntradaIphone(token)}&e=${banco}` : urlEntradaIphone(token);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success('Enlace copiado. Pégalo en la automatización de Atajos.');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('No se pudo copiar; mantén presionado el enlace para copiarlo.');
    }
  };

  const probar = async () => {
    setProbando(true);
    setResultado(null);
    try {
      const r = await fetch(`${url}&prueba=1`, { method: 'POST' });
      const j = await r.json();
      setResultado({ ok: !!j.ok, mensaje: j.mensaje || (j.ok ? 'Conexión correcta' : 'No se pudo conectar') });
    } catch {
      setResultado({ ok: false, mensaje: 'Sin conexión. Revisa el internet y vuelve a probar.' });
    }
    setProbando(false);
  };

  return (
    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 space-y-3">
      <div>
        <p className="text-white text-sm font-bold flex items-center gap-2"><Apple className="w-4 h-4" /> Detectar pagos desde un iPhone</p>
        <p className="text-slate-500 text-xs mt-1">
          Con <b>iOS 27</b> la app <b>Atajos</b> del iPhone puede reenviar sola la notificación de pago de Nequi, Bancolombia o
          Daviplata. En iPhones sin iOS 27 se puede usar el <b>SMS</b> o el <b>correo</b> que manda el banco. Se configura una sola vez.
        </p>
      </div>

      <div>
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wide mb-1.5">Enlace de tu negocio</p>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center font-mono text-[11px] text-slate-300 overflow-hidden">
            <span className="truncate">{url.replace(token, `${token.slice(0, 6)}…`)}</span>
          </div>
          <button onClick={copiar} className="h-11 px-3 rounded-lg bg-emerald-600 text-xs font-bold flex items-center gap-1.5 shrink-0" style={{ color: '#ffffff' }}>
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="text-slate-600 text-[11px] mt-1">Es privado como el token: no lo compartas fuera de tu equipo.</p>
      </div>

      <div className="flex gap-2">
        {([['notificacion', 'Notificación (iOS 27)', Bell], ['sms', 'SMS', MessageSquare], ['correo', 'Correo', Mail]] as const).map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setVia(id)}
            className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${via === id ? 'bg-slate-800 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}
          >
            <Icono className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {via === 'notificacion' && (
        <div className="flex flex-wrap gap-1.5">
          {BANCOS.map(([id, nombre]) => (
            <button key={id} onClick={() => setBanco(id)}
              className={`h-8 px-3 rounded-full text-xs font-semibold ${banco === id ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
              {nombre}
            </button>
          ))}
          <p className="w-full text-slate-500 text-[11px]">
            Elige el banco: el enlace de arriba cambia para esa app. Haz una automatización por cada app que uses. Los pagos que digan
            Bre-B se registran como Bre-B, lleguen por la app que lleguen.
          </p>
        </div>
      )}

      <ol className="space-y-2">
        <Paso n={1}>Copia el enlace de arriba y abre la app <b>Atajos</b> en el iPhone.</Paso>
        <Paso n={2}>Ve a la pestaña <b>Automatización</b> y toca <b>+</b> para crear una nueva.</Paso>
        {via === 'notificacion' ? (
          <Paso n={3}>
            Elige <b>Notificación</b> y como app elige {banco === 'bre_b'
              ? <>la del banco por donde te llegan los pagos <b>Bre-B</b> (Nu, Davivienda, Banco de Bogotá, BBVA...)</>
              : <b>{BANCOS.find(([id]) => id === banco)?.[1]}</b>}. Si quieres, en
            <b> El mensaje contiene</b> pon una palabra del aviso de pago (por ejemplo <b>Recibiste</b> o <b>te envió</b>).
          </Paso>
        ) : via === 'sms' ? (
          <Paso n={3}>
            Elige <b>Mensaje</b>. En <b>El mensaje contiene</b> escribe una palabra que siempre traiga el aviso de pago del banco
            (por ejemplo <b>Recibiste</b> o <b>transferencia</b>), o en <b>Remitente</b> elige el número del banco.
          </Paso>
        ) : (
          <Paso n={3}>
            Elige <b>Correo</b>. En <b>Remitente</b> pon el correo con el que el banco te avisa los pagos y, si quieres, en
            <b> El asunto contiene</b> una palabra como <b>Recibiste</b>.
          </Paso>
        )}
        <Paso n={4}>Marca <b>Ejecutar inmediatamente</b> y apaga <b>Notificar al ejecutar</b>. Toca <b>Siguiente</b> y luego <b>Nueva automatización en blanco</b>.</Paso>
        <Paso n={5}>Agrega la acción <b>Obtener contenido de URL</b> y pega el enlace en el campo de la URL.</Paso>
        {via === 'notificacion' ? (
          <Paso n={6}>
            Toca la flecha de la acción: <b>Método</b> POST, <b>Cuerpo de la solicitud</b> Formulario. Agrega dos campos de texto:
            <b> titulo</b> con la variable <b>Notificación › Título</b>, y <b>texto</b> con <b>Notificación › Mensaje</b>.
          </Paso>
        ) : (
          <Paso n={6}>
            Toca la flecha de la acción: <b>Método</b> POST, <b>Cuerpo de la solicitud</b> Formulario. Agrega un campo de texto con la clave
            <b> texto</b> y como valor elige la variable <b>{via === 'sms' ? 'Mensaje' : 'Correo'}</b> y luego su <b>Contenido</b>.
          </Paso>
        )}
        <Paso n={7}>Toca <b>OK</b>. Desde ahora, cada aviso de pago del banco llega solo a Codec Verify y suena en Electron, la web y la app.</Paso>
      </ol>

      <button onClick={probar} disabled={probando} className="w-full h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Probar el enlace
      </button>
      {resultado && (
        <p className={`text-xs rounded-lg px-3 py-2 ${resultado.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{resultado.mensaje}</p>
      )}
      <p className="text-slate-600 text-[11px]">
        Configura una sola vía por banco (notificación, SMS o correo) para que un mismo pago no llegue dos veces. Los movimientos que tú haces
        (transferiste, pagaste) se ignoran solos.
      </p>
    </div>
  );
}
