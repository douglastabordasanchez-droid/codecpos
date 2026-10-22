/**
 * Tarjeta «Correo para enviar facturas»: el negocio conecta su propio Gmail
 * (con contraseña de aplicación) u otro correo SMTP, y las facturas salen
 * desde allí con un clic, sin proveedor de correo pagado. La conexión se
 * prueba antes de guardarla; la clave queda cifrada en el servidor.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, Loader2, X, ExternalLink } from 'lucide-react';
import { eliminarCorreoNegocio, estadoCorreoNegocio, guardarCorreoNegocio, type EstadoCorreoNegocio } from '../../lib/dian/correoFacturas';

interface Props {
  soloLectura?: boolean;
  /** Avisa al resto del módulo (botón Enviar de las facturas). */
  onCambio?: (estado: EstadoCorreoNegocio) => void;
}

const PROVEEDORES = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'hostinger', label: 'Hostinger' },
  { id: 'zoho', label: 'Zoho' },
  { id: 'otro', label: 'Otro (SMTP)' },
];

export function ConfiguracionCorreo({ soloLectura, onCambio }: Props) {
  const [estado, setEstado] = useState<EstadoCorreoNegocio | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ proveedor: 'gmail', usuario: '', clave: '', remitenteNombre: '', servidor: '', puerto: '465' });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => estadoCorreoNegocio()
    .then((e) => { setEstado(e); onCambio?.(e); })
    .catch(() => setEstado({ configurado: false }));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir() {
    setForm({
      proveedor: estado?.proveedor || 'gmail',
      usuario: estado?.usuario || '',
      clave: '',
      remitenteNombre: estado?.remitenteNombre || '',
      servidor: estado?.proveedor === 'otro' ? estado.servidor || '' : '',
      puerto: String(estado?.puerto || 465),
    });
    setAbierto(true);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await guardarCorreoNegocio({
        proveedor: form.proveedor,
        usuario: form.usuario,
        clave: form.clave,
        remitenteNombre: form.remitenteNombre,
        servidor: form.servidor || undefined,
        puerto: Number(form.puerto) || 465,
      });
      toast.success('Correo conectado', { description: 'Ya puedes enviar las facturas al cliente con un clic.' });
      setAbierto(false);
      await cargar();
    } catch (e: any) {
      toast.error('No se pudo conectar el correo', { description: e?.message, duration: 12000 });
    } finally {
      setGuardando(false);
    }
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar el correo? Las facturas se volverán a enviar abriendo tu programa de correo.')) return;
    try {
      await eliminarCorreoNegocio();
      setAbierto(false);
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo desconectar');
    }
  }

  const campo = 'w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';
  const conectado = !!estado?.configurado;

  return (
    <>
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${conectado ? 'bg-emerald-500/15' : 'bg-slate-800'}`}>
          <Mail className={`w-4 h-4 ${conectado ? 'text-emerald-400' : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-bold">Correo para enviar facturas</p>
          <p className="text-slate-400 text-xs">
            {estado === null
              ? 'Revisando...'
              : conectado
              ? `Sale desde ${estado.usuario}. Hoy van ${estado.enviadosHoy || 0} de ${estado.maximoDiario || 450}.`
              : 'Sin conectar: el botón Enviar abre tu programa de correo y hay que adjuntar a mano.'}
          </p>
        </div>
        {!soloLectura && (
          <button onClick={abrir} className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">
            {conectado ? 'Cambiar' : 'Conectar correo'}
          </button>
        )}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p className="font-bold text-white">Correo para enviar facturas</p>
              <button onClick={() => setAbierto(false)} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-slate-400 text-xs">
              Las facturas salen desde el correo del negocio, sin costo. Gmail permite unos 500 envíos al día por cuenta.
            </p>

            <div className="flex flex-wrap gap-2">
              {PROVEEDORES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setForm({ ...form, proveedor: p.id })}
                  className={`h-9 px-3 rounded-lg text-xs font-bold ${form.proveedor === p.id ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {form.proveedor === 'gmail' && (
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-1.5 text-xs text-slate-400">
                <p className="text-white font-bold">Cómo sacar la contraseña de aplicación de Gmail</p>
                <p>1. Entra a tu cuenta de Google y activa la verificación en dos pasos (si no la tienes).</p>
                <p>2. Abre «Contraseñas de aplicaciones», escribe un nombre como Codec Pos y pulsa Crear.</p>
                <p>3. Copia las 16 letras que te muestra y pégalas abajo. Tu clave normal de Gmail no sirve aquí.</p>
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                  Abrir contraseñas de aplicaciones <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <label className="block text-xs text-slate-400 space-y-1">
              <span>Correo del negocio</span>
              <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} type="email" autoCapitalize="none" placeholder="negocio@gmail.com" className={campo} />
            </label>
            <label className="block text-xs text-slate-400 space-y-1">
              <span>{form.proveedor === 'gmail' ? 'Contraseña de aplicación (16 letras)' : 'Contraseña del correo'}</span>
              <input value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} type="password" autoComplete="new-password" placeholder={conectado ? 'Escríbela de nuevo para cambiarla' : ''} className={campo} />
            </label>
            <label className="block text-xs text-slate-400 space-y-1">
              <span>Nombre que ve el cliente (opcional)</span>
              <input value={form.remitenteNombre} onChange={(e) => setForm({ ...form, remitenteNombre: e.target.value })} placeholder="Distribuciones BM" className={campo} />
            </label>
            {form.proveedor === 'otro' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 text-xs text-slate-400 space-y-1">
                  <span>Servidor SMTP</span>
                  <input value={form.servidor} onChange={(e) => setForm({ ...form, servidor: e.target.value })} placeholder="mail.midominio.com" className={campo} />
                </label>
                <label className="text-xs text-slate-400 space-y-1">
                  <span>Puerto (SSL)</span>
                  <input value={form.puerto} onChange={(e) => setForm({ ...form, puerto: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={campo} />
                </label>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {conectado && (
                <button onClick={desconectar} className="h-10 px-4 rounded-lg bg-slate-800 text-red-400 text-sm font-semibold mr-auto">Desconectar</button>
              )}
              <button onClick={() => setAbierto(false)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !form.usuario.trim() || !form.clave.trim()} className="h-10 px-4 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Probar y guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
