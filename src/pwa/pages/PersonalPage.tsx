/**
 * Personal — web y celular. Solo admin/super_usuario.
 *
 * Equipo con cuenta en la nube (tabla `empleados`, la misma con la que se
 * inicia sesión en la web, el celular y Electron) y roles personalizados del
 * negocio. El botón «+» crea un usuario nuevo o un rol nuevo; ambos sirven en
 * todo el ecosistema (ver rolesPersonalizadosService.ts y la migración 0103).
 *
 * El roster local por PIN de Electron (usuariosStorage.ts) es aparte y no
 * aparece aquí.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Users, Loader2, ShieldCheck, QrCode, Store, Plus, UserPlus, BadgeCheck, X, Eye, EyeOff, Wand2, Pencil, Trash2, Check,
} from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { EscanerTiendaQR, type QRPayloadTienda } from '../components/EscanerTiendaQR';
import { toast } from 'sonner';
import {
  ROLES_SISTEMA, ROLES_BASE, MODULOS_ASIGNABLES, COLORES_ROL, etiquetaRol,
  listarRolesPersonalizados, suscribirRolesPersonalizados, guardarRolPersonalizado, eliminarRolPersonalizado,
  asignarRol, crearEmpleado, valorRolDeEmpleado, type RolPersonalizado, type RolBase,
} from '../../app/lib/supabase/rolesPersonalizadosService';
import type { ModuloPOS } from '../../app/lib/permissions';

interface EmpleadoFila {
  id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  tienda_id: string | null;
  permisos: { modulosHabilitados?: string[]; rolPersonalizadoId?: string; rolPersonalizadoNombre?: string } | null;
}

type Pestana = 'equipo' | 'roles';

const CATEGORIAS: Record<string, string> = {
  ventas: 'Ventas', inventario: 'Inventario', clientes: 'Clientes', gestion: 'Gestión',
  reportes: 'Reportes', configuracion: 'Configuración', premium: 'Módulos adicionales',
};

const tarjeta = 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl';
const campo = 'w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm';

export default function PersonalPage() {
  const { empleado } = usePwaAuth();
  const [equipo, setEquipo] = useState<EmpleadoFila[]>([]);
  const [roles, setRoles] = useState<RolPersonalizado[]>([]);
  const [nombresTiendas, setNombresTiendas] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>('equipo');
  const [menuMas, setMenuMas] = useState(false);
  const [formUsuario, setFormUsuario] = useState(false);
  const [formRol, setFormRol] = useState<RolPersonalizado | 'nuevo' | null>(null);
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  const cargar = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    const [{ data }, rolesData, { data: tiendas }] = await Promise.all([
      client!.from('empleados').select('id, nombre_completo, rol, activo, tienda_id, permisos')
        .eq('cliente_id', empleado.cliente_id).order('nombre_completo'),
      listarRolesPersonalizados(empleado.cliente_id).catch(() => [] as RolPersonalizado[]),
      client!.from('tiendas').select('local_id, nombre').eq('cliente_id', empleado.cliente_id),
    ]);
    setEquipo((data as EmpleadoFila[]) || []);
    setRoles(rolesData);
    setNombresTiendas(Object.fromEntries((tiendas || []).map((t: any) => [t.local_id, t.nombre])));
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  // Altas y cambios hechos desde Electron, otro celular o el panel web se ven sin recargar.
  useEffect(() => {
    if (!empleado?.cliente_id) return;
    const client = getSupabaseClient();
    if (!client) return;
    const canal = client
      .channel(`empleados-pwa-personal-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados', filter: `cliente_id=eq.${empleado.cliente_id}` }, () => cargar())
      .subscribe();
    const dejarRoles = suscribirRolesPersonalizados(empleado.cliente_id, () => cargar());
    return () => { client.removeChannel(canal); dejarRoles(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  // La única política de UPDATE sobre `empleados` es la del propio usuario:
  // los cambios a OTRA persona van por funciones del servidor (security definer).
  const toggleActivo = async (fila: EmpleadoFila) => {
    if (fila.id === empleado?.id) { toast.error('No puedes desactivarte a ti mismo'); return; }
    const client = getSupabaseClient()!;
    const nuevo = !fila.activo;
    setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: nuevo } : e)));
    const { error } = await client.rpc('actualizar_empleado_admin', {
      p_empleado_id: fila.id, p_activo: nuevo, p_rol: fila.rol,
    });
    if (error) {
      toast.error('No se pudo actualizar', { description: error.message });
      setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: !nuevo } : e)));
    } else {
      toast.success(nuevo ? `${fila.nombre_completo} activado` : `${fila.nombre_completo} desactivado`);
    }
  };

  const cambiarRol = async (fila: EmpleadoFila, valor: string) => {
    try {
      await asignarRol(fila.id, valor);
      toast.success(`Rol de ${fila.nombre_completo} actualizado`);
    } catch (e: any) {
      toast.error('No se pudo cambiar el rol', { description: e.message });
    }
    cargar();
  };

  // ── Vinculación rápida por QR (Multi-Tienda) ───────────────────────────
  // El admin escanea el QR de una sucursal (Electron > Multi-Tienda) para
  // fijar a qué tienda queda limitado un empleado (RPC asignar_empleado_a_tienda).
  const [escaneandoPara, setEscaneandoPara] = useState<EmpleadoFila | null>(null);

  const asignarTienda = async (payload: QRPayloadTienda) => {
    if (!escaneandoPara) return;
    const client = getSupabaseClient()!;
    const { error } = await client.rpc('asignar_empleado_a_tienda', {
      p_empleado_id: escaneandoPara.id,
      p_tienda_id: payload.tienda_id,
    });
    if (error) {
      toast.error('No se pudo vincular la sucursal', { description: error.message });
      setEscaneandoPara(null);
      return;
    }
    setEquipo((prev) => prev.map((e) => (e.id === escaneandoPara.id ? { ...e, tienda_id: payload.tienda_id } : e)));
    toast.success(`${escaneandoPara.nombre_completo} vinculado a "${payload.tienda_nombre}"`);
    setEscaneandoPara(null);
  };

  const miembrosPorRol = useMemo(() => {
    const conteo: Record<string, number> = {};
    for (const e of equipo) {
      const id = e.permisos?.rolPersonalizadoId;
      if (id) conteo[id] = (conteo[id] || 0) + 1;
    }
    return conteo;
  }, [equipo]);

  if (!esAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="w-8 h-8 text-slate-700 mb-2" />
        <p className="text-slate-400 text-sm">Solo administradores pueden ver esta sección.</p>
      </div>
    );
  }

  if (escaneandoPara) {
    return (
      <EscanerTiendaQR
        clienteIdEsperado={empleado?.cliente_id || ''}
        titulo="Escanear QR de sucursal"
        subtitulo={`Vinculando a ${escaneandoPara.nombre_completo}`}
        onResultado={asignarTienda}
        onCerrar={() => setEscaneandoPara(null)}
      />
    );
  }

  const selectorRol = (valor: string, onChange: (v: string) => void, disabled?: boolean) => (
    <select value={valor} onChange={(ev) => onChange(ev.target.value)} disabled={disabled} className={`${campo} disabled:opacity-50`}>
      <optgroup label="Roles del sistema">
        {ROLES_SISTEMA.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </optgroup>
      {roles.length > 0 && (
        <optgroup label="Roles de tu negocio">
          {roles.map((r) => <option key={r.id} value={`rp:${r.id}`}>{r.nombre}</option>)}
        </optgroup>
      )}
    </select>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-28">
      <div className="px-5 pt-8 pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Personal</h1>
          <p className="text-slate-400 text-sm">{equipo.length} con acceso · {roles.length} {roles.length === 1 ? 'rol propio' : 'roles propios'}</p>
        </div>
        {/* En computador el «+» va arriba; en el celular flota abajo a la derecha. */}
        <button
          onClick={() => setMenuMas(true)}
          className="hidden lg:flex h-10 px-4 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Nuevo
        </button>
      </div>

      <div className="px-5 flex gap-2 mb-4">
        {([['equipo', 'Equipo', Users], ['roles', 'Roles', BadgeCheck]] as const).map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`h-10 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 ${pestana === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'}`}
          >
            <Icono className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : pestana === 'equipo' ? (
        equipo.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Nadie más tiene acceso todavía. Toca «+» para crear un usuario.</p>
          </div>
        ) : (
          <div className="px-5 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {equipo.map((e) => {
              const rolPropio = e.permisos?.rolPersonalizadoNombre;
              const color = roles.find((r) => r.id === e.permisos?.rolPersonalizadoId)?.color;
              return (
                <div key={e.id} className={`${tarjeta} p-4`}>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{e.nombre_completo}{e.id === empleado?.id ? ' (tú)' : ''}</p>
                      <p className="text-xs truncate" style={{ color: color || undefined }}>
                        <span className={color ? '' : 'text-slate-500'}>{rolPropio ? `${rolPropio} · base ${etiquetaRol(e.rol).toLowerCase()}` : etiquetaRol(e.rol)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => toggleActivo(e)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold ${e.activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}
                    >
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                  {selectorRol(valorRolDeEmpleado(e), (v) => cambiarRol(e, v), e.id === empleado?.id)}

                  {!['super_usuario', 'admin'].includes(e.rol) && (
                    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                        <Store className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{e.tienda_id && e.tienda_id !== 'tienda_principal' ? (nombresTiendas[e.tienda_id] || 'Sucursal sin nombre') : 'Tienda Principal'}</span>
                      </div>
                      <button
                        onClick={() => setEscaneandoPara(e)}
                        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 text-[11px] font-bold"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Vincular sucursal
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="px-5 space-y-2.5">
          {roles.length === 0 ? (
            <div className="text-center py-12 px-6">
              <BadgeCheck className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Crea roles a la medida de tu negocio, como «Supervisor» o «Bodeguero», eligiendo qué módulos puede usar cada uno.</p>
              <button onClick={() => setFormRol('nuevo')} className="mt-4 h-10 px-4 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Crear rol
              </button>
            </div>
          ) : roles.map((r) => (
            <div key={r.id} className={`${tarjeta} p-4 flex items-center gap-3`}>
              <span className="w-3 h-10 rounded-full shrink-0" style={{ background: r.color || '#64748b' }} />
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{r.nombre}</p>
                <p className="text-slate-500 text-xs truncate">
                  Base {etiquetaRol(r.rolBase).toLowerCase()} · {r.modulos.length} módulos · {miembrosPorRol[r.id] || 0} {miembrosPorRol[r.id] === 1 ? 'persona' : 'personas'}
                </p>
              </div>
              <button onClick={() => setFormRol(r)} className="h-9 w-9 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`¿Eliminar el rol «${r.nombre}»? Quienes lo tienen conservan sus módulos actuales.`)) return;
                  try { await eliminarRolPersonalizado(r.id); toast.success('Rol eliminado'); cargar(); } catch (e: any) { toast.error(e.message); }
                }}
                className="h-9 w-9 rounded-lg bg-slate-800 text-red-400 flex items-center justify-center" title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* «+» flotante del celular, por encima de la barra inferior */}
      <button
        onClick={() => setMenuMas(true)}
        aria-label="Crear usuario o rol"
        className="lg:hidden fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center active:scale-95"
      >
        <Plus className="w-7 h-7" />
      </button>

      {menuMas && (
        <Hoja onCerrar={() => setMenuMas(false)} titulo="Crear">
          <OpcionMas icono={UserPlus} titulo="Nuevo usuario" detalle="Una persona con su correo y contraseña. Entra en la web, el celular y Electron." onClick={() => { setMenuMas(false); setFormUsuario(true); }} />
          <OpcionMas icono={BadgeCheck} titulo="Nuevo rol" detalle="Un perfil a tu medida (ej. Supervisor) con los módulos que puede usar." onClick={() => { setMenuMas(false); setFormRol('nuevo'); }} />
        </Hoja>
      )}

      {formUsuario && (
        <FormularioUsuario
          selectorRol={selectorRol}
          onCerrar={() => setFormUsuario(false)}
          onCreado={() => { setFormUsuario(false); setPestana('equipo'); cargar(); }}
          onCrearRol={() => { setFormUsuario(false); setFormRol('nuevo'); }}
        />
      )}

      {formRol && (
        <FormularioRol
          rol={formRol === 'nuevo' ? null : formRol}
          onCerrar={() => setFormRol(null)}
          onGuardado={() => { setFormRol(null); setPestana('roles'); cargar(); }}
        />
      )}
    </div>
  );
}

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-black">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-400 p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OpcionMas({ icono: Icono, titulo, detalle, onClick }: { icono: typeof Plus; titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-3 p-3.5 mb-2 rounded-2xl bg-slate-900 border border-slate-800 text-left active:scale-[0.99]">
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><Icono className="w-5 h-5 text-amber-400" /></div>
      <div>
        <p className="text-white font-bold text-sm">{titulo}</p>
        <p className="text-slate-500 text-xs mt-0.5">{detalle}</p>
      </div>
    </button>
  );
}

function generarClave() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

function FormularioUsuario({ selectorRol, onCerrar, onCreado, onCrearRol }: {
  selectorRol: (valor: string, onChange: (v: string) => void) => React.ReactNode;
  onCerrar: () => void;
  onCreado: () => void;
  onCrearRol: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [rol, setRol] = useState('cajero');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);

  const crear = async () => {
    if (nombre.trim().length < 2) return setError('Escribe el nombre de la persona');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un correo válido');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setEnviando(true);
    setError(null);
    try {
      await crearEmpleado({ nombre, email, password, rol });
      toast.success(`${nombre.trim()} ya tiene acceso`);
      setCreado({ email: email.trim().toLowerCase(), password });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (creado) {
    const texto = `Tu acceso a CODEC POS:\nCorreo: ${creado.email}\nContraseña: ${creado.password}\nEntra desde la app del celular, la web o el programa de escritorio.`;
    return (
      <Hoja titulo="Usuario creado" onCerrar={onCreado}>
        <p className="text-slate-400 text-sm mb-3">Comparte estos datos con la persona. Por seguridad no se vuelven a mostrar.</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-900 border border-slate-800 p-3 text-white text-sm mb-3">{texto}</pre>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Copiado'); }} className="h-11 rounded-xl bg-slate-800 text-white text-sm font-bold">Copiar</button>
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')} className="h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold">WhatsApp</button>
        </div>
        <button onClick={onCreado} className="w-full h-11 mt-2 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold">Listo</button>
      </Hoja>
    );
  }

  return (
    <Hoja titulo="Nuevo usuario" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div>
          <label className="text-slate-400 text-xs">Nombre completo</label>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} placeholder="Ej. Laura Gómez" />
        </div>
        <div>
          <label className="text-slate-400 text-xs">Correo (con este inicia sesión)</label>
          <input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="laura@correo.com" />
        </div>
        <div>
          <label className="text-slate-400 text-xs">Contraseña</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={verClave ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${campo} pr-10`} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
              <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 p-1" aria-label="Mostrar contraseña">
                {verClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="button" onClick={() => { setPassword(generarClave()); setVerClave(true); }} className="h-11 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1" title="Generar contraseña">
              <Wand2 className="w-4 h-4" /> Generar
            </button>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-slate-400 text-xs">Rol</label>
            <button type="button" onClick={onCrearRol} className="text-amber-400 text-xs font-semibold">+ Crear un rol nuevo</button>
          </div>
          {selectorRol(rol, setRol)}
          <p className="text-slate-500 text-[11px] mt-1">{ROLES_SISTEMA.find((r) => r.value === rol)?.descripcion || 'Rol de tu negocio: solo verá los módulos que elegiste.'}</p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button onClick={crear} disabled={enviando} className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Crear usuario
        </button>
      </div>
    </Hoja>
  );
}

function FormularioRol({ rol, onCerrar, onGuardado }: { rol: RolPersonalizado | null; onCerrar: () => void; onGuardado: () => void }) {
  const { tieneModulo } = useModulosActivos();
  const [nombre, setNombre] = useState(rol?.nombre || '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion || '');
  const [rolBase, setRolBase] = useState<RolBase>(rol?.rolBase || 'cajero');
  const [color, setColor] = useState(rol?.color || COLORES_ROL[0]);
  const [modulos, setModulos] = useState<Set<string>>(new Set(rol?.modulos || ['punto_de_venta', 'ventas_historial']));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo los módulos que el negocio tiene contratados/activos.
  const disponibles = MODULOS_ASIGNABLES.filter((m) => tieneModulo(m.id as ModuloPOS) || modulos.has(m.id));
  const porCategoria = disponibles.reduce<Record<string, typeof disponibles>>((acc, m) => {
    (acc[m.categoria] ||= []).push(m);
    return acc;
  }, {});

  const alternar = (id: string) => setModulos((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const guardar = async () => {
    if (nombre.trim().length < 2) return setError('Ponle un nombre al rol');
    if (modulos.size === 0) return setError('Elige al menos un módulo');
    setEnviando(true);
    setError(null);
    try {
      await guardarRolPersonalizado({ id: rol?.id, nombre, rolBase, modulos: [...modulos], descripcion, color });
      toast.success(rol ? 'Rol actualizado: quienes lo tienen ya ven los cambios' : `Rol «${nombre.trim()}» creado`);
      onGuardado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Hoja titulo={rol ? `Editar «${rol.nombre}»` : 'Nuevo rol'} onCerrar={onCerrar}>
      <div className="space-y-3">
        <div>
          <label className="text-slate-400 text-xs">Nombre del rol</label>
          <input autoFocus value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} className={campo} placeholder="Ej. Supervisor, Bodeguero, Domiciliario" />
        </div>
        <div>
          <label className="text-slate-400 text-xs">Descripción (opcional)</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={campo} placeholder="Qué hace esta persona" />
        </div>
        <div>
          <label className="text-slate-400 text-xs">Funciona como</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mt-1">
            {ROLES_BASE.map((b) => (
              <button key={b} type="button" onClick={() => setRolBase(b)}
                className={`h-9 rounded-lg text-xs font-bold ${rolBase === b ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
                {etiquetaRol(b)}
              </button>
            ))}
          </div>
          <p className="text-slate-500 text-[11px] mt-1">Define su pantalla de trabajo (ej. el mesero entra a mesas). Los permisos los dan los módulos de abajo.</p>
        </div>
        <div>
          <label className="text-slate-400 text-xs">Color</label>
          <div className="flex gap-2 mt-1">
            {COLORES_ROL.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: c }}>
                {color === c && <Check className="w-4 h-4" style={{ color: '#ffffff' }} />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-slate-400 text-xs">Módulos que puede usar ({modulos.size})</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModulos(new Set(disponibles.map((m) => m.id)))} className="text-amber-400 text-xs font-semibold">Todos</button>
              <button type="button" onClick={() => setModulos(new Set())} className="text-slate-500 text-xs font-semibold">Ninguno</button>
            </div>
          </div>
          <div className="mt-2 space-y-3">
            {Object.entries(porCategoria).map(([cat, lista]) => (
              <div key={cat}>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1">{CATEGORIAS[cat] || cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {lista.map((m) => {
                    const activo = modulos.has(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => alternar(m.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm border ${activo ? 'bg-amber-500/10 border-amber-500/40 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                        <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${activo ? 'bg-amber-500' : 'border border-slate-600'}`}>
                          {activo && <Check className="w-3 h-3" style={{ color: '#0f172a' }} />}
                        </span>
                        <span className="truncate">{m.icono} {m.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button onClick={guardar} disabled={enviando} className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} {rol ? 'Guardar cambios' : 'Crear rol'}
        </button>
      </div>
    </Hoja>
  );
}
