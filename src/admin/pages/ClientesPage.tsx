import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search, Plus, X, Loader2 } from 'lucide-react';
import { listarClientes, listarPlanesConPrecios, crearClienteBase, registrarLicencia } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

const ESTADOS = ['TODOS', 'ACTIVA', 'PRUEBA', 'VENCIDA', 'CANCELADA', 'SUSPENDIDA', 'PENDIENTE_PAGO'];
const MODALIDADES = ['MENSUAL', 'TRIMESTRAL', 'ANUAL', 'VITALICIA'];

function diasRestantes(fechaFin: string | null | undefined): number | null {
  if (!fechaFin) return null;
  const ms = new Date(fechaFin).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500';

function NuevoClienteForm({ onCreado, onCancelar }: { onCreado: () => void; onCancelar: () => void }) {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof listarPlanesConPrecios>> | null>(null);
  const [form, setForm] = useState({
    nombreNegocio: '', nombreCompleto: '', email: '', telefono: '', password: '',
    nit: '', ciudad: '', planCodigo: '', modalidad: 'MENSUAL',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarPlanesConPrecios().then((p) => {
      setPlanes(p);
      if (p.length > 0) setForm((f) => ({ ...f, planCodigo: p[0].plan_codigo }));
    }).catch(() => {});
  }, []);

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const clienteId = await crearClienteBase({
        nombreNegocio: form.nombreNegocio, nombreCompleto: form.nombreCompleto,
        email: form.email, telefono: form.telefono, password: form.password,
        nit: form.nit || undefined, ciudad: form.ciudad || undefined,
      });
      if (form.planCodigo) {
        await registrarLicencia({
          clienteId, planCodigo: form.planCodigo, modalidad: form.modalidad,
          motivo: 'Alta manual desde Admin Web',
        });
      }
      onCreado();
      navigate(`/clientes/${clienteId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/70 border border-slate-700 rounded-xl p-5 mb-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-slate-100">Nuevo cliente</h2>
        <button type="button" onClick={onCancelar} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input required placeholder="Nombre del negocio" className={inputCls} {...campo('nombreNegocio')} />
        <input required placeholder="Nombre del dueño" className={inputCls} {...campo('nombreCompleto')} />
        <input required type="email" placeholder="Correo (será el usuario de acceso)" className={inputCls} {...campo('email')} />
        <input required placeholder="Teléfono" className={inputCls} {...campo('telefono')} />
        <input required type="password" minLength={6} placeholder="Contraseña inicial (mín. 6)" className={inputCls} {...campo('password')} />
        <input placeholder="NIT (opcional)" className={inputCls} {...campo('nit')} />
        <input placeholder="Ciudad (opcional)" className={inputCls} {...campo('ciudad')} />
        <div className="flex gap-2">
          <select className={inputCls} {...campo('planCodigo')}>
            {(planes ?? []).map((p) => <option key={p.plan_codigo} value={p.plan_codigo}>{p.plan_nombre}</option>)}
          </select>
          <select className={inputCls} {...campo('modalidad')}>
            {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm"
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        Crear cliente
      </button>
    </form>
  );
}

export function ClientesPage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [clientes, setClientes] = useState<Awaited<ReturnType<typeof listarClientes>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = () => {
    listarClientes().then(setClientes).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    return clientes.filter((c) => {
      const coincideBusqueda = c.nombre_negocio.toLowerCase().includes(busqueda.toLowerCase());
      const coincideEstado = filtroEstado === 'TODOS' || c.estado === filtroEstado;
      return coincideBusqueda && coincideEstado;
    });
  }, [clientes, busqueda, filtroEstado]);

  if (error) return <><PageHeader title="Clientes" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={clientes ? `${clientes.length} en total` : undefined}
        actions={!soloLectura && !mostrarForm ? (
          <button
            onClick={() => setMostrarForm(true)}
            className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg px-3 py-2"
          >
            <Plus className="w-4 h-4" /> Nuevo cliente
          </button>
        ) : undefined}
      />

      {mostrarForm && (
        <NuevoClienteForm onCreado={() => { setMostrarForm(false); cargar(); }} onCancelar={() => setMostrarForm(false)} />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de negocio…"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
        >
          {ESTADOS.map((e) => <option key={e} value={e}>{e === 'TODOS' ? 'Todos los estados' : e}</option>)}
        </select>
      </div>

      {!clientes ? (
        <LoadingState />
      ) : filtrados.length === 0 ? (
        <EmptyState mensaje="No hay clientes que coincidan con la búsqueda." />
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              to={`/clientes/${c.id}`}
              className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-amber-500/50 transition-colors"
            >
              <div>
                <p className="font-medium">{c.nombre_negocio}</p>
                {c.email && <p className="text-xs text-slate-400 mt-0.5">{c.email}</p>}
                {c.licencia_vigente?.estado === 'TRIAL' && (
                  <p className="text-xs text-amber-400 mt-0.5">
                    En prueba · {diasRestantes(c.licencia_vigente.fecha_fin_periodo_actual)} días restantes
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <PlanBadge plan={c.plan} />
                <EstadoBadge estado={c.estado} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
