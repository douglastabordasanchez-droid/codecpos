/**
 * Respaldo automático en la nube (Supabase Storage) — complemento del
 * blindaje local (backupService.ts → C:\CodecStudio\CODECPOS\backups\), NO
 * lo reemplaza. Pensado para el plan gratuito de Supabase (50GB): se sube un
 * respaldo cada 15 días y se mantiene UNO SOLO en la nube a la vez — al subir
 * uno nuevo se borra el anterior, y al descargar el actual también se borra,
 * para no acumular espacio.
 *
 * Reutiliza exactamente el mismo BackupData que ya arma createBackup() (ver
 * backupService.ts) y el mismo patrón de sesión/tenant que syncService.ts
 * (getSupabaseClient + getLinkedClienteId).
 */
import { backupService } from '../backupService';
import { dbManager } from '../indexedDB';
import { logger } from '../logger';
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

const BUCKET = 'respaldos-nube';
const DIAS_ENTRE_RESPALDOS = 15;
const CFG_ULTIMO_RESPALDO_NUBE = 'ultimoRespaldoNubeFecha';

export interface RespaldoNube {
  id: string;
  storage_path: string;
  nombre_archivo: string;
  tamano_bytes: number;
  creado_en: string;
}

/** Comprime a gzip si el entorno lo soporta (Electron/Chromium moderno sí); si no, sube el JSON sin comprimir. */
async function comprimirJson(texto: string): Promise<{ blob: Blob; extension: string }> {
  if (typeof CompressionStream === 'undefined') {
    return { blob: new Blob([texto], { type: 'application/json' }), extension: 'json' };
  }
  try {
    const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    return { blob, extension: 'json.gz' };
  } catch {
    return { blob: new Blob([texto], { type: 'application/json' }), extension: 'json' };
  }
}

async function descomprimirBlob(blob: Blob, nombreArchivo: string): Promise<string> {
  if (!nombreArchivo.endsWith('.gz') || typeof DecompressionStream === 'undefined') {
    return blob.text();
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** ¿Ya pasaron 15 días desde el último respaldo subido a la nube? */
export async function debeSubirBackupHoy(): Promise<boolean> {
  const ultima = await dbManager.getConfig(CFG_ULTIMO_RESPALDO_NUBE);
  if (!ultima) return true;
  const dias = (Date.now() - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24);
  return dias >= DIAS_ENTRE_RESPALDOS;
}

/** Borra cualquier respaldo previo del negocio en la nube (objeto + fila) — se mantiene uno solo a la vez. */
async function borrarRespaldosPrevios(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
  const { data: previos } = await client.from('respaldos_nube').select('id, storage_path').eq('cliente_id', clienteId);
  if (!previos || previos.length === 0) return;

  const paths = previos.map((p) => p.storage_path);
  await client.storage.from(BUCKET).remove(paths).catch(() => {});
  await client.from('respaldos_nube').delete().eq('cliente_id', clienteId);
}

/** Sube un respaldo completo a la nube, reemplazando el anterior. */
export async function subirBackupACloud(): Promise<{ exito: boolean; error?: string }> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) {
    return { exito: false, error: 'El negocio no está vinculado a la nube todavía' };
  }

  try {
    const backup = await backupService.createBackup();
    if (!backup) return { exito: false, error: 'No se pudo generar el respaldo' };

    const contenido = JSON.stringify(backup);
    const { blob, extension } = await comprimirJson(contenido);

    await borrarRespaldosPrevios(client, clienteId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombreArchivo = `backup-${timestamp}.${extension}`;
    const storagePath = `${clienteId}/${nombreArchivo}`;

    const { error: errorSubida } = await client.storage.from(BUCKET).upload(storagePath, blob, {
      contentType: extension === 'json.gz' ? 'application/gzip' : 'application/json',
    });
    if (errorSubida) throw errorSubida;

    const { error: errorFila } = await client.from('respaldos_nube').insert({
      cliente_id: clienteId,
      storage_path: storagePath,
      nombre_archivo: nombreArchivo,
      tamano_bytes: blob.size,
    });
    if (errorFila) throw errorFila;

    await dbManager.setConfig(CFG_ULTIMO_RESPALDO_NUBE, new Date().toISOString());
    logger.info('☁️ Respaldo subido a la nube', { nombreArchivo, tamanoBytes: blob.size });
    return { exito: true };
  } catch (error) {
    logger.error('Error subiendo respaldo a la nube', error as Error);
    return { exito: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

/** Si corresponde (han pasado 15 días), sube un respaldo automáticamente. Pensado para llamarse una vez al abrir la app. */
export async function verificarYSubirBackupNube(): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;
  if (!(await debeSubirBackupHoy())) return;
  await subirBackupACloud();
}

/** Lista los respaldos disponibles en la nube para el negocio vinculado (normalmente 0 o 1, por diseño). */
export async function listarBackupsCloud(): Promise<RespaldoNube[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];

  const { data, error } = await client
    .from('respaldos_nube')
    .select('id, storage_path, nombre_archivo, tamano_bytes, creado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false });
  if (error) return [];
  return data || [];
}

/**
 * Descarga un respaldo de la nube al equipo del cliente y, SOLO si la
 * descarga se confirma, lo borra de Supabase (objeto + fila) para liberar
 * espacio — esto es lo que pidió el negocio explícitamente.
 */
export async function descargarYLiberarBackupCloud(respaldo: RespaldoNube): Promise<{ exito: boolean; error?: string }> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return { exito: false, error: 'El negocio no está vinculado a la nube todavía' };

  try {
    const { data: blobDescargado, error: errorDescarga } = await client.storage.from(BUCKET).download(respaldo.storage_path);
    if (errorDescarga || !blobDescargado) throw errorDescarga || new Error('No se pudo descargar el respaldo');

    const contenido = await descomprimirBlob(blobDescargado, respaldo.nombre_archivo);
    const blobDescarga = new Blob([contenido], { type: 'application/json' });
    const url = URL.createObjectURL(blobDescarga);
    const nombreDescarga = respaldo.nombre_archivo.replace(/\.gz$/, '');

    const a = document.createElement('a');
    a.href = url;
    a.download = nombreDescarga;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // 🛡️ Solo se libera espacio en Supabase DESPUÉS de confirmar que la
    // descarga al equipo del cliente ya se disparó con éxito.
    await client.storage.from(BUCKET).remove([respaldo.storage_path]).catch(() => {});
    await client.from('respaldos_nube').delete().eq('id', respaldo.id).eq('cliente_id', clienteId);

    logger.info('☁️ Respaldo descargado y liberado de la nube', { nombreArchivo: respaldo.nombre_archivo });
    return { exito: true };
  } catch (error) {
    logger.error('Error descargando respaldo de la nube', error as Error);
    return { exito: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
