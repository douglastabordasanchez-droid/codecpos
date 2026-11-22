/**
 * Conexión remota de soporte (migración 0167).
 *
 * El equipo de Codec deja una orden en soporte_comandos desde el panel y esta
 * caja la toma, la ejecuta y escribe el resultado. Sirve para revisar y
 * reparar un PC ya instalado sin compilar de nuevo ni entrar por TeamViewer.
 *
 * Solo se ejecutan las acciones de esta lista; nunca código que llegue de la
 * nube. Antes de restaurar se guarda un respaldo del estado actual, y no se
 * restaura un archivo más viejo que lo que hay en el PC salvo que la orden
 * diga forzar.
 */
import { getSupabaseClient } from './supabase/config';
import { getLinkedClienteId } from './supabase/tenantLink';
import { comprimirJson, descomprimirBlob } from './supabase/backupCloudService';
import { backupService } from './backupService';
import { dbManager } from './indexedDB';
import { logger } from './logger';

const BUCKET = 'respaldos-nube';
const INTERVALO_MS = 60_000;

type Comando = {
  id: string;
  cliente_id: string;
  machine_id: string | null;
  accion: string;
  parametros: Record<string, any>;
  estado: string;
};

let machineId: string | null = null;
let ocupado = false;
let canalActivo: { clienteId: string; quitar: () => void } | null = null;

async function miMachineId(): Promise<string> {
  if (machineId) return machineId;
  try { machineId = String(await (window as any).electron?.getMachineId?.() || ''); } catch { machineId = ''; }
  return machineId || '';
}

function tamanoLocalStorage(): { claves: number; bytes: number; grandes: Array<{ clave: string; bytes: number }>; archivados: Record<string, number> } {
  const grandes: Array<{ clave: string; bytes: number }> = [];
  const archivados: Record<string, number> = {};
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i) || '';
    const largo = (localStorage.getItem(clave) || '').length;
    bytes += largo + clave.length;
    grandes.push({ clave, bytes: largo });
    // Datos de otra empresa guardados aparte al cambiar de negocio (tenantSwap).
    const m = clave.match(/^codec_pos_tenant__([^_]+(?:-[^_]+)*)__/);
    if (m) archivados[m[1]] = (archivados[m[1]] || 0) + 1;
  }
  grandes.sort((a, b) => b.bytes - a.bytes);
  return { claves: localStorage.length, bytes, grandes: grandes.slice(0, 40), archivados };
}

async function diagnostico() {
  const electron = (window as any).electron;
  const [productos, ventas, usuarios] = await Promise.all([
    dbManager.getAllProductos().catch(() => []),
    dbManager.getAllVentas().catch(() => []),
    dbManager.getAllUsuarios().catch(() => []),
  ]);
  const ultimaVenta = (ventas as any[]).reduce((max, v) => (String(v.fecha || '') > String(max?.fecha || '') ? v : max), null as any);
  let basesIndexedDB: any[] = [];
  try { basesIndexedDB = (await (indexedDB as any).databases?.()) || []; } catch { /* no disponible */ }
  let respaldosBlindados: any[] = [];
  try { respaldosBlindados = await backupService.listSafeBackups(); } catch { /* sin acceso */ }
  let carpetaRespaldos = '';
  try { carpetaRespaldos = await electron?.backup?.getDir?.(); } catch { /* sin acceso */ }
  let version = '';
  try { version = await electron?.getAppVersion?.(); } catch { /* sin acceso */ }
  let sesion: any = null;
  try { sesion = JSON.parse(localStorage.getItem('codecpos_sesion_activa') || 'null'); } catch { /* sin sesión */ }
  return {
    version,
    machineId: await miMachineId(),
    clienteVinculado: getLinkedClienteId(),
    sesion: sesion ? { usuarioId: sesion.usuarioId, nombre: sesion.nombreUsuario, rol: sesion.rol, inicio: sesion.horaInicio } : null,
    conteos: {
      productos: productos.length,
      productosActivos: (productos as any[]).filter((p) => p.activo !== false).length,
      ventas: ventas.length,
      usuarios: (usuarios as any[]).map((u) => `${u.username}/${u.rol}${u.activo === false ? '/inactivo' : ''}`),
      gastos: (() => { try { return JSON.parse(localStorage.getItem('pos-gastos') || '[]').length; } catch { return -1; } })(),
    },
    ultimaVenta: ultimaVenta ? { id: ultimaVenta.id, fecha: ultimaVenta.fecha, total: ultimaVenta.total, cajero: ultimaVenta.cajero } : null,
    localStorage: tamanoLocalStorage(),
    basesIndexedDB,
    carpetaRespaldos,
    respaldosBlindados,
    hora: new Date().toISOString(),
  };
}

