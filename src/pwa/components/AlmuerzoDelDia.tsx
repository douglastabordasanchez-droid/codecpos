/**
 * Almuerzo del día en el celular (migraciones 0161 y 0162, menuDelDiaService.ts).
 *  - TarjetaAlmuerzo: resumen en el salón; quien tiene permiso lo edita desde ahí.
 *  - BotonAlmuerzoDelDia: acceso para quien publica (Inicio, Estaciones).
 *  - EditorAlmuerzo: precio, opciones, adicionales y (solo administrador) quién publica.
 *  - ElegirAlmuerzo: el mesero elige una opción de cada grupo, adicionales y nota.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Plus, X, UtensilsCrossed, Pencil, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import {
  ADICIONALES_SUGERIDOS, GRUPOS_SUGERIDOS, NOMBRES_DIA, diaSemanaColombia, guardarEditoresAlmuerzo, hoyColombia,
  listarEmpleadosParaAlmuerzo, obtenerMenuDelDia, publicarMenuDelDia, puedePublicarAlmuerzo,
  type AdicionalAlmuerzo, type GrupoAlmuerzo, type MenuDelDia, type MenuGuardado,
} from '../../app/lib/supabase/menuDelDiaService';

/** Pedidos frecuentes del almuerzo; el resto se escribe a mano. */
const ATAJOS_NOTA_ALMUERZO = ['Sin sopa', 'Sin ensalada', 'Sin principio', 'Solo seco', 'Para llevar'];

const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
const soloDigitos = (v: string) => v.replace(/\D/g, '');
const conPuntos = (v: string) => (soloDigitos(v) ? Number(soloDigitos(v)).toLocaleString('es-CO') : '');

