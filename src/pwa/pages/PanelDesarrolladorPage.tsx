import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import { Search, X, Gift, Power, Loader2, ShieldAlert, Crown, Zap, Smartphone, Plus } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { RingStat } from '../components/RingStat';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import {
  listarClientesAdmin,
  crearClienteAdmin,
  actualizarClienteAdmin,
  actualizarModulosClienteAdmin,
  activarPruebaGratisAdmin,
  cambiarEstadoClienteAdmin,
  crearAccesoMovilDueno,
  ClienteAdmin,
  PlanCliente,
  DuracionCliente,
} from '../../app/lib/supabase/clientesAdminService';
import { MODULOS_CATALOGO, ModuloPOS } from '../../app/lib/permissions';

// 🛡️ FIX: antes se filtraba contra MODULOS_CLIENTE_OFICIALES, una lista
// separada que se quedó desactualizada y le faltaban 8 módulos reales que sí
// se venden (Clientes, Reportes Avanzados, Backup y Restauración, Exportar
// Datos, Impresora Térmica, Margen Automático, Facturación DIAN, Integración
// Siigo) — no había forma de activárselos a un cliente que los compró, así
// que este panel siempre se veía "incompleto" frente al catálogo real. Ahora
// usa el mismo filtro que ya funciona en Configuración (Electron): todo el
// catálogo excepto lo exclusivo de desarrollador.
const MODULOS_DISPONIBLES = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador');

const DURACIONES: { id: DuracionCliente; label: string }[] = [
  { id: '1_MES', label: '1 mes' },
  { id: '3_MESES', label: '3 meses' },
  { id: '1_ANO', label: '1 año' },
  { id: 'VITALICIA', label: 'Vitalicia' },
];

const FORM_VACIO = {
  nombreNegocio: '', nit: '', contacto: '', telefono: '', email: '',
  usuario: '', contraseña: '', plan: 'BASICO' as PlanCliente, duracion: '1_ANO' as DuracionCliente,
};

function modulosPorPlan(plan: PlanCliente): ModuloPOS[] {
  return MODULOS_DISPONIBLES
    .filter((m) => (plan === 'PREMIUM' ? true : m.planRequerido === 'basico'))
    .map((m) => m.id);
}

