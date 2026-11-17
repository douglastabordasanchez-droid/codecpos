/**
 * Recetario de Alimentos y Bebidas en la nube (migración 0155).
 *
 * Ingredientes, recetas, líneas de receta y combos se guardaban solo en el
 * localStorage de cada caja. Aquí se sube un documento por negocio y cada
 * caja lo baja al arrancar y cada pocos minutos.
 *
 * Reglas de mezcla:
 * - Ingredientes: por id (o por nombre si el id no coincide). La definición
 *   (nombre, unidad, costo, mínimo, categoría) gana la más reciente.
 * - Stock: lo que descuentan las ventas es de cada equipo. Solo viaja el stock
 *   ajustado a mano (`stockAjustadoEn`), y gana el ajuste más reciente.
 * - Recetas y combos: gana el lado que se cambió de último.
 * - Borrados: la lista `eliminados` quita el ingrediente en todas las cajas.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import { idEsteEquipo } from './terminalPrincipalService';
import {
  CLAVE_CAMBIO_LOCAL,
  CLAVE_ELIMINADOS,
  CLAVES_RECETARIO,
  EVENTO_RECETARIO_ACTUALIZADO,
} from '../recetarioLocal';

const CLAVE_NUBE_TS = 'codecpos_recetario_nube_ts';
const CLAVE_SUBIDO = 'codecpos_recetario_subido';
/** De qué negocio es el recetario guardado en este equipo (nunca se mezclan). */
const CLAVE_NEGOCIO = 'codecpos_recetario_negocio';

type Ing = Record<string, any> & { id: string; nombre: string };
type Fila = Record<string, any> & { id: string };

export interface DocRecetario {
  ingredientes: Ing[];
  recetas: Fila[];
  lineas: Fila[];
  combos: Fila[];
  eliminados: string[];
  updated_at?: string;
}

const leer = <T,>(clave: string, def: T): T => {
  try { const raw = localStorage.getItem(clave); return raw ? (JSON.parse(raw) as T) : def; } catch { return def; }
};
const escribir = (clave: string, valor: unknown) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* storage lleno */ }
};
const num = (v: unknown) => Number(v) || 0;
const claveNombre = (t: unknown) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function docLocal(): DocRecetario {
  return {
    ingredientes: leer<Ing[]>(CLAVES_RECETARIO.ingredientes, []),
    recetas: leer<Fila[]>(CLAVES_RECETARIO.recetas, []),
    lineas: leer<Fila[]>(CLAVES_RECETARIO.lineas, []),
    combos: leer<Fila[]>(CLAVES_RECETARIO.combos, []),
    eliminados: leer<string[]>(CLAVE_ELIMINADOS, []),
  };
}

const hayCambiosSinSubir = () => num(localStorage.getItem(CLAVE_CAMBIO_LOCAL)) > num(localStorage.getItem(CLAVE_SUBIDO));

/** Mezcla el documento de la nube con lo local. Devuelve el resultado y si quedó algo que solo existe aquí. */
export function mezclar(nube: DocRecetario, local: DocRecetario, manda: 'local' | 'nube' | 'union'): { doc: DocRecetario; soloLocal: boolean } {
  const eliminados = [...new Set([...(nube.eliminados || []), ...(local.eliminados || [])])].slice(-1000);
  const borrado = new Set(eliminados);

  const porId = new Map<string, Ing>();
  for (const l of local.ingredientes) if (!borrado.has(l.id)) porId.set(l.id, { ...l });
  const porNombre = new Map<string, string>();
  for (const l of porId.values()) porNombre.set(claveNombre(l.nombre), l.id);

  // Ids locales que pasan a ser el de la nube (mismo nombre, otro id).
  const renombrar = new Map<string, string>();
  for (const c of nube.ingredientes || []) {
    if (borrado.has(c.id)) continue;
    let l = porId.get(c.id);
    if (!l) {
      const idMismoNombre = porNombre.get(claveNombre(c.nombre));
      if (idMismoNombre && idMismoNombre !== c.id) {
        l = porId.get(idMismoNombre);
        porId.delete(idMismoNombre);
        renombrar.set(idMismoNombre, c.id);
      }
    }
    if (!l) { porId.set(c.id, { ...c }); continue; }
    const definicion = num(c.updatedAt) > num(l.updatedAt) ? { ...l, ...c } : { ...c, ...l };
    const stockNube = num(c.stockAjustadoEn) > num(l.stockAjustadoEn);
    porId.set(c.id, {
      ...definicion,
      id: c.id,
      stockActual: stockNube ? c.stockActual : l.stockActual,
      stockAjustadoEn: stockNube ? c.stockAjustadoEn : l.stockAjustadoEn,
    });
  }
  const idsNube = new Set((nube.ingredientes || []).map((c) => c.id));
  const soloLocal = [...porId.keys()].some((id) => !idsNube.has(id));

  const remap = (id: unknown) => renombrar.get(String(id)) || String(id);
  const elegir = (deLocal: Fila[], deNube: Fila[] = []): Fila[] => {
    if (manda === 'local') return deLocal;
    if (manda === 'nube') return deNube;
    const ids = new Set(deNube.map((f) => f.id));
    return [...deNube, ...deLocal.filter((f) => !ids.has(f.id))];
  };
  const recetas = elegir(local.recetas, nube.recetas);
  const lineas = elegir(local.lineas, nube.lineas).map((l) => ({ ...l, ingredientId: remap(l.ingredientId) }));
  const combos = elegir(local.combos, nube.combos).map((c) => ({
    ...c,
    componentes: Array.isArray(c.componentes)
      ? c.componentes.map((k: any) => (k?.tipo === 'ingrediente' ? { ...k, refId: remap(k.refId) } : k))
      : c.componentes,
  }));

  return {
    doc: { ingredientes: [...porId.values()], recetas, lineas, combos, eliminados },
    soloLocal: soloLocal || renombrar.size > 0,
  };
}

