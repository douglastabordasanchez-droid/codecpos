import { useEffect, useState, FormEvent } from 'react';
import { Plus, X, Loader2, Tag } from 'lucide-react';
import { listarCodigosDescuento, crearCodigoDescuento, actualizarCodigoDescuento } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, SectionCard, LoadingState, ErrorState, EmptyState, formatoFecha } from '../components/ui';

const inputCls = 'w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500';

function NuevoCodigoForm({ onCreado, onCancelar }: { onCreado: () => void; onCancelar: () => void }) {
  const [form, setForm] = useState({ codigo: '', porcentaje: '10', descripcion: '', fechaExpiracion: '', usosMaximos: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await crearCodigoDescuento({
        codigo: form.codigo,
        porcentaje: Number(form.porcentaje),
        descripcion: form.descripcion || undefined,
        fechaExpiracion: form.fechaExpiracion ? new Date(form.fechaExpiracion).toISOString() : undefined,
        usosMaximos: form.usosMaximos ? Number(form.usosMaximos) : undefined,
      });
      onCreado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/70 border border-slate-700 rounded-xl p-5 mb-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-slate-100">Nuevo código de descuento</h2>
        <button type="button" onClick={onCancelar} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input required placeholder="Código (ej. BIENVENIDA20)" className={inputCls + ' uppercase'} {...campo('codigo')} />
        <input required type="number" min={1} max={100} step="0.01" placeholder="Porcentaje de descuento" className={inputCls} {...campo('porcentaje')} />
        <input placeholder="Descripción (opcional)" className={inputCls} {...campo('descripcion')} />
        <input type="date" placeholder="Fecha de expiración (opcional)" className={inputCls} {...campo('fechaExpiracion')} />
        <input type="number" min={1} placeholder="Usos máximos (opcional, ilimitado si se deja vacío)" className={inputCls} {...campo('usosMaximos')} />
      </div>
      {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm"
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        Crear código
      </button>
    </form>
  );
}

export function CodigosDescuentoPage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [items, setItems] = useState<Awaited<ReturnType<typeof listarCodigosDescuento>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = () => {
    listarCodigosDescuento().then(setItems).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const handleToggle = async (id: string, activoActual: boolean) => {
    setProcesando(id);
    try {
      await actualizarCodigoDescuento(id, { activo: !activoActual });
      cargar();
    } catch (e: any) {
      alert('No se pudo actualizar: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  if (error) return <><PageHeader title="Códigos de descuento" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader
        title="Códigos de descuento"
        subtitle="Se aplican al pagar un plan con Mercado Pago -- el porcentaje se valida y calcula siempre en el servidor"
        actions={!soloLectura && !mostrarForm ? (
          <button
            onClick={() => setMostrarForm(true)}
            className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg px-3 py-2"
          >
            <Plus className="w-4 h-4" /> Nuevo código
          </button>
        ) : undefined}
      />

      {mostrarForm && (
        <NuevoCodigoForm onCreado={() => { setMostrarForm(false); cargar(); }} onCancelar={() => setMostrarForm(false)} />
      )}

      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="No hay códigos de descuento creados todavía." />
      ) : (
        <div className="space-y-2">
          {items.map((c: any) => {
            const vencido = c.fecha_expiracion && new Date(c.fecha_expiracion) < new Date();
            const agotado = c.usos_maximos != null && c.usos_actuales >= c.usos_maximos;
            return (
              <SectionCard key={c.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="w-4 h-4 text-amber-400" />
                      <p className="font-mono font-bold text-white">{c.codigo}</p>
                      <span className="text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
                        -{c.porcentaje}%
                      </span>
                      {!c.activo && <span className="text-xs text-slate-400 bg-slate-700/40 border border-slate-700 rounded-full px-2 py-0.5">Inactivo</span>}
                      {vencido && <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">Vencido</span>}
                      {agotado && <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">Agotado</span>}
                    </div>
                    {c.descripcion && <p className="text-sm text-slate-300 mt-1">{c.descripcion}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      Usado {c.usos_actuales} {c.usos_maximos != null ? `/ ${c.usos_maximos}` : '(sin límite de usos)'}
                      {c.fecha_expiracion ? ` · Expira ${formatoFecha(c.fecha_expiracion)}` : ' · Sin fecha de expiración'}
                    </p>
                  </div>
                  {!soloLectura && (
                    <button
                      onClick={() => handleToggle(c.id, c.activo)}
                      disabled={procesando === c.id}
                      className={`shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 border disabled:opacity-50 ${
                        c.activo
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      }`}
                    >
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
