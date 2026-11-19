/**
 * Trae a Electron lo que el equipo hizo desde el celular.
 *
 * El camino de ida (Electron → nube) es explícito: el dueño publica los datos
 * desde Configuración → Módulos en la App Web. El de vuelta tiene que ser
 * automático, porque nadie va a estar pulsando «actualizar» en la caja
 * mientras el mesero toma pedidos o el técnico mueve órdenes.
 *
 * Se monta una sola vez, en ProtectedLayout, para que funcione aunque la
 * pantalla del módulo no esté abierta — igual que los handlers de la LAN.
 * Reutiliza los MISMOS eventos de ventana que ya dispara LanContext
 * (`lan:taller-estado-cambio`), así que el Kanban y el salón se refrescan
 * solos sin tocar esas pantallas.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { tallerService } from '../services/tallerService';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { useAuth } from '../contexts/AuthContext';
import { useMultitienda } from '../contexts/MultitiendaContext';
import { playTallerAlertSound } from '../lib/tallerAlertSound';
import {
  pullOrdenesTallerDesdePwa,
  suscribirCambiosTallerPwa,
  reintentarPendientesTaller,
  pushInicialTaller,
  type OrdenRemota,
} from '../lib/supabase/tallerSyncService';
import {
  suscribirCuentasMesa,
  esEcoPropioDeMesa,
  obtenerCuentasMesa,
  guardarCuentaMesa,
  type CuentaMesa,
} from '../lib/supabase/panaderiaSyncService';
import { cambioLocalDeMesa } from '../lib/cambiosMesaLocal';
import { sincronizarRecetario } from '../lib/supabase/recetarioNube';
import { EVENTO_RECETARIO_CAMBIO } from '../lib/recetarioLocal';
import { esModuloActivoGlobal, ModuloPOS } from '../lib/permissions';

const STORAGE_CUENTAS_MESAS = 'codecpos_mesas_cuentas';
const TALLER_PULL_INTERVAL_MS = 30000;

export function useSyncModulosNube() {
  const { usuarioActual } = useAuth();
  // 🏪 Sucursal en la que está "parada" ESTA terminal ahora mismo (Multi-Tienda).
  // Sin filtrar por ella, esta caja recibía por Realtime -- y sonaba la
  // alerta de "comanda recibida"-- las cuentas de mesa de OTRA sucursal del
  // mismo negocio, aunque físicamente nunca la sirviera.
  const { tiendaActual } = useMultitienda();
  const tiendaActivaId = tiendaActual && tiendaActual.id !== 'tienda_principal' ? tiendaActual.id : null;

  useEffect(() => {
    const clienteId = getLinkedClienteId();
    if (!isSupabaseConfigured() || !clienteId) return;

    // 🚀 FIX rendimiento: este hook se monta una sola vez en ProtectedLayout
    // — es decir, para TODO negocio, use o no Taller/Panadería. Antes hacía
    // el pull de Taller y se suscribía a Panadería sin preguntar, así que
    // un negocio que nunca activó esos módulos pagaba ese costo de red/CPU
    // igual que uno que sí los usa. Ahora cada bloque solo arranca si su
    // módulo está realmente activo (mismo gate que usa el resto del
    // sistema) — un negocio con esos módulos activos ve exactamente el
    // mismo comportamiento de siempre.
    const tallerActivo = esModuloActivoGlobal(ModuloPOS.TALLER_REPARACIONES);
    const panaderiaActivo = esModuloActivoGlobal(ModuloPOS.PANADERIA_ONCES);
    // Inventario por sede (0153): la caja sabe si el negocio comparte catálogo entre sedes.
    void import('../lib/inventarioSede').then(({ obtenerInventarioUniversal }) => obtenerInventarioUniversal(clienteId)).catch(() => {});
    if (!tallerActivo && !panaderiaActivo) return;

    let cancelado = false;
    let intervaloTaller: ReturnType<typeof window.setInterval> | null = null;
    let desuscribirTaller: (() => void) | null = null;
    let desuscribirCuentas: (() => void) | null = null;
    let intervaloCuentas: ReturnType<typeof window.setInterval> | null = null;
    let alVolverInternet: (() => void) | null = null;
    let intervaloRecetario: number | null = null;
    let esperaRecetario: number | null = null;
    let alCambiarRecetario: (() => void) | null = null;

    // ── Taller: aplicar una orden que llegó de otra caja o del celular ───────
    const miNombre = (usuarioActual?.nombreCompleto || '').trim().toLowerCase();
    const esMia = (o: OrdenRemota) => !!miNombre && (o.tecnicoAsignado || '').trim().toLowerCase() === miNombre;

    /** `avisar` = false en los pulls grandes: se resume en un solo aviso. */
    const aplicarOrden = async (orden: OrdenRemota, avisar = true) => {
      if (cancelado) return 'ignorada' as const;
      try {
        await tallerService.init();
        const antes = await tallerService.obtenerOrden(orden.id);
        const resultado = await tallerService.upsertOrdenRemota(orden);
        if (resultado === 'igual' || resultado === 'ignorada') return resultado;
        window.dispatchEvent(new CustomEvent('lan:taller-estado-cambio', { detail: orden }));
        if (!avisar) return resultado;

        const meLaAsignaron = esMia(orden) && (!antes || !esMia(antes as OrdenRemota));
        if (resultado === 'eliminada') {
          toast(`Taller · Orden ${orden.numeroOrden} eliminada`, { duration: 5000 });
        } else if (meLaAsignaron) {
          playTallerAlertSound();
          toast.success(`🔧 Nueva reparación asignada a ti · Orden ${orden.numeroOrden}`, {
            description: [orden.dispositivo?.marca, orden.dispositivo?.modelo, orden.cliente?.nombre].filter(Boolean).join(' · ') || undefined,
            duration: 10000,
          });
        } else if (resultado === 'nueva') {
          toast(`Taller · Nueva orden ${orden.numeroOrden}`, {
            description: orden.tecnicoAsignado ? `Asignada a ${orden.tecnicoAsignado}` : 'Sin técnico asignado',
            duration: 5000,
          });
        } else {
          const estado = orden.estado.replace(/_/g, ' ');
          toast(`Taller · Orden ${orden.numeroOrden}`, { description: `Actualizada · ${estado}`, duration: 4000 });
        }
        return resultado;
      } catch (e) {
        console.warn('[SyncNube] No se pudo aplicar la orden recibida:', e);
        return 'ignorada' as const;
      }
    };

    let alVolverInternetTaller: (() => void) | null = null;

    if (tallerActivo) {
      let enCurso = false;
      const cicloTaller = async () => {
        if (cancelado || enCurso || !navigator.onLine) return;
        enCurso = true;
        try {
          // 1. Subir lo de este equipo que quedó sin subir (sin internet).
          await reintentarPendientesTaller((id) => tallerService.obtenerOrden(id))
            .catch((e) => console.warn('[SyncNube] Reintento de taller falló:', e));
          // 2. Una sola vez por equipo: subir las órdenes que ya existían.
          await pushInicialTaller(() => tallerService.obtenerTodasOrdenes())
            .catch((e) => console.warn('[SyncNube] Subida inicial de taller falló:', e));
          // 3. Bajar lo que hicieron los demás.
          const ordenes = await pullOrdenesTallerDesdePwa();
          const avisarUna = ordenes.length <= 3;
          let nuevas = 0;
          let cambiadas = 0;
          for (const o of ordenes) {
            const r = await aplicarOrden(o, avisarUna);
            if (r === 'nueva') nuevas++;
            else if (r === 'actualizada' || r === 'eliminada') cambiadas++;
          }
          if (!avisarUna && nuevas + cambiadas > 0) {
            const asignadas = ordenes.filter(esMia).length;
            if (asignadas > 0) playTallerAlertSound();
            toast(`Taller al día: ${nuevas} orden(es) nueva(s) y ${cambiadas} actualizada(s)`, {
              description: asignadas > 0 ? `${asignadas} asignada(s) a ti` : undefined,
              duration: 6000,
            });
          }
        } catch (e) {
          console.warn('[SyncNube] Sync de taller falló:', e);
        } finally {
          enCurso = false;
        }
      };

      // Al arrancar: recuperar lo que pasó mientras el equipo estaba cerrado.
      void cicloTaller();
      // 🛡️ Red de seguridad además del tiempo real: por si el canal se cae sin que nadie lo note.
      intervaloTaller = window.setInterval(() => void cicloTaller(), TALLER_PULL_INTERVAL_MS);
      alVolverInternetTaller = () => { window.setTimeout(() => void cicloTaller(), 1500); };
      window.addEventListener('online', alVolverInternetTaller);

      desuscribirTaller = suscribirCambiosTallerPwa((o) => { void aplicarOrden(o); });
    }

    // ── Panadería: cuenta de mesa enviada por un mesero U OTRA CAJA ──────────
    if (panaderiaActivo) {
      const aplicarCuenta = (cuenta: CuentaMesa, avisar = true) => {
        try {
          const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS);
          const mapa: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
          mapa[cuenta.mesaLocalId] = cuenta.items;
          localStorage.setItem(STORAGE_CUENTAS_MESAS, JSON.stringify(mapa));
          // Quién atiende la mesa: sale en la tirilla como «Atendido por».
          try {
            const meseros = JSON.parse(localStorage.getItem('codecpos_mesas_mesero') || '{}');
            if (cuenta.items.length > 0 && cuenta.meseroNombre) meseros[cuenta.mesaLocalId] = cuenta.meseroNombre;
            if (cuenta.items.length === 0) delete meseros[cuenta.mesaLocalId];
            localStorage.setItem('codecpos_mesas_mesero', JSON.stringify(meseros));
          } catch { /* ignorar */ }

          // La pantalla de Panadería escucha esto para repintar el salón.
          window.dispatchEvent(new CustomEvent('codecpos:panaderia-cuentas-sincronizadas', {
            detail: { mesaId: cuenta.mesaLocalId, items: cuenta.items },
          }));

          if (avisar && cuenta.items.length > 0) {
            toast.success(`Comanda recibida — Mesa ${cuenta.mesaLocalId}`, {
              description: `${cuenta.items.length} ítem(s) · $${Math.round(cuenta.total).toLocaleString('es-CO')}`
                + (cuenta.meseroNombre ? ` · ${cuenta.meseroNombre}` : ''),
              duration: 7000,
            });
          }
        } catch (e) {
          console.warn('[SyncNube] No se pudo aplicar la comanda recibida:', e);
        }
      };

      desuscribirCuentas = suscribirCuentasMesa(clienteId, (cuenta: CuentaMesa) => {
        if (cancelado) return;
        // Ignorar el reflejo del propio guardado — antes se ignoraba TODO lo
        // que no viniera marcado 'pwa', lo que también bloqueaba enterarse de
        // cambios hechos desde otra caja Electron.
        if (esEcoPropioDeMesa(cuenta.mesaLocalId)) return;
        aplicarCuenta(cuenta);
      }, tiendaActivaId);

      // 🛡️ Red de seguridad: el aviso en vivo se pierde si la caja no tenía internet en
      // ese momento (pedidos de los celulares que nunca llegaron al punto de venta, Tierra
      // Colombiana 2026-11-16). Al abrir, al volver internet y cada minuto se compara con
      // la nube: se trae la cuenta que en la nube sea más nueva que el último cambio hecho
      // en esta caja (lo que la caja cambió sin internet no se pisa).
      // Sin solaparse: con internet lento una revisión puede tardar más de un
      // minuto y antes se apilaban, dejando la terminal cada vez más pesada.
      let cuentasEnCurso = false;
      const pullCuentas = async () => {
        if (cancelado || cuentasEnCurso || !navigator.onLine) return;
        cuentasEnCurso = true;
        try {
          const nube = await obtenerCuentasMesa(clienteId, tiendaActivaId ?? undefined);
          const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS);
          const mapa: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
          let traidas = 0;
          for (const cuenta of nube) {
            const local = mapa[cuenta.mesaLocalId] || [];
            // Igual si tienen los mismos productos y cantidades (la caja completa
            // campos del producto al abrir la cuenta; eso no es una diferencia).
            const huella = (items: any[]) => JSON.stringify((Array.isArray(items) ? items : [])
              .map((it) => `${it?.producto?.id}:${Number(it?.cantidad) || 0}`));
            if (huella(local as any[]) === huella(cuenta.items as any[])) continue;
            const enNube = Date.parse(cuenta.updatedAt) || 0;
            if (enNube <= cambioLocalDeMesa(cuenta.mesaLocalId)) {
              // La caja la cambió después (por ejemplo, sin internet): se sube su versión.
              let mesero: string | undefined;
              let tienda: string | null = null;
              try { mesero = JSON.parse(localStorage.getItem('codecpos_mesas_mesero') || '{}')[cuenta.mesaLocalId] || undefined; } catch { /* ignorar */ }
              try { tienda = (JSON.parse(localStorage.getItem('codecpos_mesas_config') || '[]') as any[]).find((m) => m.id === cuenta.mesaLocalId)?.tiendaId || null; } catch { /* ignorar */ }
              const items = (local as any[]).map((it) => ({
                producto: { id: it.producto?.id, nombre: it.producto?.nombre, precio: Number(it.producto?.precio) || 0, codigo: it.producto?.codigo },
                cantidad: Number(it.cantidad) || 0,
                // Almuerzos numerados del celular: se conservan.
                ...(Array.isArray(it.detalles) && it.detalles.length ? { detalles: it.detalles } : {}),
              }));
              void guardarCuentaMesa(clienteId, cuenta.mesaLocalId, items as any, 'electron', mesero, tienda).catch(() => {});
              continue;
            }
            aplicarCuenta(cuenta, false);
            if (cuenta.items.length > 0) traidas++;
          }
          if (traidas > 0) toast.info(`Se recuperaron ${traidas} pedido(s) de mesa que llegaron mientras no había internet`);
        } catch (e) {
          console.warn('[SyncNube] No se pudieron revisar las cuentas de mesa:', e);
        } finally {
          cuentasEnCurso = false;
        }
      };
      void pullCuentas();
      intervaloCuentas = window.setInterval(() => void pullCuentas(), 60_000);
      alVolverInternet = () => { window.setTimeout(() => void pullCuentas(), 1500); };
      window.addEventListener('online', alVolverInternet);

      // ── Recetario (ingredientes, recetas y combos) en la nube, 0155 ──────────
      let recetarioEnCurso = false;
      const syncRecetario = () => {
        if (cancelado || recetarioEnCurso || !navigator.onLine) return;
        recetarioEnCurso = true;
        sincronizarRecetario()
          .catch((e) => console.warn('[SyncNube] Recetario:', e))
          .finally(() => { recetarioEnCurso = false; });
      };
      syncRecetario();
      intervaloRecetario = window.setInterval(syncRecetario, 180_000);
      // Lo que se cambie aquí se sube a los pocos segundos (agrupando varios cambios seguidos).
      alCambiarRecetario = () => {
        if (esperaRecetario !== null) window.clearTimeout(esperaRecetario);
        esperaRecetario = window.setTimeout(syncRecetario, 4000);
      };
      window.addEventListener(EVENTO_RECETARIO_CAMBIO, alCambiarRecetario);
      window.addEventListener('online', alCambiarRecetario);
    }

    return () => {
      cancelado = true;
      if (intervaloTaller !== null) window.clearInterval(intervaloTaller);
      if (alVolverInternetTaller) window.removeEventListener('online', alVolverInternetTaller);
      desuscribirTaller?.();
      desuscribirCuentas?.();
      if (intervaloCuentas !== null) window.clearInterval(intervaloCuentas);
      if (alVolverInternet) window.removeEventListener('online', alVolverInternet);
      if (intervaloRecetario !== null) window.clearInterval(intervaloRecetario);
      if (esperaRecetario !== null) window.clearTimeout(esperaRecetario);
      if (alCambiarRecetario) {
        window.removeEventListener(EVENTO_RECETARIO_CAMBIO, alCambiarRecetario);
        window.removeEventListener('online', alCambiarRecetario);
      }
    };
  }, [usuarioActual?.nombreCompleto, tiendaActivaId]);
}