/** Sube un respaldo a la nube SIN borrar los que ya hay (la subida normal sí los reemplaza). */
async function subirRespaldo(contenido: string, etiqueta: string) {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('Caja sin vínculo con la nube');
  const { blob, extension } = await comprimirJson(contenido);
  const nombreArchivo = `backup-soporte-${etiqueta}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  const storagePath = `${clienteId}/${nombreArchivo}`;
  const { error } = await client.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: extension === 'json.gz' ? 'application/gzip' : 'application/json',
  });
  if (error) throw error;
  const { error: errorFila } = await client.from('respaldos_nube').insert({
    cliente_id: clienteId, storage_path: storagePath, nombre_archivo: nombreArchivo, tamano_bytes: blob.size,
  });
  if (errorFila) throw errorFila;
  return { storage_path: storagePath, bytes: blob.size };
}

function resumenRespaldo(backup: any) {
  const ventas: any[] = backup?.datos?.ventas || [];
  const ultima = ventas.reduce((max, v) => (String(v.fecha || '') > max ? String(v.fecha || '') : max), '');
  return { ventas: ventas.length, productos: (backup?.datos?.productos || []).length, usuarios: (backup?.datos?.usuarios || []).length, ultimaVenta: ultima };
}

async function antesDeRestaurar(backup: any, forzar: boolean) {
  const ventasPC = await dbManager.getAllVentas().catch(() => [] as any[]);
  const ultimaPC = (ventasPC as any[]).reduce((max, v) => (String(v.fecha || '') > max ? String(v.fecha || '') : max), '');
  const archivo = resumenRespaldo(backup);
  if (!forzar && ultimaPC && archivo.ultimaVenta && ultimaPC > archivo.ultimaVenta) {
    throw new Error(`El PC tiene ventas más nuevas (${ultimaPC}) que el respaldo (${archivo.ultimaVenta}). Usa forzar si de verdad quieres reemplazar.`);
  }
  // Copia de lo que hay ahora, por si hay que volver atrás.
  const copia = await backupService.createBackup();
  return { pcAntes: { ventas: ventasPC.length, ultimaVenta: ultimaPC, copiaGuardada: !!copia }, archivo };
}

async function ejecutar(cmd: Comando): Promise<any> {
  const electron = (window as any).electron;
  const p = cmd.parametros || {};
  switch (cmd.accion) {
    case 'diagnostico':
      return diagnostico();
    case 'logs': {
      const r = await electron?.logs?.readRecent?.(Math.min(Number(p.lineas) || 300, 2000));
      return { lineas: r?.lines || [], error: r?.error };
    }
    case 'subir_respaldo_actual': {
      const backup = await backupService.createBackup();
      if (!backup) throw new Error('No se pudo generar el respaldo');
      return { ...(await subirRespaldo(JSON.stringify(backup), 'actual')), resumen: resumenRespaldo(backup) };
    }
    case 'subir_respaldo_blindado': {
      if (!p.archivo) throw new Error('Falta parametros.archivo (nombre del respaldo blindado)');
      const r = await electron?.backup?.read?.(String(p.archivo));
      if (!r?.success || !r.data) throw new Error(r?.error || 'No se pudo leer ese respaldo');
      return { ...(await subirRespaldo(r.data, String(p.archivo).replace(/[^\w.-]/g, '_'))), resumen: resumenRespaldo(JSON.parse(r.data)) };
    }
    case 'restaurar_respaldo_nube': {
      const client = getSupabaseClient();
      if (!client || !p.storage_path) throw new Error('Falta parametros.storage_path');
      const { data, error } = await client.storage.from(BUCKET).download(String(p.storage_path));
      if (error || !data) throw error || new Error('No se pudo descargar el respaldo');
      const texto = await descomprimirBlob(data, String(p.storage_path));
      const backup = JSON.parse(texto);
      const previo = await antesDeRestaurar(backup, p.forzar === true);
      const r = await backupService.restaurarDesdeArchivo(new File([texto], 'soporte-remoto.json', { type: 'application/json' }));
      if (!r.exito) throw new Error(r.error || 'La restauración falló');
      setTimeout(() => window.location.reload(), 4000);
      return { ...previo, restaurado: true, seRecarga: true };
    }
    case 'restaurar_respaldo_blindado': {
      if (!p.archivo) throw new Error('Falta parametros.archivo');
      const r = await electron?.backup?.read?.(String(p.archivo));
      if (!r?.success || !r.data) throw new Error(r?.error || 'No se pudo leer ese respaldo');
      const previo = await antesDeRestaurar(JSON.parse(r.data), p.forzar === true);
      const ok = await backupService.restoreFromSafeBackup(String(p.archivo));
      if (!ok) throw new Error('La restauración falló');
      setTimeout(() => window.location.reload(), 4000);
      return { ...previo, restaurado: true, seRecarga: true };
    }
    case 'recargar':
      setTimeout(() => window.location.reload(), 3000);
      return { seRecarga: true };
    default:
      throw new Error(`Acción desconocida: ${cmd.accion}`);
  }
}

async function revisarPendientes(): Promise<void> {
  if (ocupado) return;
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;
  ocupado = true;
  try {
    const yo = await miMachineId();
    const { data } = await client.from('soporte_comandos')
      .select('id, cliente_id, machine_id, accion, parametros, estado')
      .eq('cliente_id', clienteId).eq('estado', 'pendiente')
      .order('created_at', { ascending: true }).limit(5);
    for (const cmd of (data || []) as Comando[]) {
      if (cmd.machine_id && cmd.machine_id !== yo) continue;
      // Tomarla solo si sigue pendiente: si hay dos cajas, una sola la ejecuta.
      const { data: tomada } = await client.from('soporte_comandos')
        .update({ estado: 'tomado', tomado_en: new Date().toISOString(), tomado_por_machine: yo })
        .eq('id', cmd.id).eq('estado', 'pendiente').select('id');
      if (!tomada?.length) continue;
      logger.info('🛠️ Orden de soporte remoto', { accion: cmd.accion, id: cmd.id });
      let estado = 'hecho';
      let resultado: any;
      try { resultado = await ejecutar(cmd); } catch (e) { estado = 'error'; resultado = { error: e instanceof Error ? e.message : String(e) }; }
      await client.from('soporte_comandos')
        .update({ estado, resultado, terminado_en: new Date().toISOString() })
        .eq('id', cmd.id);
    }
  } catch (e) {
    logger.warn('Soporte remoto: no se pudo revisar órdenes', { error: e instanceof Error ? e.message : String(e) });
  } finally {
    ocupado = false;
  }
}

function escucharRealtime(): void {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || canalActivo?.clienteId === clienteId) return;
  canalActivo?.quitar();
  const canal = client.channel(`soporte-remoto-${clienteId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'soporte_comandos', filter: `cliente_id=eq.${clienteId}` }, () => { void revisarPendientes(); })
    .subscribe();
  canalActivo = { clienteId, quitar: () => { client.removeChannel(canal); } };
}

/** Arranca una sola vez en Electron: revisa al abrir, cada minuto y cuando llega una orden. */
export function iniciarSoporteRemoto(): void {
  if (typeof window === 'undefined' || !(window as any).electron) return;
  if ((window as any).__soporteRemotoIniciado) return;
  (window as any).__soporteRemotoIniciado = true;
  const tick = () => { escucharRealtime(); void revisarPendientes(); };
  setTimeout(tick, 15_000);
  setInterval(tick, INTERVALO_MS);
}