function Hoja({ abierta, onCerrar, children }: { abierta: boolean; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {abierta && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[92vh] flex flex-col"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Resumen en el salón ──────────────────────────────────────────────────────

export function TarjetaAlmuerzo({ menu, puedeEditar, onEditar }: { menu: MenuDelDia | null; puedeEditar: boolean; onEditar: () => void }) {
  const deHoy = !!menu && menu.fecha === hoyColombia();
  const conOpciones = menu?.grupos.filter((g) => g.opciones.length) ?? [];
  if (!puedeEditar && (!deHoy || conOpciones.length === 0)) return null;
  return (
    <div className="px-5 mb-5">
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-black leading-tight">Almuerzo del día</p>
            <p className="text-slate-500 text-xs">
              {!menu || conOpciones.length === 0 ? 'Sin publicar' : deHoy ? `Hoy · ${money(menu.precio)}` : 'Es el menú de otro día: actualízalo'}
            </p>
          </div>
          {puedeEditar && (
            <button onClick={onEditar} className="h-9 px-3 rounded-xl bg-emerald-600 text-[#fff] text-xs font-bold flex items-center gap-1.5 shrink-0">
              <Pencil className="w-3.5 h-3.5" /> {conOpciones.length ? 'Editar' : 'Publicar'}
            </button>
          )}
        </div>
        {conOpciones.length > 0 && (
          <div className="space-y-1">
            {conOpciones.map((g) => (
              <p key={g.nombre} className={`text-xs leading-snug ${deHoy ? 'text-slate-300' : 'text-slate-500'}`}>
                <span className="font-bold">{g.nombre}:</span> {g.opciones.join(' · ')}
              </p>
            ))}
            {!!menu?.adicionales.length && (
              <p className={`text-xs leading-snug ${deHoy ? 'text-slate-300' : 'text-slate-500'}`}>
                <span className="font-bold">Adicionales:</span> {menu.adicionales.map((a) => `${a.nombre} ${money(a.precio)}`).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Acceso para quien publica (Inicio, Estaciones) ───────────────────────────

/** Muestra el almuerzo con su botón de editar solo a quien puede publicarlo. */
export function BotonAlmuerzoDelDia({ empleado, flotante = false }: {
  empleado: { id: string; rol: string; cliente_id: string } | null | undefined; flotante?: boolean;
}) {
  const [menu, setMenu] = useState<MenuDelDia | null>(null);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const traer = useCallback(() => {
    if (!empleado) return;
    obtenerMenuDelDia(empleado.cliente_id).then((m) => { setMenu(m); setCargado(true); }).catch(() => setCargado(true));
  }, [empleado?.cliente_id]);
  useEffect(() => { traer(); }, [traer]);
  if (!empleado || !cargado || !puedePublicarAlmuerzo(menu, empleado)) return null;
  return (
    <>
      {flotante ? (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-5 right-5 z-50 h-12 px-4 rounded-2xl bg-emerald-600 text-[#fff] text-sm font-black shadow-xl flex items-center gap-2"
        >
          <UtensilsCrossed className="w-4 h-4" /> Almuerzo del día
        </button>
      ) : (
        <TarjetaAlmuerzo menu={menu} puedeEditar onEditar={() => setAbierto(true)} />
      )}
      <EditorAlmuerzo
        abierto={abierto}
        clienteId={empleado.cliente_id}
        menu={menu}
        esAdmin={['admin', 'super_usuario'].includes(empleado.rol)}
        onCerrar={() => setAbierto(false)}
        onPublicado={traer}
      />
    </>
  );
}

// ── Editor (administrador o quien tenga permiso) ─────────────────────────────

type AdicionalEditable = { nombre: string; precio: string };

export function EditorAlmuerzo({
  abierto, clienteId, menu, esAdmin, onCerrar, onPublicado,
}: {
  abierto: boolean; clienteId: string; menu: MenuDelDia | null; esAdmin: boolean; onCerrar: () => void; onPublicado: () => void;
}) {
  // De dónde arranca el editor: el de hoy si ya se publicó; si no, el último de este
  // mismo día de la semana (el lunes pasado para un lunes); si no, el último publicado.
  const hoy = diaSemanaColombia();
  const fuenteInicial = (): { menu: MenuGuardado | null; etiqueta: string } => {
    if (menu && menu.fecha === hoyColombia()) return { menu, etiqueta: 'El de hoy' };
    const mismoDia = menu?.porDia[String(hoy)];
    if (mismoDia) return { menu: mismoDia, etiqueta: `El del ${NOMBRES_DIA[hoy].toLowerCase()} pasado` };
    if (menu?.grupos.length) return { menu, etiqueta: 'El último publicado' };
    return { menu: null, etiqueta: '' };
  };
  const [fuente, setFuente] = useState<{ menu: MenuGuardado | null; etiqueta: string }>(fuenteInicial);
  // Las partes sugeridas que falten (p. ej. Ensalada) se agregan vacías para llenarlas.
  const gruposDe = (m: MenuGuardado | null): GrupoAlmuerzo[] => {
    const base = (m?.grupos.length ? m.grupos : GRUPOS_SUGERIDOS).map((g) => ({ ...g, opciones: [...g.opciones] }));
    const faltan = GRUPOS_SUGERIDOS.filter((s) => !base.some((g) => g.nombre.toLowerCase() === s.nombre.toLowerCase()))
      .map((g) => ({ nombre: g.nombre, opciones: [] as string[] }));
    return [...base, ...faltan];
  };
  const gruposIniciales = (): GrupoAlmuerzo[] => gruposDe(fuenteInicial().menu);
  const adicionalesDe = (m: MenuGuardado | null): AdicionalEditable[] => {
    const actuales = (m?.adicionales ?? []).map((a) => ({ nombre: a.nombre, precio: String(a.precio) }));
    const sugeridos = ADICIONALES_SUGERIDOS.filter((s) => !actuales.some((a) => a.nombre.toLowerCase() === s.toLowerCase()))
      .map((nombre) => ({ nombre, precio: '' }));
    return [...actuales, ...sugeridos];
  };
  const adicionalesIniciales = (): AdicionalEditable[] => adicionalesDe(fuenteInicial().menu);
  /** Carga en el editor el menú guardado de otro día de la semana. */
  const cargarDia = (dia: string) => {
    const m = menu?.porDia[dia];
    if (!m) return;
    setGrupos(gruposDe(m));
    setAdicionales(adicionalesDe(m));
    if (m.precio) setPrecio(String(m.precio));
    setNuevaOpcion({});
    setFuente({ menu: m, etiqueta: `El del ${NOMBRES_DIA[Number(dia)].toLowerCase()}` });
  };
  const [grupos, setGrupos] = useState<GrupoAlmuerzo[]>(gruposIniciales);
  const [adicionales, setAdicionales] = useState<AdicionalEditable[]>(adicionalesIniciales);
  const [nuevoAdicional, setNuevoAdicional] = useState('');
  const precioInicial = () => { const f = fuenteInicial().menu; return f?.precio ? String(f.precio) : menu?.precio ? String(menu.precio) : ''; };
  const [precio, setPrecio] = useState(precioInicial);
  const [nuevaOpcion, setNuevaOpcion] = useState<Record<number, string>>({});
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [preparado, setPreparado] = useState(false);
  const [empleados, setEmpleados] = useState<Array<{ id: string; nombre: string; rol: string }>>([]);
  const [editores, setEditores] = useState<string[]>([]);
  if (abierto && !preparado) {
    setGrupos(gruposIniciales());
    setAdicionales(adicionalesIniciales());
    setPrecio(precioInicial());
    setFuente(fuenteInicial());
    setNuevaOpcion({});
    setEditores(menu?.editores ?? []);
    setPreparado(true);
  }
  if (!abierto && preparado) setPreparado(false);
  useEffect(() => {
    if (abierto && esAdmin) listarEmpleadosParaAlmuerzo(clienteId).then(setEmpleados).catch(() => {});
  }, [abierto, esAdmin, clienteId]);

  const agregarOpcion = (i: number) => {
    const texto = (nuevaOpcion[i] || '').trim();
    if (!texto) return;
    setGrupos((prev) => prev.map((g, j) => (j === i && !g.opciones.includes(texto) ? { ...g, opciones: [...g.opciones, texto] } : g)));
    setNuevaOpcion((prev) => ({ ...prev, [i]: '' }));
  };
  const quitarOpcion = (i: number, o: string) => setGrupos((prev) => prev.map((g, j) => (j === i ? { ...g, opciones: g.opciones.filter((x) => x !== o) } : g)));
  const quitarGrupo = (i: number) => setGrupos((prev) => prev.filter((_, j) => j !== i));
  const agregarGrupo = () => {
    const nombre = nuevoGrupo.trim();
    if (!nombre) return;
    setGrupos((prev) => [...prev, { nombre, opciones: [] }]);
    setNuevoGrupo('');
  };
  const agregarAdicional = () => {
    const nombre = nuevoAdicional.trim();
    if (!nombre || adicionales.some((a) => a.nombre.toLowerCase() === nombre.toLowerCase())) { setNuevoAdicional(''); return; }
    setAdicionales((prev) => [...prev, { nombre, precio: '' }]);
    setNuevoAdicional('');
  };

  const publicar = async () => {
    const valor = Number(soloDigitos(precio)) || 0;
    if (valor <= 0) { toast.error('Pon el precio del almuerzo'); return; }
    // Lo escrito en una casilla sin tocar «+» también cuenta.
    const finales = grupos.map((g, i) => {
      const pendiente = (nuevaOpcion[i] || '').trim();
      return pendiente && !g.opciones.includes(pendiente) ? { ...g, opciones: [...g.opciones, pendiente] } : g;
    });
    if (!finales.some((g) => g.opciones.length)) { toast.error('Agrega al menos una opción'); return; }
    // Solo se ofrecen los adicionales con precio.
    const conPrecio: AdicionalAlmuerzo[] = adicionales
      .map((a) => ({ nombre: a.nombre.trim(), precio: Number(soloDigitos(a.precio)) || 0 }))
      .filter((a) => a.nombre && a.precio > 0);
    setGuardando(true);
    try {
      await publicarMenuDelDia(clienteId, finales, valor, conPrecio);
      if (esAdmin && JSON.stringify([...editores].sort()) !== JSON.stringify([...(menu?.editores ?? [])].sort())) {
        await guardarEditoresAlmuerzo(clienteId, editores);
      }
      toast.success('Almuerzo del día publicado', { description: 'Los meseros ya ven las opciones de hoy.' });
      onPublicado();
      onCerrar();
    } catch (e) {
      toast.error('No se pudo publicar', { description: e instanceof Error ? e.message : undefined });
    }
    setGuardando(false);
  };

  return (
    <Hoja abierta={abierto} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-lg leading-tight">Almuerzo del día</p>
          <p className="text-slate-400 text-xs">Escribe las opciones de hoy. Lo de ayer queda para que solo cambies lo nuevo.</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Menús guardados por día de la semana: un toque y queda cargado. */}
        {Object.keys(menu?.porDia ?? {}).length > 0 && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
            <p className="text-white text-sm font-black">
              {fuente.etiqueta ? `Cargado: ${fuente.etiqueta.toLowerCase()}` : 'Menús guardados'}
            </p>
            <p className="text-slate-400 text-xs">Toca un día para usar su menú y cambia solo lo nuevo.</p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].filter((d) => menu?.porDia[String(d)]).map((d) => (
                <button
                  key={d}
                  onClick={() => cargarDia(String(d))}
                  className={`h-9 px-3 rounded-full text-xs font-bold border ${d === hoy ? 'bg-emerald-600 border-transparent text-[#fff]' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
                >
                  {NOMBRES_DIA[d]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-slate-400 text-xs font-bold mb-1.5">Precio del almuerzo</p>
          <Input
            inputMode="numeric"
            value={conPuntos(precio)}
            onChange={(e) => setPrecio(soloDigitos(e.target.value))}
            placeholder="Ej: 15.000"
            className="h-12 bg-slate-900 border-slate-700 text-white text-lg font-black"
          />
        </div>

        {grupos.map((g, i) => (
          <div key={`${g.nombre}-${i}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-white text-sm font-black flex-1">{g.nombre}</p>
              <button onClick={() => quitarGrupo(i)} className="text-slate-500 p-1" aria-label={`Quitar ${g.nombre}`}><Trash2 className="w-4 h-4" /></button>
            </div>
            {g.opciones.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {g.opciones.map((o) => (
                  <span key={o} className="h-8 pl-3 pr-1 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1">
                    {o}
                    <button onClick={() => quitarOpcion(i, o)} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400" aria-label={`Quitar ${o}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={nuevaOpcion[i] || ''}
                onChange={(e) => setNuevaOpcion((prev) => ({ ...prev, [i]: e.target.value.slice(0, 60) }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarOpcion(i); } }}
                placeholder={g.nombre === 'Sopa' ? 'Ej: Ajiaco' : g.nombre === 'Proteína' ? 'Ej: Pollo asado' : 'Escribe una opción'}
                className="h-10 bg-slate-950 border-slate-700 text-white text-sm"
              />
              <button onClick={() => agregarOpcion(i)} className="w-10 h-10 rounded-xl bg-emerald-600 text-[#fff] flex items-center justify-center shrink-0" aria-label="Agregar opción">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={nuevoGrupo}
            onChange={(e) => setNuevoGrupo(e.target.value.slice(0, 40))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarGrupo(); } }}
            placeholder="Otra parte (ej: Postre)"
            className="h-10 bg-slate-900 border-slate-700 text-white text-sm"
          />
          <button onClick={agregarGrupo} className="h-10 px-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold shrink-0">Agregar parte</button>
        </div>

        {/* Adicionales con precio: se cobran como productos aparte. */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
          <p className="text-white text-sm font-black">Adicionales</p>
          <p className="text-slate-500 text-xs">Pon precio a los que se ofrecen hoy. Los que queden sin precio no salen.</p>
          {adicionales.map((a, i) => (
            <div key={`${a.nombre}-${i}`} className="flex items-center gap-2">
              <p className="text-slate-200 text-sm font-semibold flex-1 min-w-0 truncate">{a.nombre}</p>
              <Input
                inputMode="numeric"
                value={conPuntos(a.precio)}
                onChange={(e) => setAdicionales((prev) => prev.map((x, j) => (j === i ? { ...x, precio: soloDigitos(e.target.value) } : x)))}
                placeholder="Precio"
                className="h-10 w-28 bg-slate-950 border-slate-700 text-white text-sm font-bold"
              />
              <button onClick={() => setAdicionales((prev) => prev.filter((_, j) => j !== i))} className="text-slate-500 p-1 shrink-0" aria-label={`Quitar ${a.nombre}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={nuevoAdicional}
              onChange={(e) => setNuevoAdicional(e.target.value.slice(0, 40))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarAdicional(); } }}
              placeholder="Otro adicional (ej: Aguacate)"
              className="h-10 bg-slate-950 border-slate-700 text-white text-sm"
            />
            <button onClick={agregarAdicional} className="w-10 h-10 rounded-xl bg-emerald-600 text-[#fff] flex items-center justify-center shrink-0" aria-label="Agregar adicional">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Solo el administrador decide quién más publica el almuerzo. */}
        {esAdmin && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
            <p className="text-white text-sm font-black">¿Quién más puede publicar el almuerzo?</p>
            <p className="text-slate-500 text-xs">Los administradores siempre pueden. Marca a las personas que lo suben en la mañana.</p>
            {empleados.length === 0 ? (
              <p className="text-slate-500 text-xs">Cargando empleados…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {empleados.map((e) => {
                  const marcado = editores.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => setEditores((prev) => (marcado ? prev.filter((x) => x !== e.id) : [...prev, e.id]))}
                      className={`min-h-10 px-3 rounded-full text-xs font-bold border-2 flex items-center gap-1.5 ${marcado ? 'bg-emerald-600 border-emerald-600 text-[#fff]' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
                    >
                      {marcado && <Check className="w-3.5 h-3.5" />}{e.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-800 shrink-0">
        <Button onClick={publicar} disabled={guardando} className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-700 disabled:opacity-50">
          {guardando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
          Publicar almuerzo de hoy
        </Button>
      </div>
    </Hoja>
  );
}

// ── Selector del mesero ──────────────────────────────────────────────────────

export function ElegirAlmuerzo({
  abierto, menu, onCerrar, onElegir, editando,
}: {
  abierto: boolean; menu: MenuDelDia | null; onCerrar: () => void;
  /** seguir = true: la persona siguiente de la mesa pide otro almuerzo (la hoja queda abierta). */
  onElegir: (texto: string, adicionales: AdicionalAlmuerzo[], seguir: boolean) => void;
  /** Cambiar un almuerzo ya pedido: su número y lo que tenía. */
  editando?: { n: number; texto: string } | null;
}) {
  const grupos = (menu?.grupos ?? []).filter((g) => g.opciones.length);
  const ofrecidos = menu?.adicionales ?? [];
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [preparado, setPreparado] = useState(false);
  // Almuerzos ya agregados en esta hoja (una mesa de 4 pide 4 distintos).
  const [agregados, setAgregados] = useState(0);
  const limpiar = () => {
    setNota('');
    setExtras([]);
    // Si un grupo tiene una sola opción, va marcada de una vez.
    const base: Record<string, string> = Object.fromEntries(grupos.filter((g) => g.opciones.length === 1).map((g) => [g.nombre, g.opciones[0]]));
    // Al cambiar un almuerzo, arranca con lo que la persona ya había elegido.
    if (editando) {
      for (const renglon of editando.texto.split('\n')) {
        const i = renglon.indexOf(':');
        if (i < 0) continue;
        const parte = renglon.slice(0, i).trim();
        const valor = renglon.slice(i + 1).trim();
        if (parte === 'Nota') setNota(valor);
        else if (grupos.some((g) => g.nombre === parte && g.opciones.includes(valor))) base[parte] = valor;
      }
    }
    setEleccion(base);
  };
  if (abierto && !preparado) {
    limpiar();
    setAgregados(0);
    setPreparado(true);
  }
  if (!abierto && preparado) setPreparado(false);

  const faltan = grupos.filter((g) => !eleccion[g.nombre]).length;
  const elegidos = ofrecidos.filter((a) => extras.includes(a.nombre));
  const total = (menu?.precio || 0) + elegidos.reduce((s, a) => s + a.precio, 0);
  const confirmar = (seguir: boolean) => {
    const partes = grupos.filter((g) => eleccion[g.nombre]).map((g) => `${g.nombre}: ${eleccion[g.nombre]}`);
    if (elegidos.length) partes.push(`Adicional: ${elegidos.map((a) => a.nombre).join(', ')}`);
    if (nota.trim()) partes.push(`Nota: ${nota.trim()}`);
    onElegir(partes.join('\n'), elegidos, seguir);
    if (seguir) {
      setAgregados((n) => n + 1);
      limpiar();
      toast.success(`Almuerzo ${agregados + 1} agregado`, { description: 'Ahora el de la siguiente persona.', duration: 1800 });
    }
  };

  return (
    <Hoja abierta={abierto} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-lg leading-tight">{editando ? `Cambiar almuerzo ${editando.n}` : `Almuerzo ${agregados + 1}`}</p>
          <p className="text-slate-400 text-xs">
            Toca una opción de cada parte · {money(menu?.precio || 0)}
            {agregados > 0 ? ` · ya van ${agregados}` : ''}
          </p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">{g.nombre}</p>
            <div className="flex flex-wrap gap-2">
              {g.opciones.map((o) => {
                const activo = eleccion[g.nombre] === o;
                return (
                  <button
                    key={o}
                    onClick={() => setEleccion((prev) => ({ ...prev, [g.nombre]: activo ? '' : o }))}
                    className={`min-h-11 px-4 rounded-2xl text-sm font-bold border-2 transition-all ${activo ? 'bg-emerald-600 border-emerald-600 text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-200'}`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {ofrecidos.length > 0 && (
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">Adicionales (se cobran aparte)</p>
            <div className="flex flex-wrap gap-2">
              {ofrecidos.map((a) => {
                const activo = extras.includes(a.nombre);
                return (
                  <button
                    key={a.nombre}
                    onClick={() => setExtras((prev) => (activo ? prev.filter((x) => x !== a.nombre) : [...prev, a.nombre]))}
                    className={`min-h-11 px-4 rounded-2xl text-sm font-bold border-2 flex items-center gap-2 transition-all ${activo ? 'bg-sky-600 border-sky-600 text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-200'}`}
                  >
                    {activo ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {a.nombre} <span className={activo ? 'opacity-90' : 'text-amber-400'}>{money(a.precio)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">Nota (opcional)</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {ATAJOS_NOTA_ALMUERZO.map((a) => {
              const marcado = nota.split(',').map((x) => x.trim()).includes(a);
              return (
                <button
                  key={a}
                  onClick={() => setNota((prev) => {
                    const partes = prev.split(',').map((x) => x.trim()).filter(Boolean);
                    return (partes.includes(a) ? partes.filter((x) => x !== a) : [...partes, a]).join(', ');
                  })}
                  className={`min-h-9 px-3 rounded-full text-xs font-bold border ${marcado ? 'bg-amber-500 border-transparent text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-300'}`}
                >
                  {a}
                </button>
              );
            })}
          </div>
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 160))}
            placeholder="Ej: arroz sin sal, jugo sin azúcar"
            className="h-11 bg-slate-900 border-slate-700 text-white text-sm"
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-slate-800 shrink-0 flex gap-2">
        {!editando && <button
          onClick={() => confirmar(true)}
          className="h-14 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-black flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-5 h-5" /> Otro
        </button>}
        <Button onClick={() => confirmar(false)} className="flex-1 min-w-0 h-14 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-between px-4">
          <span className="flex items-center min-w-0">
            <Check className="w-5 h-5 mr-2 shrink-0" />
            <span className="truncate">{editando ? 'Guardar cambio' : faltan > 0 ? `Agregar (faltan ${faltan})` : agregados > 0 ? 'Agregar y terminar' : 'Agregar almuerzo'}</span>
          </span>
          <span className="tabular-nums font-black shrink-0 ml-2">{money(total)}</span>
        </Button>
      </div>
    </Hoja>
  );
}