function aplicarLocal(doc: DocRecetario) {
  escribir(CLAVES_RECETARIO.ingredientes, doc.ingredientes);
  escribir(CLAVES_RECETARIO.recetas, doc.recetas);
  escribir(CLAVES_RECETARIO.lineas, doc.lineas);
  escribir(CLAVES_RECETARIO.combos, doc.combos);
  escribir(CLAVE_ELIMINADOS, doc.eliminados);
  window.dispatchEvent(new Event(EVENTO_RECETARIO_ACTUALIZADO));
}

async function traerNube(): Promise<DocRecetario | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;
  const { data, error } = await client
    .from('panaderia_recetario')
    .select('ingredientes, recetas, lineas, combos, eliminados, updated_at')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw error;
  return (data as DocRecetario | null) ?? null;
}

async function subir(doc: DocRecetario): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;
  const marcaCambio = localStorage.getItem(CLAVE_CAMBIO_LOCAL) || String(Date.now());
  const { data, error } = await client
    .from('panaderia_recetario')
    .upsert({
      cliente_id: clienteId,
      ingredientes: doc.ingredientes,
      recetas: doc.recetas,
      lineas: doc.lineas,
      combos: doc.combos,
      eliminados: doc.eliminados,
      equipo_id: idEsteEquipo(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cliente_id' })
    .select('updated_at')
    .single();
  if (error) throw error;
  localStorage.setItem(CLAVE_NUBE_TS, String((data as any)?.updated_at || ''));
  localStorage.setItem(CLAVE_SUBIDO, marcaCambio);
}

let enCurso: Promise<void> | null = null;

/**
 * Baja el recetario de la nube, lo mezcla con lo local y sube el resultado si
 * aquí había cambios. Se puede llamar seguido: si ya hay una vuelta en curso,
 * espera esa.
 */
export function sincronizarRecetario(): Promise<void> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const clienteId = getLinkedClienteId();
    if (!clienteId) return;
    const nube = await traerNube();

    // Si el recetario de este equipo es de OTRO negocio, se descarta sin subirlo.
    const negocio = localStorage.getItem(CLAVE_NEGOCIO);
    if (negocio && negocio !== clienteId) {
      for (const clave of [CLAVE_NUBE_TS, CLAVE_SUBIDO, CLAVE_CAMBIO_LOCAL]) localStorage.removeItem(clave);
      aplicarLocal(nube
        ? { ingredientes: nube.ingredientes || [], recetas: nube.recetas || [], lineas: nube.lineas || [], combos: nube.combos || [], eliminados: nube.eliminados || [] }
        : { ingredientes: [], recetas: [], lineas: [], combos: [], eliminados: [] });
      localStorage.setItem(CLAVE_NEGOCIO, clienteId);
      if (nube) localStorage.setItem(CLAVE_NUBE_TS, String(nube.updated_at || ''));
      return;
    }
    localStorage.setItem(CLAVE_NEGOCIO, clienteId);

    const local = docLocal();
    const pendientes = hayCambiosSinSubir();

    if (!nube) {
      if (local.ingredientes.length || local.recetas.length || local.combos.length) await subir(local);
      return;
    }

    const yaVista = localStorage.getItem(CLAVE_NUBE_TS) || '';
    const nubeNueva = String(nube.updated_at || '') !== yaVista;
    if (!nubeNueva && !pendientes) return;

    // Recetas y combos: gana lo local si se cambió aquí después de lo último que se vio de la nube.
    const cambioLocal = num(localStorage.getItem(CLAVE_CAMBIO_LOCAL));
    const tsNube = Date.parse(String(nube.updated_at || '')) || 0;
    // La primera vez que este equipo ve la nube se juntan las dos partes.
    const manda = !yaVista ? 'union' : pendientes && cambioLocal >= tsNube ? 'local' : 'nube';

    const { doc, soloLocal } = mezclar(nube, local, manda);
    aplicarLocal(doc);
    localStorage.setItem(CLAVE_NUBE_TS, String(nube.updated_at || ''));
    const recetasNuevas = manda === 'union' && (doc.recetas.length !== (nube.recetas || []).length || doc.combos.length !== (nube.combos || []).length);
    if (pendientes || soloLocal || recetasNuevas) await subir(doc);
  })().finally(() => { enCurso = null; });
  return enCurso;
}