function calcularExpiracion(duracion: DuracionCliente): string | undefined {
  if (duracion === 'VITALICIA') return undefined;
  const dias = duracion === '1_MES' ? 30 : duracion === '3_MESES' ? 90 : 365;
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

function diasRestantes(cliente: ClienteAdmin): number | null {
  if (cliente.duracion === 'VITALICIA' || !cliente.fechaExpiracion) return null;
  return Math.max(0, Math.ceil((new Date(cliente.fechaExpiracion).getTime() - Date.now()) / 86_400_000));
}

export default function PanelDesarrolladorPage() {
  const { empleado } = usePwaAuth();
  const [clientes, setClientes] = useState<ClienteAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<ClienteAdmin | null>(null);
  const [modulosSel, setModulosSel] = useState<Set<ModuloPOS>>(new Set());
  const [guardando, setGuardando] = useState(false);

  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const lista = await listarClientesAdmin();
      setClientes(lista);
    } catch (e) {
      toast.error('No se pudieron cargar los negocios', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (empleado?.es_staff_codec) cargar();
  }, [empleado?.es_staff_codec]);

  const stats = useMemo(() => {
    const total = clientes.length;
    const activos = clientes.filter((c) => c.estado === 'ACTIVA').length;
    const premium = clientes.filter((c) => c.plan === 'PREMIUM').length;
    const enPrueba = clientes.filter((c) => c.enPrueba).length;
    return {
      total,
      activos,
      activosPct: total ? (activos / total) * 100 : 0,
      premiumPct: total ? (premium / total) * 100 : 0,
      enPrueba,
      enPruebaPct: total ? (enPrueba / total) * 100 : 0,
    };
  }, [clientes]);

  const filtrados = clientes.filter((c) =>
    c.nombreNegocio.toLowerCase().includes(busqueda.toLowerCase()) || c.usuario.toLowerCase().includes(busqueda.toLowerCase())
  );

  const abrirDetalle = (c: ClienteAdmin) => {
    setSeleccionado(c);
    setModulosSel(new Set((c.modulosActivos as ModuloPOS[] | null) || []));
  };

  const abrirCrear = () => {
    setFormNuevo(FORM_VACIO);
    setModulosSel(new Set(modulosPorPlan('BASICO')));
    setErrorCrear(null);
    setMostrarCrear(true);
  };

  const cambiarPlanNuevo = (plan: PlanCliente) => {
    setFormNuevo((f) => ({ ...f, plan }));
    setModulosSel(new Set(modulosPorPlan(plan)));
  };

  const crearCliente = async () => {
    if (!formNuevo.nombreNegocio.trim()) { setErrorCrear('El nombre del negocio es obligatorio'); return; }
    if (!formNuevo.usuario.trim() || formNuevo.usuario.length < 4) { setErrorCrear('El usuario debe tener al menos 4 caracteres'); return; }
    if (!formNuevo.contraseña.trim() || formNuevo.contraseña.length < 6) { setErrorCrear('La contraseña debe tener al menos 6 caracteres'); return; }
    if (clientes.some((c) => c.usuario === formNuevo.usuario)) { setErrorCrear('Ese usuario ya existe'); return; }

    setGuardando(true);
    setErrorCrear(null);
    try {
      await crearClienteAdmin({
        ...formNuevo,
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: calcularExpiracion(formNuevo.duracion),
        estado: 'ACTIVA',
        enPrueba: false,
        diasPruebaRestantes: 0,
        modulosActivos: Array.from(modulosSel),
      });
      toast.success(`${formNuevo.nombreNegocio} creado`, {
        description: `Ya puede entrar a Electron y a la app con el usuario "${formNuevo.usuario}" y la misma contraseña.`,
      });
      setMostrarCrear(false);
      cargar();
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear el negocio');
    } finally {
      setGuardando(false);
    }
  };

  const toggleEstado = async (c: ClienteAdmin) => {
    setGuardando(true);
    try {
      if (c.estado === 'ACTIVA') {
        await cambiarEstadoClienteAdmin(c.id, 'SUSPENDIDA');
        toast.info(`${c.nombreNegocio} suspendido`);
      } else {
        const nuevaFecha = c.duracion === 'VITALICIA' ? undefined : new Date(Date.now() + 365 * 86_400_000).toISOString();
        await cambiarEstadoClienteAdmin(c.id, 'ACTIVA', new Date().toISOString(), nuevaFecha);
        toast.success(`${c.nombreNegocio} reactivado`);
      }
      setSeleccionado(null);
      cargar();
    } catch (e) {
      toast.error('No se pudo cambiar el estado', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const activarPruebaGratis = async (c: ClienteAdmin) => {
    setGuardando(true);
    try {
      await activarPruebaGratisAdmin(c.id);
      toast.success(`Prueba gratis de 14 días activada para ${c.nombreNegocio}`);
      setSeleccionado(null);
      cargar();
    } catch (e) {
      toast.error('No se pudo activar la prueba', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const generarAccesoMovil = async (c: ClienteAdmin) => {
    setGuardando(true);
    try {
      await crearAccesoMovilDueno(c);
      toast.success(`Acceso móvil listo para ${c.nombreNegocio}`, {
        description: `El dueño ya puede entrar a la app con el usuario "${c.usuario}" y su misma contraseña de licencia.`,
      });
    } catch (e) {
      toast.error('No se pudo crear el acceso móvil', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const guardarModulos = async () => {
    if (!seleccionado) return;
    setGuardando(true);
    try {
      await actualizarModulosClienteAdmin(seleccionado.id, Array.from(modulosSel));
      toast.success('Módulos actualizados');
      setSeleccionado(null);
      cargar();
    } catch (e) {
      toast.error('No se pudieron guardar los módulos', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  if (empleado && !empleado.es_staff_codec) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-purple-400" />
            <h1 className="text-white text-xl font-black">Panel Desarrollador</h1>
          </div>
          <p className="text-slate-400 text-sm">Administra todos los negocios de Codec Studio</p>
        </div>
        <button
          onClick={abrirCrear}
          className="h-11 w-11 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0"
          aria-label="Crear negocio nuevo"
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="px-5 mb-6 grid grid-cols-3 gap-2 bg-slate-900/40 rounded-3xl py-5 mx-5 border border-slate-800/60" style={{ width: 'auto' }}>
        <RingStat label="Negocios" value={String(stats.total)} pct={100} colorFrom="#38bdf8" colorTo="#0284c7" />
        <RingStat label="Activos" value={`${Math.round(stats.activosPct)}%`} pct={stats.activosPct} colorFrom="#34d399" colorTo="#059669" />
        <RingStat label="En prueba" value={String(stats.enPrueba)} pct={stats.enPruebaPct} colorFrom="#fbbf24" colorTo="#d97706" />
      </div>

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar negocio o usuario..."
          className="h-11 pl-9 bg-slate-900/70 border-slate-800 text-white"
        />
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando negocios...</p>}
        {!cargando && filtrados.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin resultados</p>
        )}
        {filtrados.map((c) => {
          const dias = diasRestantes(c);
          return (
            <button
              key={c.id}
              onClick={() => abrirDetalle(c)}
              className="w-full bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 text-left"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-white font-semibold text-sm truncate flex-1">{c.nombreNegocio}</p>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                  c.estado === 'ACTIVA' ? 'bg-emerald-500/15 text-emerald-400' : c.estado === 'SUSPENDIDA' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {c.estado}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold flex items-center gap-1 ${c.plan === 'PREMIUM' ? 'text-amber-400' : 'text-sky-400'}`}>
                  {c.plan === 'PREMIUM' ? <Crown className="w-3 h-3" /> : <Zap className="w-3 h-3" />} {c.plan}
                </span>
                {c.enPrueba && (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Prueba {dias != null ? `· ${dias}d` : ''}
                  </span>
                )}
                <span className="text-slate-500 text-[10px]">{c.usuario}</span>
              </div>
            </button>
          );
        })}
      </div>

      {seleccionado && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg truncate pr-4">{seleccionado.nombreNegocio}</h2>
              <button onClick={() => setSeleccionado(null)} className="text-slate-400 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 space-y-4 pb-8">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => toggleEstado(seleccionado)}
                  disabled={guardando}
                  variant="outline"
                  className={`h-12 ${seleccionado.estado === 'ACTIVA' ? 'border-red-800 text-red-400' : 'border-emerald-800 text-emerald-400'} bg-slate-900/50`}
                >
                  <Power className="w-4 h-4 mr-2" />
                  {seleccionado.estado === 'ACTIVA' ? 'Suspender' : 'Reactivar'}
                </Button>
                <Button
                  onClick={() => activarPruebaGratis(seleccionado)}
                  disabled={guardando}
                  className="h-12 bg-gradient-to-r from-emerald-500 to-green-600"
                >
                  {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
                  Activar prueba gratis (14 días)
                </Button>
              </div>

              <Button
                onClick={() => generarAccesoMovil(seleccionado)}
                disabled={guardando}
                variant="outline"
                className="w-full h-11 border-sky-800 text-sky-400 bg-slate-900/50"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Generar acceso móvil para el dueño
              </Button>

              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Módulos activos</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {MODULOS_DISPONIBLES.map((m) => {
                    const activo = modulosSel.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          setModulosSel((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                            return next;
                          });
                        }}
                        className={`text-left px-2.5 py-2 rounded-lg border text-xs transition ${
                          activo ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'
                        }`}
                      >
                        {activo ? '☑' : '☐'} {m.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={guardarModulos} disabled={guardando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Guardar módulos'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {mostrarCrear && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg">Nuevo negocio</h2>
              <button onClick={() => setMostrarCrear(false)} className="text-slate-400 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 space-y-3 pb-8">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Nombre del negocio</Label>
                <Input value={formNuevo.nombreNegocio} onChange={(e) => setFormNuevo({ ...formNuevo, nombreNegocio: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">NIT</Label>
                  <Input value={formNuevo.nit} onChange={(e) => setFormNuevo({ ...formNuevo, nit: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Teléfono</Label>
                  <Input value={formNuevo.telefono} onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Contacto</Label>
                <Input value={formNuevo.contacto} onChange={(e) => setFormNuevo({ ...formNuevo, contacto: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Correo</Label>
                <Input type="email" value={formNuevo.email} onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>

              <div className="h-px bg-slate-800 my-2" />
              <p className="text-purple-300 text-xs font-bold uppercase tracking-wide">Credencial única (Electron + celular)</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Usuario</Label>
                  <Input value={formNuevo.usuario} onChange={(e) => setFormNuevo({ ...formNuevo, usuario: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Contraseña</Label>
                  <Input value={formNuevo.contraseña} onChange={(e) => setFormNuevo({ ...formNuevo, contraseña: e.target.value })} className="h-12 bg-slate-900 border-slate-700 text-white" />
                </div>
              </div>

              <div className="h-px bg-slate-800 my-2" />

              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Plan</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['BASICO', 'PREMIUM'] as PlanCliente[]).map((p) => (
                    <button
                      key={p} type="button" onClick={() => cambiarPlanNuevo(p)}
                      className={`h-12 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        formNuevo.plan === p ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      {p === 'PREMIUM' ? <Crown className="w-4 h-4" /> : <Zap className="w-4 h-4" />} {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Duración</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {DURACIONES.map((d) => (
                    <button
                      key={d.id} type="button" onClick={() => setFormNuevo({ ...formNuevo, duracion: d.id })}
                      className={`h-10 rounded-lg text-[11px] font-bold transition-all ${
                        formNuevo.duracion === d.id ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Módulos ({modulosSel.size})</p>
                  <button type="button" onClick={() => setModulosSel(new Set(modulosPorPlan(formNuevo.plan)))} className="text-purple-400 text-xs font-semibold">
                    Restaurar por plan
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MODULOS_DISPONIBLES.map((m) => {
                    const activo = modulosSel.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModulosSel((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                            return next;
                          });
                        }}
                        className={`text-left px-2.5 py-2 rounded-lg border text-xs transition ${
                          activo ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300' : 'border-slate-800 text-slate-400'
                        }`}
                      >
                        {activo ? '☑' : '☐'} {m.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

              {errorCrear && <p className="text-red-400 text-sm text-center">{errorCrear}</p>}

              <Button onClick={crearCliente} disabled={guardando} className="w-full h-14 text-base bg-gradient-to-r from-purple-600 to-fuchsia-600">
                {guardando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : 'Crear negocio'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
