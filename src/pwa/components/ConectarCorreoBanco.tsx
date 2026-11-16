/**
 * Codec Verify también lee el correo del banco (respaldo de las notificaciones).
 *
 * Muchas veces la app del banco no muestra la notificación, pero el banco sí
 * manda el correo de «Recibiste una transferencia». La app Android (1.4.0 en
 * adelante, LectorCorreo.kt) queda conectada al correo y recibe al instante los correos de
 * bancos y registra los pagos para desbloquear la venta que los espera.
 *
 * Un solo paso: si el negocio ya conectó su correo para enviar las facturas
 * electrónicas, Codec Verify toma ese mismo correo solo al abrir su app con un
 * administrador (conectarCodecVerifyConCorreoFacturas). También se puede poner
 * otro correo a mano.
 */
import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';

interface EstadoCorreo {
  activo: boolean;
  correo: string;
  servidor: string;
  remitentesExtra: string;
  tieneClave: boolean;
  ultimaRevision: number;
  ultimoError: string;
  ultimoPago: string;
}

interface PuenteCorreo {
  configurarCorreo?(correo: string, clave: string, servidor: string, remitentesExtra: string): void;
  desactivarCorreo?(): void;
  estadoCorreo?(): string;
}

const puente = (): PuenteCorreo | null =>
  typeof window !== 'undefined' && (window as any).AndroidCodecVerify ? (window as any).AndroidCodecVerify as PuenteCorreo : null;

function leerEstado(): EstadoCorreo | null {
  try {
    const crudo = puente()?.estadoCorreo?.();
    return crudo ? JSON.parse(crudo) as EstadoCorreo : null;
  } catch { return null; }
}

