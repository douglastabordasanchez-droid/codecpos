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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  Coffee, X, Loader2, Plus, Minus, Users, Search, Check,
  Trash2, AlertCircle, ChefHat, BellRing, Settings2, Vibrate, Volume2, VolumeX, QrCode,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import {
  guardarCuentaMesa,
  obtenerCatalogoPanaderia,
  completarCatalogoConInventario,
  obtenerCuentasMesa,
  suscribirCuentasMesa,
  enviarComanda,
  actualizarAlmuerzoEnComanda,
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
import {
  activarAvisosPedidos,
  audioAvisosPedidosActivo,
  avisarCambioComanda,
  desbloquearAvisosPedidos,
  guardarPreferenciasAvisosPedidos,
  obtenerPreferenciasAvisosPedidos,
  permisoAvisosPedidos,
} from '../lib/pedidoAlerts';
import { estaEnAppAndroid } from '../lib/androidBridge';
import { getSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';
import {
  autorizarComandas,
  comandasAutorizadasPara,
  desconectarComandas,
  getComandasAutorizacion,
  suscribirComandasAutorizacion,
} from '../lib/comandasAutorizadas';
import { EscanerTiendaQR, type QRPayloadTienda } from '../components/EscanerTiendaQR';
import { SucursalFiltro } from '../components/SucursalFiltro';
import { TarjetaAlmuerzo, EditorAlmuerzo, ElegirAlmuerzo, BotonAlmuerzoDelDia } from '../components/AlmuerzoDelDia';
import {
  obtenerMenuDelDia, hoyColombia, ALMUERZO_PRODUCTO_ID, puedePublicarAlmuerzo, idProductoAdicional, nombreProductoAdicional,
  type MenuDelDia, type AdicionalAlmuerzo,
} from '../../app/lib/supabase/menuDelDiaService';
import {
  type Estacion, listarEstaciones, suscribirEstaciones, estacionesAprendidas, recordarEstaciones,
} from '../../app/lib/supabase/estacionesService';

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
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<PanaderiaCategoria[]>([]);
  const [productos, setProductos] = useState<PanaderiaProducto[]>([]);
  const [mesas, setMesas] = useState<PanaderiaMesa[]>([]);
  const [cuentas, setCuentas] = useState<Record<string, CuentaMesa>>({});

  // 🏪 Sucursal activa — UNA sola preferencia compartida por TODOS los
  // módulos (Vender, Inventario, Alimentos y Bebidas), conectada desde el
  // TopBar (SucursalSwitcher.tsx), no un interruptor propio de esta pantalla:
  //   • Operativo (mesero/cajero/etc.) con sucursal fija asignada por un
  //     admin (PersonalPage > Vincular sucursal): SIEMPRE `empleado.tienda_id`
  //     — no elige, la RLS de todas formas solo le deja ver/operar esa.
  //   • Admin/dueño: ve TODAS por defecto (undefined = sin filtrar), o solo
  //     la conectada vía QR en el TopBar.
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [sucursalActiva, setSucursalActivaLocal] = useState(getSucursalActiva());
  useEffect(() => suscribirSucursalActiva(() => setSucursalActivaLocal(getSucursalActiva())), []);
  const tiendaEfectiva: string | null | undefined = esAdmin ? (sucursalActiva?.id ?? undefined) : (empleado?.tienda_id ?? null);

  // 🔒 Candado de comandas — un operativo (mesero/cajero/etc.) no puede tomar
  // pedidos desde este celular hasta escanear el QR de SU sucursal fija. El
  // admin/dueño nunca lo necesita: ya tiene acceso completo por diseño.
  const [autorizacion, setAutorizacion] = useState(() => getComandasAutorizacion());
  useEffect(() => suscribirComandasAutorizacion(() => setAutorizacion(getComandasAutorizacion())), []);
  const puedeComandar = esAdmin || comandasAutorizadasPara(empleado?.tienda_id);
  const [escaneandoComandas, setEscaneandoComandas] = useState(false);

  const onEscaneoComandas = (payload: QRPayloadTienda) => {
    const tiendaEsperada = empleado?.tienda_id || 'tienda_principal';
    if (payload.tienda_id !== tiendaEsperada) {
      toast.error('Ese QR no es de tu sucursal asignada', {
        description: 'Pide a un administrador que revise a qué sucursal estás vinculado en Personal.',
      });
      setEscaneandoComandas(false);
      return;
    }
    autorizarComandas(payload.tienda_id, payload.tienda_nombre);
    setEscaneandoComandas(false);
    toast.success('Comandas habilitadas', { description: `Ya puedes tomar pedidos para ${payload.tienda_nombre}.` });
  };

  const [mesaAbierta, setMesaAbierta] = useState<PanaderiaMesa | null>(null);

  // 🍽️ Estaciones (Cocina, Greca, Comidas rápidas…) y la estación aprendida de cada producto.
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [aprendidas, setAprendidas] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!empleado) return;
    let activo = true;
    const traer = () => {
      listarEstaciones(empleado.cliente_id).then((l) => { if (activo) setEstaciones(l); }).catch(() => {});
    };
    traer();
    estacionesAprendidas(empleado.cliente_id).then((a) => { if (activo) setAprendidas(a); }).catch(() => {});
    const quitar = suscribirEstaciones(empleado.cliente_id, traer);
    return () => { activo = false; quitar(); };
  }, [empleado?.cliente_id]);
  // 🍳 Comanda más reciente por mesa — para que el mesero vea sin preguntar
  // si cocina/bar ya la está preparando o ya está lista para servir.
  const [comandasPorMesa, setComandasPorMesa] = useState<Record<string, Comanda>>({});
  // 🍛 Almuerzo del día: lo publica el administrador; el mesero elige opciones al pedirlo.
  const [menuDia, setMenuDia] = useState<MenuDelDia | null>(null);
  const [editorAlmuerzo, setEditorAlmuerzo] = useState(false);
  const [permisoAvisos, setPermisoAvisos] = useState(() => permisoAvisosPedidos());
  const [audioAvisosActivo, setAudioAvisosActivo] = useState(() => audioAvisosPedidosActivo());
  const [preferenciasAvisos, setPreferenciasAvisos] = useState(() => obtenerPreferenciasAvisosPedidos());
  const [mostrarAjustesAvisos, setMostrarAjustesAvisos] = useState(false);
  const [alertaComanda, setAlertaComanda] = useState<Comanda | null>(null);
  const [flashAlerta, setFlashAlerta] = useState(false);
  const temporizadorFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarAlertaComanda = useCallback((comanda: Comanda) => {
    setAlertaComanda(comanda);
    setFlashAlerta(true);
    if (temporizadorFlash.current) clearTimeout(temporizadorFlash.current);
    temporizadorFlash.current = setTimeout(() => setFlashAlerta(false), 600);
  }, []);

  useEffect(() => () => {
    if (temporizadorFlash.current) clearTimeout(temporizadorFlash.current);
  }, []);

  const cambiarPreferenciaAvisos = (campo: 'voz' | 'vibracion') => {
    setPreferenciasAvisos((actuales) => {
      const siguientes = { ...actuales, [campo]: !actuales[campo] };
      guardarPreferenciasAvisosPedidos(siguientes);
      return siguientes;
    });
  };

  const activarAvisos = async () => {
    const permiso = await activarAvisosPedidos();
    setPermisoAvisos(permiso);
    setAudioAvisosActivo(audioAvisosPedidosActivo());
    if (permiso === 'granted') {
      toast.success('Avisos del mesero activados', { description: 'Recibirás vibración, notificación y voz al cambiar una comanda.' });
    } else if (permiso === 'denied') {
      toast.error('Las notificaciones están bloqueadas', { description: 'Actívalas en los permisos de este sitio o de la app CODEC POS.' });
    } else if (estaEnAppAndroid()) {
      toast.info('Confirma el permiso de notificaciones de Android para activar los avisos de pedidos.');
    } else {
      toast.success('Alertas de pedidos activadas', { description: 'Safari mostrará un aviso en pantalla y reproducirá sonido mientras la app esté abierta.' });
    }
  };

  const cargar = useCallback(async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      const [catalogo, listaCuentas] = await Promise.all([
        obtenerCatalogoPanaderia(empleado.cliente_id, tiendaEfectiva)
          .then((cat) => completarCatalogoConInventario(empleado.cliente_id, tiendaEfectiva, cat).catch(() => cat)),
        obtenerCuentasMesa(empleado.cliente_id, tiendaEfectiva),
      ]);
      setCategorias(catalogo.categorias);
      setProductos(catalogo.productos);
      setMesas(catalogo.mesas);
      setCuentas(Object.fromEntries(listaCuentas.map((c) => [c.mesaLocalId, c])));
      obtenerMenuDelDia(empleado.cliente_id).then(setMenuDia).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el salón');
    } finally {
      setCargando(false);
    }
  }, [empleado?.cliente_id, tiendaEfectiva]);

  useEffect(() => { cargar(); }, [cargar]);

  // 🔄 Mesas al día aunque el aviso en vivo se pierda: iPhone y Android cortan la
  // conexión en vivo con la app en segundo plano o la pantalla apagada, y si la
  // caja cobra en ese momento la mesa seguía ocupada en el celular. Se vuelven a
  // pedir cuentas y pedidos (sin recargar la página ni tocar lo que se está
  // escribiendo) al volver a la app, al volver internet y cada 20 s si está abierta.
  const ultimaEscrituraRef = useRef(0);
  const refrescarMesas = useCallback(async () => {
    if (!empleado || document.visibilityState !== 'visible' || !navigator.onLine) return;
    // Recién enviado un pedido: se espera a que la nube lo tenga para no
    // mostrar por un instante la cuenta anterior.
    if (Date.now() - ultimaEscrituraRef.current < 6000) return;
    try {
      const [listaCuentas, comandas] = await Promise.all([
        obtenerCuentasMesa(empleado.cliente_id, tiendaEfectiva),
        obtenerComandasActivas(empleado.cliente_id, tiendaEfectiva),
      ]);
      if (Date.now() - ultimaEscrituraRef.current < 6000) return;
      setCuentas(Object.fromEntries(listaCuentas.map((c) => [c.mesaLocalId, c])));
      setComandasPorMesa(Object.fromEntries(comandas.map((c) => [c.mesaLocalId, c])));
      obtenerMenuDelDia(empleado.cliente_id).then(setMenuDia).catch(() => {});
    } catch { /* sin conexión: se reintenta en el próximo turno */ }
  }, [empleado?.cliente_id, tiendaEfectiva]);
  // 🥐 Productos al día: lo que la caja o la terminal crean (pan de bono, gaseosas…)
  // aparece en el celular sin cerrar la app. Cada 90 s y al volver a la app, sin
  // tocar el pedido que se está armando (solo cambia la lista de productos).
  const ultimoCatalogoRef = useRef(Date.now());
  const refrescarCatalogo = useCallback(async () => {
    if (!empleado || document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (Date.now() - ultimoCatalogoRef.current < 60000) return;
    ultimoCatalogoRef.current = Date.now();
    try {
      const base = await obtenerCatalogoPanaderia(empleado.cliente_id, tiendaEfectiva);
      const catalogo = await completarCatalogoConInventario(empleado.cliente_id, tiendaEfectiva, base).catch(() => base);
      if (catalogo.productos.length === 0) return; // respuesta vacía por un corte: se deja lo que hay
      setCategorias(catalogo.categorias);
      setProductos(catalogo.productos);
    } catch { /* sin conexión: en el próximo turno */ }
  }, [empleado?.cliente_id, tiendaEfectiva]);
  useEffect(() => {
    const t = window.setInterval(() => { void refrescarCatalogo(); }, 90000);
    return () => window.clearInterval(t);
  }, [refrescarCatalogo]);

  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') { void refrescarMesas(); void refrescarCatalogo(); } };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('pageshow', alVolver);
    const turno = window.setInterval(() => { void refrescarMesas(); }, 20000);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('pageshow', alVolver);
      window.clearInterval(turno);
    };
  }, [refrescarMesas, refrescarCatalogo]);

  // Realtime: si la caja cobra una mesa, el mesero la ve liberarse al momento.
  // 🏪 Filtrado por sucursal — sin esto, el celular de una sucursal recibía
  // (y sonaba) los avisos de cuentas/comandas de OTRA sucursal del mismo negocio.
  useEffect(() => {
    if (!empleado) return;
    return suscribirCuentasMesa(empleado.cliente_id, (cuenta) => {
      setCuentas((prev) => ({ ...prev, [cuenta.mesaLocalId]: cuenta }));
    }, tiendaEfectiva);
  }, [empleado?.cliente_id, tiendaEfectiva]);

  // 🍳 Estado de la comanda en vivo — avisa cuando cocina/bar la marca lista.
  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    obtenerComandasActivas(empleado.cliente_id, tiendaEfectiva).then((iniciales) => {
      if (cancelado) return;
      setComandasPorMesa(Object.fromEntries(iniciales.map((c) => [c.mesaLocalId, c])));
    }).catch(() => {});

    const unsubscribe = suscribirComandas(empleado.cliente_id, (comanda) => {
      setComandasPorMesa((prev) => {
        if (comanda.estado === 'entregado' || comanda.estado === 'cancelado') {
          const { [comanda.mesaLocalId]: _omitida, ...resto } = prev;
          return resto;
        }
        const anterior = prev[comanda.mesaLocalId];
        if (
          (comanda.estado === 'preparando' || comanda.estado === 'listo') &&
          anterior && anterior.estado !== comanda.estado
        ) {
          avisarCambioComanda(comanda, comanda.estado);
          mostrarAlertaComanda(comanda);
        }
        return { ...prev, [comanda.mesaLocalId]: comanda };
      });
    }, tiendaEfectiva);

    return () => { cancelado = true; unsubscribe?.(); };
  }, [empleado?.cliente_id, mostrarAlertaComanda, tiendaEfectiva]);

  const guardar = async (mesa: PanaderiaMesa, items: ItemCuenta[], destinos: Record<string, string | null>, notas: NotasPedido = { porProducto: {}, general: '' }) => {
    if (!empleado) return;
    // El delta de comanda se calcula ANTES de sobrescribir `cuentas` con el
    // estado optimista, porque compara contra lo que ya estaba guardado.
    ultimaEscrituraRef.current = Date.now();
    const enviarComandaPromise = enviarComandaMesa(mesa, items, destinos, notas);

    // La mesa sigue siendo de quien la abrió (aunque la edite un administrador);
    // si queda vacía, se libera.
    const duenoPrevio = cuentas[mesa.id]?.items?.length ? cuentas[mesa.id]?.meseroNombre : undefined;
    const dueno = items.length > 0 ? (duenoPrevio || empleado.nombre_completo) : undefined;

    // Optimista: la comandera debe sentirse instantánea aunque la red esté lenta.
    setCuentas((prev) => ({
      ...prev,
      [mesa.id]: {
        mesaLocalId: mesa.id,
        items,
        total: totalDeItems(items),
        abierta: items.length > 0,
        meseroNombre: dueno,
        actualizadoEn: 'pwa',
        updatedAt: new Date().toISOString(),
      },
    }));
    try {
      await Promise.all([
        guardarCuentaMesa(empleado.cliente_id, mesa.id, items, 'pwa', dueno, mesa.tiendaId),
        enviarComandaPromise,
      ]);
      ultimaEscrituraRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pedido');
      cargar();
    }
  };

  // 🍳 Delta de ítems nuevos/aumentados desde la última cuenta conocida de la
  // mesa — así "Enviar a Cocina" no vuelve a mandar lo que ya se preparó.
  // 🍽️ Con estaciones (migración 0148) lo nuevo se reparte: una comanda por
  // estación con solo sus productos; lo marcado "solo cuenta" no se envía.
  // La elección queda aprendida para el próximo pedido de cualquier mesero.
  const enviarComandaMesa = async (mesa: PanaderiaMesa, nuevos: ItemCuenta[], destinos: Record<string, string | null>, notas: NotasPedido) => {
    const notaGeneral = notas.general.trim() || undefined;
    if (!empleado) return;
    const anteriores = cuentas[mesa.id]?.items ?? [];
    const delta: Array<ItemComanda & { productoId: string }> = nuevos.reduce<Array<ItemComanda & { productoId: string }>>((acc, it) => {
      const previo = anteriores.find((p) => p.producto.id === it.producto.id);
      // 🍛 Almuerzos numerados: a la estación le llega «ALMUERZO 3» con cada parte en su
      // renglón, y si alguien cambia o cancela el suyo, «CAMBIO · ALMUERZO 3».
      if (it.detalles?.length || previo?.detalles?.length) {
        const antes = new Map((previo?.detalles ?? []).map((d) => [d.n, d.texto]));
        const ahora = new Map((it.detalles ?? []).map((d) => [d.n, d.texto]));
        for (const [n, texto] of ahora) {
          if (!antes.has(n)) acc.push({ productoId: it.producto.id, nombre: `ALMUERZO ${n}`, cantidad: 1, nota: texto });
          else if (antes.get(n) !== texto) acc.push({ productoId: it.producto.id, nombre: `CAMBIO · ALMUERZO ${n}`, cantidad: 1, nota: texto });
        }
        for (const n of antes.keys()) if (!ahora.has(n)) acc.push({ productoId: it.producto.id, nombre: `QUITAR · ALMUERZO ${n}`, cantidad: 1 });
        return acc;
      }
      const diferencia = it.cantidad - (previo?.cantidad || 0);
      const nota = notas.porProducto[it.producto.id]?.trim();
      if (diferencia > 0) acc.push({ productoId: it.producto.id, nombre: it.producto.nombre, cantidad: diferencia, ...(nota ? { nota } : {}) });
      return acc;
    }, []);
    if (delta.length === 0) return;

    // 🍛 Cambios y cancelaciones de almuerzos ya enviados: se actualiza su línea en el
    // pedido que la estación ya tiene; solo si ese pedido ya no está, va uno nuevo.
    const marcaCambio = /^(CAMBIO|QUITAR) · ALMUERZO (\d+)$/;
    const sinActualizar: typeof delta = [];
    let actualizados = 0;
    for (const d of delta) {
      const m = d.nombre.match(marcaCambio);
      if (!m) { sinActualizar.push(d); continue; }
      const ok = await actualizarAlmuerzoEnComanda(empleado.cliente_id, mesa.id, Number(m[2]), m[1] === 'QUITAR' ? null : (d.nota || '')).catch(() => false);
      if (ok) actualizados++;
      else sinActualizar.push(d);
    }
    if (actualizados) toast.success(actualizados === 1 ? 'Cambio enviado a la estación' : `${actualizados} cambios enviados a la estación`);
    delta.splice(0, delta.length, ...sinActualizar);
    if (delta.length === 0) return;

    const activas = estaciones.filter((e) => e.activa);
    if (activas.length === 0) {
      await enviarComanda(empleado.cliente_id, mesa.id, mesa.nombre, delta.map(({ productoId: _p, ...i }) => i), empleado.nombre_completo, notaGeneral, mesa.tiendaId).catch(() => {});
      return;
    }

    const porEstacion = new Map<string, ItemComanda[]>();
    const elecciones: Record<string, string | null> = {};
    // Un cambio de almuerzo ya enviado va a donde fue el almuerzo (aprendido) o a la cocina.
    const estacionCocina = activas.find((e) => /cocina/i.test(e.nombre))?.id ?? activas[0]?.id ?? null;
    for (const d of delta) {
      let destino: string | null;
      if (d.productoId in destinos) {
        destino = destinos[d.productoId] ?? null;
        elecciones[d.productoId] = destino;
      } else if (d.productoId === ALMUERZO_PRODUCTO_ID) {
        destino = aprendidas[d.productoId] !== undefined ? aprendidas[d.productoId] : estacionCocina;
      } else {
        destino = null;
      }
      if (!destino) continue;
      porEstacion.set(destino, [...(porEstacion.get(destino) || []), { nombre: d.nombre, cantidad: d.cantidad, ...(d.nota ? { nota: d.nota } : {}) }]);
    }
    setAprendidas((prev) => ({ ...prev, ...elecciones }));
    await Promise.all([
      recordarEstaciones(empleado.cliente_id, elecciones).catch(() => {}),
      ...[...porEstacion.entries()].map(([estacionId, itemsEstacion]) => {
        const est = activas.find((e) => e.id === estacionId);
        return enviarComanda(
          empleado.cliente_id, mesa.id, mesa.nombre, itemsEstacion, empleado.nombre_completo, notaGeneral, mesa.tiendaId,
          est ? { id: est.id, nombre: est.nombre } : null,
        ).catch(() => toast.error(`No se pudo enviar a ${est?.nombre || 'la estación'}`));
      }),
    ]);
    const resumen = [...porEstacion.keys()].map((id) => activas.find((e) => e.id === id)?.nombre).filter(Boolean);
    if (resumen.length > 0) toast.success(`Pedido enviado a ${resumen.join(', ')}`);
  };

  const mesasOcupadas = mesas.filter((m) => (cuentas[m.id]?.items?.length ?? 0) > 0).length;
  const ventaEnSalon = Object.values(cuentas).reduce((s, c) => s + (c.items?.length ? c.total : 0), 0);

  // 🔒 Sin escanear el QR de su sucursal, un operativo no ve el salón ni
  // puede tomar comandas — ni siquiera las mesas, para que quede claro que
  // hace falta el escaneo antes de intentar nada.
  if (!puedeComandar) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-8 text-center">
        <BotonAlmuerzoDelDia empleado={empleado} flotante />
        {escaneandoComandas ? (
          <EscanerTiendaQR
            clienteIdEsperado={empleado?.cliente_id || ''}
            titulo="Escanear QR de tu sucursal"
            subtitulo="Necesario para poder tomar pedidos"
            onResultado={onEscaneoComandas}
            onCerrar={() => setEscaneandoComandas(false)}
          />
        ) : (
          <>
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
              <QrCode className="w-7 h-7 text-amber-500" />
            </div>
            <h1 className="text-white text-lg font-black mb-1.5">Escanea el QR de tu sucursal</h1>
            <p className="text-slate-400 text-sm max-w-xs mb-6">
              Antes de tomar pedidos, escanea el código QR de tu sucursal (lo genera un administrador en Electron &gt; Multi-Tienda).
              Nadie puede enviar comandas desde este celular hasta hacerlo.
            </p>
            <Button onClick={() => setEscaneandoComandas(true)} className="h-12 px-6 bg-gradient-to-r from-amber-500 to-orange-600">
              <QrCode className="w-4 h-4 mr-2" /> Escanear QR
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      {/* ── Encabezado ── */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Alimentos y Bebidas</h1>
            <p className="text-slate-400 text-sm">Comandas del salón</p>
          </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/estaciones')}
              className="shrink-0 h-[46px] rounded-xl border border-orange-500/50 bg-orange-500/10 px-3 text-orange-300 text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
              title="Pantalla de Cocina, Greca, Comidas rápidas…"
            >
              <ChefHat className="w-5 h-5" />Estaciones
            </button>
            <button
              type="button"
              onClick={() => setMostrarAjustesAvisos((visible) => !visible)}
              className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-300 active:scale-95 transition-transform"
              aria-label="Configurar avisos de pedidos"
              aria-expanded={mostrarAjustesAvisos}
              title="Configurar voz y vibración"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={activarAvisos}
              className={`shrink-0 rounded-xl border p-3 active:scale-95 transition-transform ${
                (permisoAvisos === 'granted' || audioAvisosActivo)
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
              aria-label="Activar notificaciones de pedidos"
              title={audioAvisosActivo ? 'Alertas sonoras activas' : 'Activar alertas de pedidos'}
            >
              <BellRing className="w-5 h-5" />
            </button>
          </div>
        </div>
        {esAdmin && sucursalActiva && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-400">
            <QrCode className="w-3.5 h-3.5" /> Viendo: {sucursalActiva.nombre} <span className="text-slate-500 font-normal">— cambia la sucursal desde el ícono arriba</span>
          </p>
        )}
        {!esAdmin && autorizacion && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <QrCode className="w-3.5 h-3.5" /> Comandas habilitadas para {autorizacion.tiendaNombre}
            <button
              type="button"
              onClick={() => { desconectarComandas(); toast.info('Comandas desconectadas — escanea de nuevo para tomar pedidos.'); }}
              className="text-slate-500 font-normal underline"
            >
              desconectar
            </button>
          </p>
        )}
        {!audioAvisosActivo && permisoAvisos !== 'granted' && (
          <button onClick={activarAvisos} className="mt-3 text-xs font-semibold text-amber-400 text-left">
            Activa los avisos para recibir vibración, voz y notificaciones de cocina.
          </button>
        )}
        {mostrarAjustesAvisos && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
            <button
              type="button"
              onClick={() => cambiarPreferenciaAvisos('voz')}
              aria-pressed={preferenciasAvisos.voz}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                preferenciasAvisos.voz ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {preferenciasAvisos.voz ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              Voz {preferenciasAvisos.voz ? 'activada' : 'desactivada'}
            </button>
            <button
              type="button"
              onClick={() => cambiarPreferenciaAvisos('vibracion')}
              aria-pressed={preferenciasAvisos.vibracion}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                preferenciasAvisos.vibracion ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Vibrate className="w-4 h-4" />
              Vibración {preferenciasAvisos.vibracion ? 'activada' : 'desactivada'}
            </button>
          </div>
        )}
      </div>

      <SucursalFiltro />

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

      {/* Encargos de tortas: acceso directo (se cobran el abono y el saldo en Vender). */}
      {!cargando && empleado && (
        <div className="px-5 mb-3">
          <button onClick={() => navigate('/encargos')} className="w-full h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-[#fff] text-sm font-black flex items-center justify-center gap-2">
            🎂 Encargos de tortas
          </button>
        </div>
      )}
      {!cargando && empleado && menuDia && (
        <TarjetaAlmuerzo menu={menuDia} puedeEditar={puedePublicarAlmuerzo(menuDia, empleado)} onEditar={() => setEditorAlmuerzo(true)} />
      )}

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
              // Mesa vacía (ya la cobraron en caja) = libre, aunque quede un pedido viejo en «Listo».
              const comanda = ocupada ? comandasPorMesa[mesa.id] : undefined;
              // Mesa de otra mesera: se ve llena y no se puede usar hasta que
              // paguen en caja. El administrador sí puede entrar.
              const atiende = ocupada ? cuenta?.meseroNombre : undefined;
              const deOtro = !!atiende && !!empleado && atiende !== empleado.nombre_completo && !esAdmin;
              // Pedido marcado en este celular que todavía no se envió.
              const sinEnviar = !deOtro && !!leerBorrador(`codecpos_pedido_sin_enviar_${mesa.id}`)?.extras.length;
              return (
                <motion.button
                  key={mesa.id}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => {
                    if (deOtro) {
                      toast.info(`${mesa.nombre} la atiende ${atiende}`, { description: 'Se libera cuando paguen la cuenta en caja.' });
                      return;
                    }
                    void desbloquearAvisosPedidos().then(setAudioAvisosActivo); setMesaAbierta(mesa);
                  }}
                  className={`relative aspect-square rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border transition-all active:scale-95 ${
                    deOtro
                      ? 'bg-slate-900/70 border-red-500/40 opacity-70'
                      : comanda?.estado === 'listo'
                      ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/50'
                      : ocupada
                      ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-amber-500/50'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  {sinEnviar && (
                    <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase bg-red-600 text-[#fff] px-1.5 py-0.5 rounded-full animate-pulse">
                      Sin enviar
                    </span>
                  )}
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
                      {atiende
                        ? <p className={`text-[9px] font-bold truncate max-w-full ${deOtro ? 'text-red-400' : 'text-slate-400'}`}>{deOtro ? '🔒 ' : ''}{atiende.split(' ')[0]}</p>
                        : <p className="text-slate-500 text-[9px]">{items.length} ítem{items.length === 1 ? '' : 's'}</p>}
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

      <AnimatePresence>
        {alertaComanda && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed left-4 right-4 top-4 z-[80] mx-auto max-w-sm rounded-2xl border border-amber-300 bg-amber-50 p-4 text-slate-900 shadow-2xl"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-black">{alertaComanda.estado === 'listo' ? 'Pedido listo para servir' : 'Pedido en preparación'}</p>
                <p className="text-sm text-slate-600">{alertaComanda.mesaNombre || alertaComanda.mesaLocalId}</p>
              </div>
              <button type="button" onClick={() => setAlertaComanda(null)} className="text-xs font-bold text-slate-500">Cerrar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {flashAlerta && <div className="pointer-events-none fixed inset-0 z-[75] animate-pulse bg-amber-300/35" aria-hidden="true" />}

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
                estaciones={estaciones.filter((e) => e.activa)}
                aprendidas={aprendidas}
                onGuardar={(items, destinos, notas) => guardar(mesaAbierta, items, destinos, notas)}
                menuDia={menuDia}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {empleado && menuDia && puedePublicarAlmuerzo(menuDia, empleado) && (
        <EditorAlmuerzo
          abierto={editorAlmuerzo}
          clienteId={empleado.cliente_id}
          menu={menuDia}
          esAdmin={esAdmin}
          onCerrar={() => setEditorAlmuerzo(false)}
          onPublicado={() => { obtenerMenuDelDia(empleado.cliente_id).then(setMenuDia).catch(() => {}); void cargar(); }}
        />
      )}
    </div>
  );
}

// ── Cuenta de una mesa ───────────────────────────────────────────────────────

/** Notas de este envío: por producto (cómo lo quiere el cliente) y una general para la estación. */
type NotasPedido = { porProducto: Record<string, string>; general: string };

/** Pedido marcado y aún no enviado, guardado en el celular por mesa. */
type BorradorPedido = {
  ts: number;
  extras: Array<{ producto: ItemCuenta['producto']; extra: number; detalles?: ItemCuenta['detalles'] }>;
  destinos: Record<string, string | null>;
  notas: Record<string, string>;
  notaGeneral: string;
};
const BORRADOR_VIGENCIA_MS = 8 * 60 * 60 * 1000;

function leerBorrador(clave: string): BorradorPedido | null {
  try {
    const b = JSON.parse(localStorage.getItem(clave) || 'null') as BorradorPedido | null;
    if (!b || !Array.isArray(b.extras) || Date.now() - Number(b.ts) > BORRADOR_VIGENCIA_MS) {
      localStorage.removeItem(clave);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

/** Suma lo no enviado sobre la cuenta actual de la mesa (lo ya enviado manda). */
function aplicarBorrador(base: ItemCuenta[], borrador: BorradorPedido | null): ItemCuenta[] {
  if (!borrador?.extras.length) return base;
  const resultado = base.map((it) => ({ ...it }));
  for (const { producto, extra, detalles } of borrador.extras) {
    if (!producto?.id || !(extra > 0)) continue;
    const existente = resultado.find((it) => it.producto.id === producto.id);
    if (existente) {
      existente.cantidad += extra;
      if (detalles?.length) existente.detalles = detalles;
    } else resultado.push({ producto, cantidad: extra, ...(detalles?.length ? { detalles } : {}) });
  }
  return resultado;
}

/** Atajos de nota según el producto: los de huevo ofrecen cómo prepararlos. */
function atajosDeNota(p?: { nombre?: string; descripcion?: string }): string[] {
  const texto = `${p?.nombre || ''} ${p?.descripcion || ''}`.toLowerCase();
  const atajos: string[] = [];
  if (/huevo|desayuno|combo|calentado|omelet/.test(texto)) atajos.push('Pericos', 'Rancheros', 'Revueltos', 'Fritos', 'Cocidos');
  atajos.push('Sin cebolla', 'Sin salsa', 'Para llevar');
  return atajos;
}

function CuentaDeMesa({
  mesa, items: itemsIniciales, categorias, productos, estaciones, aprendidas, onCerrar, onGuardar, menuDia,
}: {
  mesa: PanaderiaMesa;
  items: ItemCuenta[];
  categorias: PanaderiaCategoria[];
  productos: PanaderiaProducto[];
  estaciones: Estacion[];
  aprendidas: Record<string, string | null>;
  onCerrar: () => void;
  onGuardar: (items: ItemCuenta[], destinos: Record<string, string | null>, notas: NotasPedido) => void;
  menuDia?: MenuDelDia | null;
}) {
  // 💾 Lo marcado y aún no enviado se guarda en el celular: si la página se recarga
  // sin querer (o se cierra la mesa), al volver a abrirla sigue ahí. Solo se guarda
  // lo nuevo (lo que suma sobre la cuenta ya enviada), por 8 horas.
  const claveBorrador = `codecpos_pedido_sin_enviar_${mesa.id}`;
  const [borrador] = useState<BorradorPedido | null>(() => leerBorrador(claveBorrador));
  const [items, setItems] = useState<ItemCuenta[]>(() => aplicarBorrador(itemsIniciales, borrador));
  // Notas de este envío: por producto nuevo y una general para la estación.
  const [notasProducto, setNotasProducto] = useState<Record<string, string>>(() => borrador?.notas || {});
  const [notaGeneral, setNotaGeneral] = useState(() => borrador?.notaGeneral || '');
  useEffect(() => {
    if (borrador?.extras.length) toast.info('Recuperamos lo que no se había enviado', { description: 'Revísalo y toca Enviar pedido.' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  // Pedido en burbujas: solo una se abre a la vez para no tapar el menú.
  const [itemAbierto, setItemAbierto] = useState<string | null>(null);
  const [notaGeneralAbierta, setNotaGeneralAbierta] = useState(false);
  const productoDe = (id: string) => productos.find((p) => p.id === id);
  /** Producto «ADICIONAL <atajo>» del menú (p. ej. ADICIONAL RANCHEROS $2.000), si existe. */
  const productoAdicionalDe = (atajo: string) => {
    const buscado = `adicional ${atajo}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    return productos.find((p) => p.nombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim() === buscado
      || p.nombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim() === buscado.replace(/^adicional /, 'adicional de '));
  };
  const alternarAtajo = (productoId: string, atajo: string) => setNotasProducto((prev) => {
    const partes = (prev[productoId] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const siguiente = partes.includes(atajo) ? partes.filter((x) => x !== atajo) : [...partes, atajo];
    return { ...prev, [productoId]: siguiente.join(', ') };
  });
  // Estación elegida para cada producto nuevo en este envío (null = solo cuenta).
  const [destinos, setDestinos] = useState<Record<string, string | null>>(() => borrador?.destinos || {});
  const hayEstaciones = estaciones.length > 0;
  // Cada cambio actualiza el borrador; sin nada pendiente se borra.
  useEffect(() => {
    const extras = items
      .map((it) => ({ producto: it.producto, extra: it.cantidad - (itemsIniciales.find((p) => p.producto.id === it.producto.id)?.cantidad || 0), ...(it.detalles?.length ? { detalles: it.detalles } : {}) }))
      .filter((x) => x.extra > 0);
    try {
      if (extras.length === 0) localStorage.removeItem(claveBorrador);
      else localStorage.setItem(claveBorrador, JSON.stringify({ ts: Date.now(), extras, destinos, notas: notasProducto, notaGeneral } satisfies BorradorPedido));
    } catch { /* sin almacenamiento: no se guarda */ }
  }, [items, itemsIniciales, destinos, notasProducto, notaGeneral, claveBorrador]);
  // 🔮 Predicción de estación para productos que nunca se han pedido: se aprende de
  // lo que el negocio ya hizo. Primero productos con el mismo nombre base
  // («AROMÁTICA DE FRUTAS» → «AROMÁTICA DE PANELA»), luego la estación más usada
  // en su categoría. Lo que el mesero confirme queda aprendido para ese producto.
  const prediccion = useMemo(() => {
    const valida = (id: string | null | undefined) => id === null || (!!id && estaciones.some((e) => e.id === id));
    const palabraBase = (nombre: string) => (nombre || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .split(/[^a-z0-9ñ]+/).find((w) => w.length >= 3 && !['de', 'del', 'con', 'los', 'las', 'para', 'por'].includes(w)) || '';
    const porPalabra = new Map<string, Map<string, number>>();
    const porCategoria = new Map<string, Map<string, number>>();
    const sumar = (mapa: Map<string, Map<string, number>>, clave: string, destino: string) => {
      if (!clave) return;
      const conteo = mapa.get(clave) || new Map<string, number>();
      conteo.set(destino, (conteo.get(destino) || 0) + 1);
      mapa.set(clave, conteo);
    };
    for (const p of productos) {
      const d = aprendidas[p.id];
      if (d === undefined || !valida(d)) continue;
      const clave = d === null ? 'solo' : d;
      sumar(porPalabra, palabraBase(p.nombre), clave);
      sumar(porCategoria, p.categoriaId || '', clave);
    }
    // Gana la estación con más productos, siempre que sea clara (más de la mitad).
    const ganador = (conteo?: Map<string, number>): string | null | undefined => {
      if (!conteo) return undefined;
      const total = [...conteo.values()].reduce((a, b) => a + b, 0);
      const [mejor, n] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      if (!mejor || n * 2 <= total) return undefined;
      return mejor === 'solo' ? null : mejor;
    };
    return (producto?: PanaderiaProducto): string | null | undefined => {
      if (!producto) return undefined;
      // «Solo cuenta» (null) también es una predicción válida: no se confunde con «no sé».
      const porNombre = ganador(porPalabra.get(palabraBase(producto.nombre)));
      return porNombre !== undefined ? porNombre : ganador(porCategoria.get(producto.categoriaId || ''));
    };
  }, [productos, aprendidas, estaciones]);

  const destinoDe = (productoId: string): string | null | undefined => {
    if (productoId in destinos) return destinos[productoId];
    const aprendida = aprendidas[productoId];
    if (aprendida === null) return null;
    if (aprendida && estaciones.some((e) => e.id === aprendida)) return aprendida;
    return prediccion(productos.find((p) => p.id === productoId));
  };
  // Lo que se va a enviar: productos nuevos o con más cantidad que lo guardado.
  const nuevos = useMemo(() => new Set(items
    .filter((it) => it.cantidad > (itemsIniciales.find((p) => p.producto.id === it.producto.id)?.cantidad || 0))
    .map((it) => it.producto.id)), [items, itemsIniciales]);
  const sinDestino = hayEstaciones ? [...nuevos].filter((id) => destinoDe(id) === undefined).length : 0;
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

  // 🍛 Almuerzo del día con opciones publicadas hoy: primero se eligen las opciones
  // y van como nota (una línea por almuerzo) a la estación.
  const [almuerzoPendiente, setAlmuerzoPendiente] = useState<PanaderiaProducto | null>(null);
  const [almuerzoEditando, setAlmuerzoEditando] = useState<{ n: number; texto: string } | null>(null);
  const productoAlmuerzo = (): PanaderiaProducto => productos.find((x) => x.id === ALMUERZO_PRODUCTO_ID)
    ?? ({ id: ALMUERZO_PRODUCTO_ID, nombre: 'ALMUERZO DEL DÍA', precio: menuDia?.precio || 0, categoriaId: '' } as PanaderiaProducto);
  /** Quita el almuerzo de una persona (y baja la cantidad). */
  const quitarAlmuerzo = (n: number) => setItems((prev) => prev
    .map((it) => (it.producto.id === ALMUERZO_PRODUCTO_ID
      ? { ...it, cantidad: it.cantidad - 1, detalles: (it.detalles ?? []).filter((d) => d.n !== n) }
      : it))
    .filter((it) => it.cantidad > 0));
  const menuDeHoy = !!menuDia && menuDia.fecha === hoyColombia() && menuDia.grupos.some((g) => g.opciones.length > 0);
  const agregar = (p: PanaderiaProducto) => {
    if (p.id === ALMUERZO_PRODUCTO_ID && menuDeHoy) { setAlmuerzoPendiente(p); return; }
    agregarDirecto(p);
  };
  const confirmarAlmuerzo = (texto: string, adicionales: AdicionalAlmuerzo[], seguir: boolean) => {
    const p = almuerzoPendiente;
    if (!seguir) setAlmuerzoPendiente(null);
    if (!p) return;
    const textoFinal = texto || 'Como viene';
    if (almuerzoEditando) {
      // Cambio de una persona: mismo número, lo nuevo que eligió.
      const n = almuerzoEditando.n;
      setAlmuerzoEditando(null);
      setItems((prev) => prev.map((it) => (it.producto.id === p.id
        ? { ...it, detalles: (it.detalles ?? []).map((d) => (d.n === n ? { ...d, texto: textoFinal } : d)) }
        : it)));
    } else {
      // Almuerzo nuevo: número siguiente al último de la mesa (incluye los ya enviados).
      const yaEsta = items.some((it) => it.producto.id === p.id);
      if (!yaEsta && hayEstaciones && destinoDe(p.id) === undefined) setItemAbierto(p.id);
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.producto.id === p.id);
        if (idx >= 0) {
          const it = prev[idx];
          const dets = it.detalles ?? [];
          const n = Math.max(it.cantidad, 0, ...dets.map((d) => d.n)) + 1;
          const copia = [...prev];
          copia[idx] = { ...it, cantidad: it.cantidad + 1, detalles: [...dets, { n, texto: textoFinal }] };
          return copia;
        }
        return [...prev, {
          producto: { id: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, codigo: p.codigo },
          cantidad: 1,
          detalles: [{ n: 1, texto: textoFinal }],
        }];
      });
    }
    // Los adicionales se cobran como productos aparte en la misma cuenta.
    for (const a of adicionales) {
      const id = idProductoAdicional(a.nombre);
      agregarDirecto(productos.find((x) => x.id === id) ?? ({ id, nombre: nombreProductoAdicional(a.nombre), precio: a.precio, categoriaId: p.categoriaId } as PanaderiaProducto));
    }
  };
  const agregarDirecto = (p: PanaderiaProducto) => {
    const yaEsta = items.some((it) => it.producto.id === p.id);
    if (!yaEsta && hayEstaciones && destinoDe(p.id) === undefined) setItemAbierto(p.id);
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
    const elegidos: Record<string, string | null> = {};
    for (const id of nuevos) { const d = destinoDe(id); if (d !== undefined) elegidos[id] = d; }
    const porProducto: Record<string, string> = {};
    for (const id of nuevos) if (notasProducto[id]?.trim()) porProducto[id] = notasProducto[id].trim();
    await onGuardar(items, elegidos, { porProducto, general: notaGeneral });
    try { localStorage.removeItem(claveBorrador); } catch { /* ignorar */ }
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

      {/* Pedido en burbujas: cada producto es una burbuja; al tocarla se abre su caja. */}
      {items.length > 0 && (() => {
        const abierto = items.find((it) => it.producto.id === itemAbierto);
        return (
          <div className="px-4 py-2.5 border-b border-slate-800 shrink-0">
            <div className="flex flex-wrap gap-1.5 max-h-[18vh] overflow-y-auto overflow-x-hidden">
              {items.map((it) => {
                const id = it.producto.id;
                const esNuevo = nuevos.has(id);
                const falta = hayEstaciones && esNuevo && destinoDe(id) === undefined;
                const est = estaciones.find((e) => e.id === destinoDe(id));
                const activo = itemAbierto === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setItemAbierto(activo ? null : id); setNotaAbierta(null); }}
                    className={`max-w-full min-w-0 h-9 pl-1.5 pr-3 rounded-full border flex items-center gap-1.5 text-xs font-bold transition-all ${
                      activo ? 'bg-amber-500 border-transparent text-[#fff]'
                        : falta ? 'bg-amber-500/10 border-amber-500 text-amber-300 animate-pulse'
                          : 'bg-slate-900 border-slate-700 text-slate-200'}`}
                  >
                    <span className={`min-w-6 h-6 px-1 rounded-full flex items-center justify-center text-[11px] font-black ${activo ? 'bg-white/25' : 'bg-slate-800 text-white'}`}>{it.cantidad}</span>
                    <span className="truncate">{it.producto.nombre}</span>
                    {esNuevo && notasProducto[id]?.trim() && <span className={activo ? '' : 'text-amber-400'}>✎</span>}
                    {est && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: est.color }} />}
                    {esNuevo && hayEstaciones && destinoDe(id) === null && <span className="text-[10px] opacity-70 shrink-0">cuenta</span>}
                  </button>
                );
              })}
            </div>

            {abierto && (() => {
              const it = abierto;
              const id = it.producto.id;
              const esNuevo = nuevos.has(id);
              return (
                <div className="mt-2 rounded-2xl border border-slate-700 bg-slate-900/80 p-3 space-y-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-bold leading-snug break-words">{it.producto.nombre}</p>
                      {esNuevo && productoDe(id)?.descripcion && (
                        <p className="text-slate-400 text-[11px] leading-snug">{productoDe(id)?.descripcion}</p>
                      )}
                      <p className="text-slate-500 text-xs">{money(it.producto.precio)} c/u · <span className="text-amber-400 font-bold">{money(it.producto.precio * it.cantidad)}</span></p>
                    </div>
                    <button onClick={() => setItemAbierto(null)} className="h-8 px-3 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold shrink-0">Listo</button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      if (id === ALMUERZO_PRODUCTO_ID && it.detalles?.length) { quitarAlmuerzo(Math.max(...it.detalles.map((d) => d.n))); if (it.cantidad <= 1) setItemAbierto(null); return; }
                      if (it.cantidad <= 1) setItemAbierto(null); cambiarCantidad(id, -1);
                    }}
                      className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center active:scale-90 transition-transform">
                      <Minus className="w-4 h-4 text-slate-300" />
                    </button>
                    <span className="text-white font-black text-base w-8 text-center tabular-nums">{it.cantidad}</span>
                    <button onClick={() => (id === ALMUERZO_PRODUCTO_ID && menuDeHoy ? agregar(productoAlmuerzo()) : cambiarCantidad(id, 1))}
                      className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="w-4 h-4 text-white" />
                    </button>
                    {esNuevo && (
                      <button
                        onClick={() => setNotaAbierta((a) => (a === id ? null : id))}
                        className={`h-10 px-3 rounded-xl text-xs font-bold border ${notasProducto[id]?.trim() ? 'bg-amber-500/20 border-amber-500/60 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                      >
                        {notasProducto[id]?.trim() ? 'Cambiar nota' : 'Nota'}
                      </button>
                    )}
                    <button onClick={() => { quitar(id); setItemAbierto(null); }} className="ml-auto w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {id === ALMUERZO_PRODUCTO_ID && !!it.detalles?.length && (
                    <div className="space-y-1.5">
                      {it.detalles.map((d) => (
                        <div key={d.n} className="rounded-xl bg-slate-950 border border-slate-800 p-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-xs font-black">Almuerzo {d.n}</p>
                            <p className="text-slate-400 text-[11px] leading-snug whitespace-pre-line break-words">{d.texto}</p>
                          </div>
                          {menuDeHoy && (
                            <button
                              onClick={() => { setAlmuerzoEditando(d); setAlmuerzoPendiente(productoAlmuerzo()); }}
                              className="h-8 px-2.5 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-bold shrink-0"
                            >
                              Cambiar
                            </button>
                          )}
                          <button onClick={() => quitarAlmuerzo(d.n)} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-red-400 shrink-0" aria-label={`Quitar almuerzo ${d.n}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {esNuevo && notasProducto[id]?.trim() && notaAbierta !== id && (
                    <button onClick={() => setNotaAbierta(id)} className="block text-left text-amber-300 text-xs font-semibold break-words">
                      Nota: {notasProducto[id]}
                    </button>
                  )}

                  {esNuevo && notaAbierta === id && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {atajosDeNota(productoDe(id)).map((a) => {
                          const marcado = (notasProducto[id] || '').split(',').map((x) => x.trim()).includes(a);
                          // Atajo con costo: si existe «ADICIONAL <atajo>» en el menú, se cobra aparte.
                          const extra = productoAdicionalDe(a);
                          return (
                            <button key={a}
                              onClick={() => {
                                alternarAtajo(id, a);
                                setNotaAbierta(null);
                                if (extra) {
                                  if (!marcado) agregarDirecto(extra);
                                  else if (items.some((it) => it.producto.id === extra.id)) cambiarCantidad(extra.id, -1);
                                }
                              }}
                              className={`h-8 px-3 rounded-full text-xs font-bold border ${marcado ? 'bg-amber-500 border-transparent text-[#fff]' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>
                              {a}{extra ? <span className={marcado ? '' : 'text-amber-400'}> +{money(extra.precio)}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      <Input
                        value={notasProducto[id] || ''}
                        onChange={(e) => setNotasProducto((prev) => ({ ...prev, [id]: e.target.value.slice(0, 160) }))}
                        placeholder="Ej: 1 pericos y 1 rancheros, sin cebolla"
                        className="h-9 bg-slate-950 border-slate-700 text-white text-sm placeholder:text-slate-600"
                      />
                    </div>
                  )}

                  {hayEstaciones && esNuevo && (
                    <div>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1">¿A dónde va?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {estaciones.map((e) => {
                          const elegido = destinoDe(id) === e.id;
                          return (
                            <button
                              key={e.id}
                              onClick={() => { setDestinos((prev) => ({ ...prev, [id]: e.id })); if (notaAbierta !== id) setItemAbierto(null); }}
                              className={`h-9 px-3 rounded-full text-xs font-bold border transition-all ${elegido ? 'text-[#fff] border-transparent' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
                              style={elegido ? { background: e.color } : undefined}
                            >
                              {e.nombre}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setDestinos((prev) => ({ ...prev, [id]: null })); if (notaAbierta !== id) setItemAbierto(null); }}
                          className={`h-9 px-3 rounded-full text-xs font-bold border transition-all ${destinoDe(id) === null ? 'bg-slate-200 text-slate-900 border-transparent' : 'bg-slate-950 border-slate-700 text-slate-400'}`}
                        >
                          Solo cuenta
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

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

      <ElegirAlmuerzo
        abierto={!!almuerzoPendiente}
        menu={menuDia ?? null}
        onCerrar={() => { setAlmuerzoPendiente(null); setAlmuerzoEditando(null); }}
        onElegir={confirmarAlmuerzo}
        editando={almuerzoEditando}
      />

      {/* Enviar */}
      <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950 shrink-0 space-y-2">
        {nuevos.size > 0 && (notaGeneralAbierta || notaGeneral) ? (
          <Input
            autoFocus={notaGeneralAbierta && !notaGeneral}
            value={notaGeneral}
            onChange={(e) => setNotaGeneral(e.target.value.slice(0, 200))}
            onBlur={() => { if (!notaGeneral.trim()) setNotaGeneralAbierta(false); }}
            placeholder="Nota para la estación"
            className="h-10 bg-slate-900 border-slate-700 text-white text-sm placeholder:text-slate-600"
          />
        ) : nuevos.size > 0 ? (
          <button onClick={() => setNotaGeneralAbierta(true)} className="text-slate-400 text-xs font-bold">
            + Nota para la estación
          </button>
        ) : null}
        <Button
          onClick={enviar}
          disabled={enviando || !sucio || sinDestino > 0}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50 flex items-center justify-between px-4"
        >
          <span className="flex items-center min-w-0">
            {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin shrink-0" /> : <Check className="w-5 h-5 mr-2 shrink-0" />}
            <span className="truncate">
              {enviando
                ? 'Enviando…'
                : !sucio
                  ? 'Sin cambios'
                  : sinDestino > 0
                    ? `Elige a dónde va ${sinDestino === 1 ? '1 producto' : `${sinDestino} productos`}`
                    : hayEstaciones ? 'Enviar pedido' : 'Enviar a caja y cocina'}
            </span>
          </span>
          <span className="tabular-nums font-black shrink-0 ml-2">{money(total)}</span>
        </Button>
      </div>
    </>
  );
}
