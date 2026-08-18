/**
 * Alimentos y Bebidas — versión móvil.
 *
 * En Electron este módulo es un POS táctil pensado para una pantalla grande
 * fija en el mostrador. En el celular no tiene sentido replicar eso: lo que
 * el negocio necesita del teléfono es la COMANDERA — el mesero toma el pedido
 * parado junto a la mesa y la caja lo ve al instante.
 *
 * Por eso la pantalla se organiza como el salón real: mapa de mesas → cuenta
 * de la mesa → catálogo por categoría. Se escribe en `panaderia_cuentas` con
 * `actualizado_en: 'pwa'`; Electron lo recibe por Realtime (ver
 * panaderiaSyncService) y lo cobra desde la caja.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Coffee, X, Loader2, Plus, Minus, Users, Search, Check,
  Trash2, AlertCircle, ChefHat,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import {
  guardarCuentaMesa,
  obtenerCatalogoPanaderia,
  obtenerCuentasMesa,
  suscribirCuentasMesa,
  enviarComanda,
  obtenerComandasActivas,
  suscribirComandas,
  type CuentaMesa,
  type ItemCuenta,
  type ItemComanda,
  type Comanda,
  type PanaderiaCategoria,
  type PanaderiaMesa,
  type PanaderiaProducto,
} from '../../app/lib/supabase/panaderiaSyncService';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const ESTADO_COMANDA_LABEL: Record<string, string> = {
  pendiente: '🕓 En cola',
  preparando: '🍳 Preparando',
  listo: '✅ Listo',
};

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const totalDeItems = (items: ItemCuenta[]) =>
  items.reduce((s, it) => s + (Number(it.producto?.precio) || 0) * (Number(it.cantidad) || 0), 0);

export default function PanaderiaPage() {
  const { empleado } = usePwaAuth();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<PanaderiaCategoria[]>([]);
  const [productos, setProductos] = useState<PanaderiaProducto[]>([]);
  const [mesas, setMesas] = useState<PanaderiaMesa[]>([]);
  const [cuentas, setCuentas] = useState<Record<string, CuentaMesa>>({});

  const [mesaAbierta, setMesaAbierta] = useState<PanaderiaMesa | null>(null);
  // 🍳 Comanda más reciente por mesa — para que el mesero vea sin preguntar
  // si cocina/bar ya la está preparando o ya está lista para servir.
  const [comandasPorMesa, setComandasPorMesa] = useState<Record<string, Comanda>>({});

  const cargar = useCallback(async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      const [catalogo, listaCuentas] = await Promise.all([
        obtenerCatalogoPanaderia(empleado.cliente_id),
        obtenerCuentasMesa(empleado.cliente_id),
      ]);
      setCategorias(catalogo.categorias);
      setProductos(catalogo.productos);
      setMesas(catalogo.mesas);
      setCuentas(Object.fromEntries(listaCuentas.map((c) => [c.mesaLocalId, c])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el salón');
    } finally {
      setCargando(false);
    }
  }, [empleado?.cliente_id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime: si la caja cobra una mesa, el mesero la ve liberarse al momento.
  useEffect(() => {
    if (!empleado) return;
    return suscribirCuentasMesa(empleado.cliente_id, (cuenta) => {
      setCuentas((prev) => ({ ...prev, [cuenta.mesaLocalId]: cuenta }));
    });
  }, [empleado?.cliente_id]);

  // 🍳 Estado de la comanda en vivo — avisa cuando cocina/bar la marca lista.
  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    obtenerComandasActivas(empleado.cliente_id).then((iniciales) => {
      if (cancelado) return;
      setComandasPorMesa(Object.fromEntries(iniciales.map((c) => [c.mesaLocalId, c])));
    }).catch(() => {});

    const unsubscribe = suscribirComandas(empleado.cliente_id, (comanda) => {
      setComandasPorMesa((prev) => {
        if (comanda.estado === 'entregado' || comanda.estado === 'cancelado') {
          const { [comanda.mesaLocalId]: _omitida, ...resto } = prev;
          return resto;
        }
        if (comanda.estado === 'listo' && prev[comanda.mesaLocalId]?.estado !== 'listo') {
          toast.success(`✅ ${comanda.mesaNombre || 'Pedido'} listo para servir`);
        }
        return { ...prev, [comanda.mesaLocalId]: comanda };
      });
    });

    return () => { cancelado = true; unsubscribe?.(); };
  }, [empleado?.cliente_id]);

  const guardar = async (mesa: PanaderiaMesa, items: ItemCuenta[]) => {
    if (!empleado) return;
    // El delta de comanda se calcula ANTES de sobrescribir `cuentas` con el
    // estado optimista, porque compara contra lo que ya estaba guardado.
    const enviarComandaPromise = enviarComandaMesa(mesa, items);

    // Optimista: la comandera debe sentirse instantánea aunque la red esté lenta.
    setCuentas((prev) => ({
      ...prev,
      [mesa.id]: {
        mesaLocalId: mesa.id,
        items,
        total: totalDeItems(items),
        abierta: items.length > 0,
        meseroNombre: empleado.nombre_completo,
        actualizadoEn: 'pwa',
        updatedAt: new Date().toISOString(),
      },
    }));
    try {
      await Promise.all([
        guardarCuentaMesa(empleado.cliente_id, mesa.id, items, 'pwa', empleado.nombre_completo),
        enviarComandaPromise,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pedido');
      cargar();
    }
  };

  // 🍳 Delta de ítems nuevos/aumentados desde la última cuenta conocida de la
  // mesa — así "Enviar a Cocina" no vuelve a mandar lo que ya se preparó.
  const enviarComandaMesa = async (mesa: PanaderiaMesa, nuevos: ItemCuenta[]) => {
    if (!empleado) return;
    const anteriores = cuentas[mesa.id]?.items ?? [];
    const delta: ItemComanda[] = nuevos.reduce<ItemComanda[]>((acc, it) => {
      const previo = anteriores.find((p) => p.producto.id === it.producto.id);
      const diferencia = it.cantidad - (previo?.cantidad || 0);
      if (diferencia > 0) acc.push({ nombre: it.producto.nombre, cantidad: diferencia });
      return acc;
    }, []);
    if (delta.length === 0) return;
    await enviarComanda(empleado.cliente_id, mesa.id, mesa.nombre, delta, empleado.nombre_completo).catch(() => {});
  };

  const mesasOcupadas = mesas.filter((m) => (cuentas[m.id]?.items?.length ?? 0) > 0).length;
  const ventaEnSalon = Object.values(cuentas).reduce((s, c) => s + (c.items?.length ? c.total : 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      {/* ── Encabezado ── */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Alimentos y Bebidas</h1>
            <p className="text-slate-400 text-sm">Comandas del salón</p>
          </div>
        </div>
      </div>

      {/* ── Resumen ── */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-amber-500/90 to-orange-600/90 rounded-2xl p-4 shadow-xl shadow-amber-500/10"
        >
          <p className="text-white/80 text-[10px] font-bold uppercase tracking-wide">Mesas ocupadas</p>
          <p className="text-white text-3xl font-black mt-0.5">{mesasOcupadas}</p>
          <p className="text-white/70 text-xs">de {mesas.length} mesas</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4"
        >
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">En salón</p>
          <p className="text-emerald-400 text-2xl font-black mt-0.5">{money(ventaEnSalon)}</p>
          <p className="text-slate-500 text-xs">sin cobrar</p>
        </motion.div>
      </div>

      {/* ── Salón ── */}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span className="text-slate-500 text-sm">Cargando el salón…</span>
        </div>
      ) : mesas.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-7 h-7 text-slate-700" />
          </div>
          <p className="text-slate-300 font-bold text-sm">El salón todavía no está publicado</p>
          <p className="text-slate-500 text-xs mt-1 max-w-[16rem] mx-auto">
            Desde el computador: Configuración → Módulos en la App Web → «Publicar datos ahora».
            Ahí se suben las mesas, categorías y productos.
          </p>
        </div>
      ) : (
        <div className="px-5">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2.5">Mesas</p>
          <div className="grid grid-cols-3 gap-2.5">
            {mesas.map((mesa, i) => {
              const cuenta = cuentas[mesa.id];
              const items = cuenta?.items ?? [];
              const ocupada = items.length > 0;
              const comanda = comandasPorMesa[mesa.id];
              return (
                <motion.button
                  key={mesa.id}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => setMesaAbierta(mesa)}
                  className={`relative aspect-square rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border transition-all active:scale-95 ${
                    comanda?.estado === 'listo'
                      ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/50'
                      : ocupada
                      ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-amber-500/50'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  {comanda && (
                    <span className="absolute top-1.5 right-1.5 text-[8px] font-black uppercase bg-slate-950/80 text-white px-1.5 py-0.5 rounded-full">
                      {ESTADO_COMANDA_LABEL[comanda.estado] || comanda.estado}
                    </span>
                  )}
                  <Users className={`w-5 h-5 ${ocupada ? 'text-amber-400' : 'text-slate-600'}`} />
                  <p className={`text-xs font-bold text-center leading-tight ${ocupada ? 'text-white' : 'text-slate-400'}`}>
                    {mesa.nombre}
                  </p>
                  {ocupada ? (
                    <>
                      <p className="text-amber-400 text-[11px] font-black">{money(cuenta.total)}</p>
                      <p className="text-slate-500 text-[9px]">{items.length} ítem{items.length === 1 ? '' : 's'}</p>
                    </>
                  ) : (
                    <p className="text-slate-600 text-[10px]">Libre</p>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="px-5 mt-4 text-red-400 text-sm flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {/* ── Cuenta de la mesa ── */}
      <AnimatePresence>
        {mesaAbierta && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 z-50 flex items-end"
            onClick={(e) => { if (e.target === e.currentTarget) setMesaAbierta(null); }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 h-[92vh] flex flex-col"
            >
              <CuentaDeMesa
                mesa={mesaAbierta}
                items={cuentas[mesaAbierta.id]?.items ?? []}
                categorias={categorias}
                productos={productos}
                onCerrar={() => setMesaAbierta(null)}
                onGuardar={(items) => guardar(mesaAbierta, items)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cuenta de una mesa ───────────────────────────────────────────────────────

function CuentaDeMesa({
  mesa, items: itemsIniciales, categorias, productos, onCerrar, onGuardar,
}: {
  mesa: PanaderiaMesa;
  items: ItemCuenta[];
  categorias: PanaderiaCategoria[];
  productos: PanaderiaProducto[];
  onCerrar: () => void;
  onGuardar: (items: ItemCuenta[]) => void;
}) {
  const [items, setItems] = useState<ItemCuenta[]>(itemsIniciales);
  const [catActiva, setCatActiva] = useState<string>(categorias[0]?.id ?? '');
  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Si la caja modifica la cuenta mientras está abierta en el celular, se
  // refleja — pero solo cuando el mesero no tiene cambios sin enviar.
  const sucio = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(itemsIniciales),
    [items, itemsIniciales]
  );
  useEffect(() => {
    if (!sucio) setItems(itemsIniciales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsIniciales]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (q) return p.nombre.toLowerCase().includes(q) || String(p.codigo || '').toLowerCase().includes(q);
      return !catActiva || p.categoriaId === catActiva;
    });
  }, [productos, catActiva, busqueda]);

  const agregar = (p: PanaderiaProducto) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.producto.id === p.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + 1 };
        return copia;
      }
      return [...prev, {
        producto: { id: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, codigo: p.codigo },
        cantidad: 1,
      }];
    });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => (it.producto.id === productoId ? { ...it, cantidad: it.cantidad + delta } : it))
        .filter((it) => it.cantidad > 0)
    );
  };

  const quitar = (productoId: string) =>
    setItems((prev) => prev.filter((it) => it.producto.id !== productoId));

  const enviar = async () => {
    setEnviando(true);
    await onGuardar(items);
    setEnviando(false);
    onCerrar();
  };

  const total = totalDeItems(items);

  return (
    <>
      {/* Cabecera */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0">
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-3" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white font-black text-lg leading-tight">{mesa.nombre}</p>
            <p className="text-slate-400 text-sm">
              {items.length === 0 ? 'Mesa libre' : `${items.length} ítem${items.length === 1 ? '' : 's'} · ${money(total)}`}
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cuenta actual */}
      {items.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-800 max-h-[30vh] overflow-y-auto shrink-0">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">Pedido</p>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div
                key={it.producto.id}
                className="flex items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-xl p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold truncate">{it.producto.nombre}</p>
                  <p className="text-slate-500 text-xs">{money(it.producto.precio)} c/u</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => cambiarCantidad(it.producto.id, -1)}
                    className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Minus className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                  <span className="text-white font-black text-sm w-6 text-center tabular-nums">{it.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(it.producto.id, 1)}
                    className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <p className="text-amber-400 font-bold text-sm w-16 text-right shrink-0 tabular-nums">
                  {money(it.producto.precio * it.cantidad)}
                </p>
                <button onClick={() => quitar(it.producto.id)} className="text-slate-600 p-1 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catálogo */}
      <div className="px-5 pt-3 shrink-0">
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            className="h-10 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
          />
        </div>
        {!busqueda && categorias.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatActiva(c.id)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold transition-all border ${
                  catActiva === c.id ? 'text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                style={catActiva === c.id ? { background: c.color || '#f59e0b' } : undefined}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-1 pb-4">
        {visibles.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">
            {productos.length === 0
              ? 'No hay productos publicados todavía.'
              : 'Ningún producto en esta categoría.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibles.map((p) => {
              const enCuenta = items.find((it) => it.producto.id === p.id)?.cantidad ?? 0;
              return (
                <button
                  key={p.id}
                  onClick={() => agregar(p)}
                  className={`relative text-left rounded-2xl p-3 border transition-all active:scale-[0.97] ${
                    enCuenta > 0
                      ? 'bg-amber-500/15 border-amber-500/50'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  {enCuenta > 0 && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                      {enCuenta}
                    </span>
                  )}
                  <div
                    className="w-8 h-8 rounded-lg mb-2 flex items-center justify-center"
                    style={{ background: `${p.color || '#f59e0b'}33` }}
                  >
                    <Coffee className="w-4 h-4" style={{ color: p.color || '#f59e0b' }} />
                  </div>
                  <p className="text-white text-sm font-semibold leading-tight line-clamp-2">{p.nombre}</p>
                  <p className="text-amber-400 text-sm font-black mt-1">{money(p.precio)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Enviar */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-slate-400 text-sm font-semibold">Total de la mesa</span>
          <span className="text-white text-2xl font-black tabular-nums">{money(total)}</span>
        </div>
        <Button
          onClick={enviar}
          disabled={enviando || !sucio}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
          {enviando ? 'Enviando…' : sucio ? 'Enviar a caja y cocina' : 'Sin cambios'}
        </Button>
        <p className="text-slate-600 text-[11px] text-center mt-2">
          La caja ve el pedido al instante y Cocina/Bar recibe lo nuevo para preparar.
        </p>
      </div>
    </>
  );
}
