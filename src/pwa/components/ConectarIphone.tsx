/**
 * Asistente para que un iPhone detecte pagos para Codec Verify.
 *
 * Apple no deja que una app (ni una web) lea las notificaciones de otras apps
 * (Nequi, Bancolombia...). Lo que sí permite es una automatización de la app
 * Atajos que corre al llegar la notificación, el SMS o el correo del banco y
 * envía su texto a la dirección del negocio (Edge Function
 * codec-verify-entrada). El pago queda registrado y suena en la caja, la web
 * y la app. La automatización la tiene que crear la persona (Apple no deja
 * crearla desde afuera): este asistente la guía paso a paso, uno a la vez.
 */
import { useEffect, useState } from 'react';
import { Apple, Copy, Check, Loader2, MessageSquare, Mail, ShieldCheck, Bell, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabasePublicConfig } from '../../app/lib/supabase/config';

type Via = 'notificacion' | 'sms' | 'correo';
const BANCOS: Array<[string, string]> = [['nequi', 'Nequi'], ['bancolombia', 'Bancolombia'], ['daviplata', 'Daviplata'], ['davivienda', 'Davivienda'], ['bre_b', 'Otro banco (Bre-B)']];

export function urlEntradaIphone(token: string) {
  const base = (getSupabasePublicConfig()?.url || 'https://ophsckohhjajcsqniqvw.supabase.co').replace(/\/$/, '');
  return `${base}/functions/v1/codec-verify-entrada?t=${encodeURIComponent(token)}`;
}

function Grande({ children }: { children: React.ReactNode }) {
  return <p className="text-white text-base leading-relaxed">{children}</p>;
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-400 text-xs leading-relaxed">{children}</p>;
}

/** Palabra en pantalla del iPhone, resaltada para encontrarla fácil. */
function Boton({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-1.5 rounded-md bg-sky-500/20 text-sky-300 font-bold">{children}</span>;
}

// El asistente se usa saltando entre la web y Atajos: si iOS recarga la
// pestaña al volver, se retoma en el mismo paso.
const CLAVE_ASISTENTE = 'codecpos-asistente-iphone';
function leerAsistente(): { via?: Via; banco?: string; paso?: number } {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_ASISTENTE) || '{}') || {}; } catch { return {}; }
}

