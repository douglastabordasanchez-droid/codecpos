import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search, Plus, X, Loader2, Crown, Zap, Check } from 'lucide-react';
import { listarClientes, registrarAuditoria } from '../lib/adminApi';
import type { PlanCliente } from '../../app/lib/supabase/clientesAdminService';
import type { ModuloPOS } from '../../app/lib/permissions';
import { resumenVencimiento } from '../../app/lib/bloqueoLicencia';
import {
  MODULOS_DISPONIBLES, DURACIONES, FORM_VACIO, modulosPorPlan, crearNegocioDesdePanel, type FormNuevoNegocio,
} from '../../app/lib/altaNegocioAdmin';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

const ESTADOS = ['TODOS', 'ACTIVA', 'PRUEBA', 'VENCIDA', 'CANCELADA', 'SUSPENDIDA', 'PENDIENTE_PAGO'];

function diasRestantes(fechaFin: string | null | undefined): number | null {
  if (!fechaFin) return null;
  const ms = new Date(fechaFin).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500';
const labelCls = 'block text-xs text-slate-400 mb-1';

/**
 * Mismo formulario que el Panel Desarrollador del celular («Nuevo negocio»):
 * mismos campos y misma lógica (src/app/lib/altaNegocioAdmin.ts), así un
 * negocio queda igual sin importar desde dónde se cree.
 */
function NuevoClienteForm({ onCreado, onCancelar }: { onCreado: () => void; onCancelar: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormNuevoNegocio>(FORM_VACIO);
  const [modulos, setModulos] = useState<Set<ModuloPOS>>(() => new Set(modulosPorPlan('BASICO')));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campo = (k: Exclude<keyof FormNuevoNegocio, 'plan' | 'duracion'>) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const cambiarPlan = (plan: PlanCliente) => {
    setForm((f) => ({ ...f, plan }));
    setModulos(new Set(modulosPorPlan(plan)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const creado = await crearNegocioDesdePanel(form, Array.from(modulos));
      await registrarAuditoria('CREAR_CLIENTE', creado.id, 'EXITO', { usuario: creado.usuario, plan: form.plan, duracion: form.duracion }).catch(() => {});
      onCreado();
      navigate(`/clientes/${creado.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const boton = (activo: boolean) =>
    `h-10 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
      activo ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700'
    }`;

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/70 border border-slate-700 rounded-xl p-5 mb-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-slate-100">Nuevo negocio</h2>
        <button type="button" onClick={onCancelar} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={labelCls}>Nombre del negocio</label><input className={inputCls} {...campo('nombreNegocio')} /></div>
        <div><label className={labelCls}>NIT</label><input className={inputCls} {...campo('nit')} /></div>
        <div><label className={labelCls}>Teléfono</label><input className={inputCls} {...campo('telefono')} /></div>
        <div><label className={labelCls}>Contacto</label><input className={inputCls} {...campo('contacto')} /></div>
        <div><label className={labelCls}>Correo</label><input type="email" className={inputCls} {...campo('email')} /></div>
      </div>

      <div className="border-t border-slate-700 pt-4">
        <p className="text-purple-300 text-xs font-bold uppercase tracking-wide mb-3">Credencial única (Electron + celular)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Usuario</label><input autoComplete="off" className={inputCls} {...campo('usuario')} /></div>
          <div><label className={labelCls}>Contraseña</label><input autoComplete="new-password" className={inputCls} {...campo('contraseña')} /></div>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className={labelCls}>Plan</p>
          <div className="grid grid-cols-2 gap-2">
            {(['BASICO', 'PREMIUM'] as PlanCliente[]).map((p) => (
              <button key={p} type="button" onClick={() => cambiarPlan(p)} className={boton(form.plan === p)}>
                {p === 'PREMIUM' ? <Crown className="w-4 h-4" /> : <Zap className="w-4 h-4" />} {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={labelCls}>Duración</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DURACIONES.map((d) => (
              <button key={d.id} type="button" onClick={() => setForm((f) => ({ ...f, duracion: d.id }))} className={boton(form.duracion === d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Módulos ({modulos.size})</p>
          <button type="button" onClick={() => setModulos(new Set(modulosPorPlan(form.plan)))} className="text-purple-300 text-xs font-semibold">
            Restaurar por plan
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {MODULOS_DISPONIBLES.map((m) => {
            const activo = modulos.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModulos((prev) => {
                  const next = new Set(prev);
                  if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                  return next;
                })}
                className={`flex items-center gap-2 text-left px-2.5 py-2 rounded-lg border text-xs ${
                  activo ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300' : 'border-slate-800 text-slate-400'
                }`}
              >
                {activo ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />} {m.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm"
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        Crear negocio
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
      const q = busqueda.toLowerCase();
      const coincideBusqueda = c.nombre_negocio.toLowerCase().includes(q) || (c.usuario ?? '').toLowerCase().includes(q);
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
            placeholder="Buscar por negocio o usuario…"
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
                <p className="text-xs text-slate-400 mt-0.5">
                  {[c.usuario && `Usuario: ${c.usuario}`, c.email].filter(Boolean).join(' · ')}
                </p>
                {c.licencia_vigente?.estado === 'TRIAL' ? (
                  <p className="text-xs text-amber-400 mt-0.5">
                    En prueba · {diasRestantes(c.licencia_vigente.fecha_fin_periodo_actual)} días restantes
                  </p>
                ) : (() => {
                  const v = resumenVencimiento(c.estado, c.duracion, c.licencia_vigente?.fecha_fin_periodo_actual ?? c.fecha_expiracion);
                  return (
                    <p className={`text-xs mt-0.5 ${v.tono === 'vencida' ? 'text-red-400' : v.tono === 'aviso' ? 'text-amber-400' : 'text-slate-500'}`}>
                      {v.texto}
                    </p>
                  );
                })()}
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