const haceCuanto = (ms: number) => {
  if (!ms) return 'todavía no';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return new Date(ms).toLocaleString('es-CO', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
};

export function ConectarCorreoBanco() {
  const p = puente();
  const soportado = !!p?.estadoCorreo;
  const [estado, setEstado] = useState<EstadoCorreo | null>(() => leerEstado());
  const [correo, setCorreo] = useState(estado?.correo || '');
  const [clave, setClave] = useState('');
  const [servidor, setServidor] = useState(estado?.servidor || '');
  const [extra, setExtra] = useState(estado?.remitentesExtra || '');
  const [editando, setEditando] = useState(!estado?.activo);
  const [probando, setProbando] = useState(false);

  // El estado lo actualiza la app cada vez que revisa el correo.
  useEffect(() => {
    if (!soportado) return;
    const t = window.setInterval(() => setEstado(leerEstado()), probando ? 1500 : 5000);
    return () => window.clearInterval(t);
  }, [soportado, probando]);

  // Resultado de la primera revisión después de guardar.
  useEffect(() => {
    if (!probando || !estado) return;
    if (estado.ultimoError) {
      setProbando(false); setEditando(true);
      toast.error('No se pudo conectar el correo', { description: estado.ultimoError });
    } else if (estado.ultimaRevision > 0) {
      setProbando(false); setEditando(false);
      toast.success('Correo conectado', { description: 'Codec Verify ya revisa los correos del banco.' });
    }
  }, [estado, probando]);

  if (!p) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4 text-sky-400" /><p className="text-sm font-bold text-white">Leer el correo del banco</p></div>
        <p className="text-xs text-slate-400">Se conecta desde la app Codec Verify en el celular Android del negocio: Configuración › Codec Verify › Leer el correo del banco.</p>
      </div>
    );
  }
  if (!soportado) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="text-sm font-bold text-amber-300">Leer el correo del banco</p>
        <p className="text-xs text-amber-200/80 mt-1">Actualiza Codec Verify a la versión 1.4.0 o más nueva para usar esta función.</p>
      </div>
    );
  }

  const guardar = () => {
    const c = correo.trim().toLowerCase();
    if (!c.includes('@')) { toast.error('Escribe el correo donde llegan los avisos del banco'); return; }
    if (!clave.trim() && !estado?.tieneClave) { toast.error('Escribe la clave de aplicación del correo'); return; }
    p.configurarCorreo?.(c, clave.trim(), servidor.trim(), extra.trim());
    setClave('');
    setProbando(true);
    setEstado(leerEstado());
  };

  const desconectar = () => {
    p.desactivarCorreo?.();
    setEstado(leerEstado());
    setEditando(true);
    toast.success('Correo desconectado', { description: 'La clave se borró de este celular.' });
  };

  const esGmail = /@(gmail|googlemail)\.com$/i.test(correo.trim());

  // Un solo paso: tomar el correo que ya se configuró para enviar las facturas electrónicas.
  const usarCorreoFacturas = async () => {
    setProbando(true);
    try {
      const { conectarCodecVerifyConCorreoFacturas } = await import('../../app/lib/dian/correoFacturas');
      const r = await conectarCodecVerifyConCorreoFacturas({ forzar: true });
      if (r === 'sin_correo') { setProbando(false); toast.info('Todavía no hay correo de facturas', { description: 'Configúralo en Facturación › Correo, o escribe aquí el correo y la clave.' }); return; }
      if (r !== 'conectado') setProbando(false);
      setEstado(leerEstado());
    } catch (e: any) {
      setProbando(false);
      toast.error('No se pudo usar el correo de facturas', { description: e?.message || 'Solo un administrador puede hacerlo.' });
    }
  };

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Mail className="w-5 h-5 text-sky-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-white">Leer el correo del banco</p>
          <p className="text-xs text-slate-400">Respaldo de las notificaciones: si la app del banco no avisa, el pago se confirma con el correo que manda el banco. Solo cuentan correos verificados de bancos y billeteras.</p>
        </div>
      </div>

      {estado?.activo && !editando ? (
        <div className="space-y-2">
          <div className={`rounded-lg p-3 text-xs ${estado.ultimoError ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
            <div className="flex items-center gap-2 font-bold">
              {estado.ultimoError ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              <span className={estado.ultimoError ? 'text-red-300' : 'text-emerald-300'}>{estado.correo}</span>
            </div>
            <p className="text-slate-400 mt-1">Conectado: los correos del banco llegan al instante · última señal {haceCuanto(estado.ultimaRevision)}</p>
            {estado.ultimoPago && <p className="text-slate-300 mt-0.5">Último pago por correo: {estado.ultimoPago}</p>}
            {estado.ultimoError && <p className="text-red-300 mt-1">{estado.ultimoError}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditando(true)} className="h-10 px-4 rounded-lg border border-slate-600 text-sm text-slate-200 font-semibold">Cambiar</button>
            <button onClick={desconectar} className="h-10 px-4 rounded-lg border border-red-500/50 text-sm text-red-300 font-semibold">Desconectar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={() => void usarCorreoFacturas()} disabled={probando}
            className="w-full h-11 rounded-lg bg-emerald-600 !text-[#fff] text-sm font-bold disabled:opacity-60">
            Usar el mismo correo de las facturas electrónicas
          </button>
          <p className="text-[11px] text-slate-500 text-center">o escribe otro correo:</p>
          <div>
            <Label className="text-slate-400 text-xs">Correo donde llegan los avisos del banco</Label>
            <Input type="email" inputMode="email" autoCapitalize="off" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="minegocio@gmail.com" className="mt-1.5 h-11" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs">Clave de aplicación (no es la clave normal del correo)</Label>
            <Input type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} placeholder={estado?.tieneClave ? 'Déjala vacía para conservar la actual' : 'abcd efgh ijkl mnop'} className="mt-1.5 h-11 font-mono" />
          </div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-3 text-xs text-slate-300 space-y-1">
            <p className="font-bold text-white">Cómo sacar la clave de aplicación en Gmail</p>
            <p>1. La cuenta debe tener la verificación en dos pasos activada.</p>
            <p>2. Entra a <span className="font-mono">myaccount.google.com/apppasswords</span>, escribe el nombre «Codec Verify» y toca Crear.</p>
            <p>3. Copia las 16 letras que salen y pégalas aquí.</p>
            {esGmail && (
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 font-semibold mt-1">
                Abrir claves de aplicación <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Opciones avanzadas</summary>
            <div className="mt-2 space-y-2">
              <div>
                <Label className="text-slate-400 text-xs">Servidor IMAP (vacío = automático)</Label>
                <Input value={servidor} onChange={(e) => setServidor(e.target.value)} placeholder="imap.gmail.com" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Otros remitentes a leer (separados por coma)</Label>
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="pagos@mipasarela.com, @otrobanco.com" className="mt-1 h-10" />
              </div>
            </div>
          </details>
          <div className="flex gap-2">
            <button onClick={guardar} disabled={probando} className="h-11 px-5 rounded-lg bg-sky-600 !text-[#fff] text-sm font-bold flex items-center gap-2 disabled:opacity-60">
              {probando ? <><Loader2 className="w-4 h-4 animate-spin" />Conectando…</> : 'Conectar correo'}
            </button>
            {estado?.activo && <button onClick={() => setEditando(false)} className="h-11 px-4 rounded-lg border border-slate-600 text-sm text-slate-300">Cancelar</button>}
          </div>
          <p className="text-[11px] text-slate-500">La clave queda cifrada solo en este celular y no se guarda en la nube. Codec Verify solo lee la bandeja de entrada: no marca, borra ni envía correos.</p>
        </div>
      )}
    </div>
  );
}