export function ConectarIphone({ token }: { token: string }) {
  const guardado = leerAsistente();
  const [via, setVia] = useState<Via>(guardado.via || 'notificacion');
  const [banco, setBanco] = useState(guardado.banco || 'nequi');
  const [paso, setPaso] = useState(typeof guardado.paso === 'number' ? guardado.paso : 0);
  useEffect(() => {
    try { sessionStorage.setItem(CLAVE_ASISTENTE, JSON.stringify({ via, banco, paso })); } catch { /* sin sessionStorage */ }
  }, [via, banco, paso]);
  const [copiado, setCopiado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  // Por notificación se crea una automatización por app, y el enlace lleva el banco (la notificación no siempre lo nombra).
  const url = via === 'notificacion' ? `${urlEntradaIphone(token)}&e=${banco}` : urlEntradaIphone(token);
  const nombreBanco = BANCOS.find(([id]) => id === banco)?.[1] || 'tu banco';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success('Enlace copiado');
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

  const pasos: Array<{ titulo: string; cuerpo: React.ReactNode }> = [
    {
      titulo: '¿Cómo te avisa el banco?',
      cuerpo: (
        <div className="space-y-3">
          <Nota>Elige por dónde te llega el aviso de que entró plata. Si usas Nequi, elige Notificación.</Nota>
          <div className="grid grid-cols-3 gap-2">
            {([['notificacion', 'Notificación', Bell], ['sms', 'Mensaje SMS', MessageSquare], ['correo', 'Correo', Mail]] as const).map(([id, label, Icono]) => (
              <button key={id} onClick={() => setVia(id)}
                className={`h-20 rounded-2xl text-sm font-bold flex flex-col items-center justify-center gap-1.5 border-2 ${via === id ? 'bg-emerald-600 border-emerald-600 text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                <Icono className="w-6 h-6" />{label}
              </button>
            ))}
          </div>
          {via === 'notificacion' && (
            <>
              <Nota>¿De qué app? (si usas varias, repites esto una vez por cada una)</Nota>
              <div className="flex flex-wrap gap-2">
                {BANCOS.map(([id, nombre]) => (
                  <button key={id} onClick={() => setBanco(id)}
                    className={`h-10 px-4 rounded-full text-sm font-bold border-2 ${banco === id ? 'bg-emerald-600 border-emerald-600 text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                    {nombre}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      titulo: 'Copia el enlace de tu negocio',
      cuerpo: (
        <div className="space-y-3">
          <Grande>Toca el botón verde. El enlace queda copiado para pegarlo en un momento.</Grande>
          <button onClick={copiar} className="w-full h-16 rounded-2xl bg-emerald-600 text-lg font-black flex items-center justify-center gap-2" style={{ color: '#ffffff' }}>
            {copiado ? <Check className="w-6 h-6" /> : <Copy className="w-6 h-6" />} {copiado ? 'Copiado' : 'Copiar enlace'}
          </button>
          <Nota>Es privado: no lo compartas fuera de tu negocio.</Nota>
        </div>
      ),
    },
    {
      titulo: 'Abre Atajos y crea la automatización',
      cuerpo: (
        <div className="space-y-3">
          <a href="shortcuts://" className="w-full h-14 rounded-2xl bg-sky-600 text-base font-black flex items-center justify-center gap-2" style={{ color: '#ffffff' }}>
            <ExternalLink className="w-5 h-5" /> Abrir Atajos
          </a>
          <Grande>Abajo toca <Boton>Automatización</Boton> y luego el <Boton>+</Boton> de arriba.</Grande>
          {via === 'notificacion' ? (
            <>
              <Grande>Busca y toca <Boton>Notificación</Boton> (la de la campanita). En <Boton>App</Boton> elige <b>{banco === 'bre_b' ? 'la app de tu banco' : nombreBanco}</b>.</Grande>
              <p className="text-amber-300 text-sm leading-relaxed">
                No elijas <b>App</b> («Cuando se abra…»): esa corre al abrir {banco === 'bre_b' ? 'la app' : nombreBanco}, no cuando llega la plata.
                Si ya creaste una así, en Automatización deslízala a la izquierda y toca <b>Eliminar</b>.
                Si no ves <b>Notificación</b>, el iPhone necesita iOS 27: Ajustes › General › Actualización de software.
              </p>
            </>
          ) : via === 'sms' ? (
            <Grande>Busca y toca <Boton>Mensaje</Boton>. En <Boton>El mensaje contiene</Boton> escribe <b>Recibiste</b>.</Grande>
          ) : (
            <Grande>Busca y toca <Boton>Correo</Boton>. En <Boton>Remitente</Boton> pon el correo con el que te avisa el banco.</Grande>
          )}
          <Grande>Marca <Boton>Ejecutar inmediatamente</Boton> y toca <Boton>Siguiente</Boton>.</Grande>
        </div>
      ),
    },
    {
      titulo: 'Pega el enlace',
      cuerpo: (
        <div className="space-y-3">
          <Grande>Toca <Boton>Crear nuevo atajo</Boton> (en otras versiones dice <Boton>Nueva automatización en blanco</Boton>).</Grande>
          <Grande>En el buscador de abajo escribe <b>URL</b> y toca <Boton>Obtener contenido de URL</Boton>.</Grande>
          <Grande>Toca donde dice <Boton>URL</Boton>, mantén presionado y elige <Boton>Pegar</Boton>.</Grande>
          <button onClick={copiar} className="w-full h-11 rounded-xl bg-slate-800 text-sm font-bold flex items-center justify-center gap-2 text-white">
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copiar el enlace otra vez
          </button>
        </div>
      ),
    },
    {
      titulo: 'Que envíe el aviso del banco',
      cuerpo: (
        <div className="space-y-3">
          <Grande>Toca la flechita <Boton>›</Boton> de esa acción.</Grande>
          <Grande>En <Boton>Método</Boton> elige <b>POST</b>. En <Boton>Cuerpo de la solicitud</Boton> elige <b>Formulario</b>.</Grande>
          {via === 'notificacion' ? (
            <Grande>Toca <Boton>Agregar campo</Boton> › <b>Texto</b>. Clave: <b>texto</b>. Valor: toca y elige la variable <Boton>Notificación</Boton> (si no sale, <Boton>Entrada del atajo</Boton>).</Grande>
          ) : (
            <Grande>Toca <Boton>Agregar campo</Boton> › <b>Texto</b>. Clave: <b>texto</b>. Valor: toca y elige la variable <Boton>{via === 'sms' ? 'Mensaje' : 'Correo'}</Boton>.</Grande>
          )}
          <Grande>Toca el <Boton>✓</Boton> azul de arriba. Listo.</Grande>
        </div>
      ),
    },
    {
      titulo: 'Prueba que quedó conectado',
      cuerpo: (
        <div className="space-y-3">
          <Grande>Toca el botón para revisar que el enlace funciona.</Grande>
          <button onClick={probar} disabled={probando} className="w-full h-14 rounded-2xl bg-emerald-600 text-base font-black flex items-center justify-center gap-2 disabled:opacity-60" style={{ color: '#ffffff' }}>
            {probando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} Probar conexión
          </button>
          {resultado && (
            <p className={`text-sm rounded-xl px-3 py-2 ${resultado.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{resultado.mensaje}</p>
          )}
          <Nota>
            La prueba de verdad: pide que te envíen $50. Debe sonar en la caja. Los movimientos que tú haces (transferiste, pagaste) se
            ignoran solos. Usa una sola vía por banco para que un pago no llegue dos veces.
          </Nota>
        </div>
      ),
    },
  ];

  const actual = pasos[paso];
  return (
    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Apple className="w-5 h-5 text-white" />
        <p className="text-white text-sm font-bold flex-1">Conectar un iPhone</p>
        <span className="text-slate-500 text-xs font-bold">Paso {paso + 1} de {pasos.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${((paso + 1) / pasos.length) * 100}%` }} />
      </div>

      <div className="space-y-3 min-h-[220px]">
        <p className="text-white text-lg font-black">{actual.titulo}</p>
        {actual.cuerpo}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}
          className="h-12 px-4 rounded-xl bg-slate-800 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-30">
          <ChevronLeft className="w-4 h-4" /> Atrás
        </button>
        {paso < pasos.length - 1 ? (
          <button onClick={() => setPaso((p) => Math.min(pasos.length - 1, p + 1))}
            className="flex-1 h-12 rounded-xl bg-amber-500 text-slate-950 text-base font-black flex items-center justify-center gap-1">
            Siguiente <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={() => setPaso(0)} className="flex-1 h-12 rounded-xl bg-slate-800 text-white text-sm font-bold">
            Conectar otro banco
          </button>
        )}
      </div>
      <Nota>Apple no deja que ninguna app lea las notificaciones del banco por su cuenta: por eso se hace con Atajos, una sola vez.</Nota>
    </div>
  );
}
