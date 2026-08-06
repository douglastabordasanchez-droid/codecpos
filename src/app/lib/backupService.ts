/**
 * Sistema de Backup Automático
 * CODEC POS v2.0
 * Backup diario automático de todos los datos críticos
 */

import { dbManager } from './indexedDB';
import { logger } from './logger';
import { storeEvents } from './electronStore';
import { historicoService } from './historicoService';

interface BackupData {
  version: string;
  timestamp: string;
  machineId: string;
  datos: {
    productos: any[];
    ventas: any[];
    usuarios: any[];
    config: any[];
    gastos: any[];
    turnos: any[];
    // 🛡️ FIX (2026-07-07): cierres de caja, estadísticas y reportes viven en
    // una base de datos IndexedDB COMPLETAMENTE SEPARADA ('codec_pos_historico',
    // ver historicoService.ts) y en su propia localStorage — nunca estuvieron
    // cubiertos por el backup hasta ahora. Un incidente de restauración previo
    // nunca los tocó (ni para bien ni para mal, porque este backup no sabía
    // que existían), así que instalaciones afectadas por ese incidente pueden
    // conservar este historial intacto en vivo aunque no aparezca en ningún
    // backup anterior a este cambio.
    historico?: {
      ventas: any[];
      cierres: any[];
      estadisticas: any[];
      contabilidad: any[];
    };
    cierresCajaLegacy?: any[]; // localStorage 'pos-cierres-caja' (registro paralelo usado por CierreCajaPage)
    reportesGenerados?: any[]; // localStorage 'pos-reportes-generados'
    configEmpresa?: any; // localStorage 'codec_pos_config' — se capturaba pero nunca se restauraba
    // 🛡️ FIX: el módulo de Contabilidad (ingresos extra, categorías dinámicas,
    // presupuestos, gastos recurrentes, meta mensual) vive en localStorage con
    // claves propias que quedaban fuera de todo backup — si algo obligaba a
    // restaurar, esta información del cliente se perdía en silencio.
    categoriasContables?: any[];
    ingresosExtra?: any[];
    presupuestosCategorias?: any[];
    gastosRecurrentes?: any[];
    metaMensualGanancia?: number | null;
    // 🛡️ FIX: la lista de clientes del Panel de Administración
    // ('codecpos_dev_clientes' — usuario/contraseña que el reseller crea
    // para cada cliente) nunca estuvo cubierta por ningún backup — si esa
    // clave se perdía (reset, restauración anterior, migración de equipo),
    // no había forma de recuperarla. Igual para los módulos/permisos
    // asignados a cada cliente ('codec_pos_modulos_cliente_<id>',
    // 'codec_pos_permisos_usuarios').
    clientesAdmin?: any[];
    modulosClientesAdmin?: Record<string, any>;
    permisosUsuariosAdmin?: any;
  };
  stats: {
    totalProductos: number;
    totalVentas: number;
    totalUsuarios: number;
    tamañoBytes: number;
  };
}

class BackupService {
  private readonly APP_VERSION = '2.0.0';
  private readonly MAX_BACKUPS = 30; // Mantener 30 días de backups
  private autoBackupInterval: number | null = null;

  // 🛡️ Ver verificarYAutoRecuperar(): evita que la auto-recuperación se
  // dispare por error durante el uso normal del día a día — solo debe poder
  // actuar justo después de una actualización de versión.
  private readonly LS_ULTIMA_VERSION_VISTA = 'codec_pos_ultima_version_vista';

  // 🛡️ Marca que la limpieza única de backups auto-anidados (ver
  // purgarBackupsAutoAnidadosUnaVez) ya se ejecutó en este perfil.
  private readonly LS_BACKUPS_BLOAT_LIMPIADO = 'codec_pos_backups_bloat_limpiado_v1';

  /**
   * 🛡️ FIX ÚNICO DE MIGRACIÓN: instalaciones que ya venían corriendo con el
   * bug de `config` incluyendo los backups anteriores (ver createBackup) ya
   * tienen entradas `backup_<timestamp>` en IndexedDB con crecimiento
   * exponencial (se vio un caso real: 160MB → 321MB en 3 minutos, hasta
   * tronar con "Invalid string length"). El fix de más abajo evita que
   * SIGA creciendo, pero no repara las entradas YA infladas — sin esto,
   * cada backup automático (cada hora, y en cada cierre de sesión) seguiría
   * bloqueando el hilo principal por segundos intentando leerlas/serializar
   * sobre ellas. Se ejecuta una sola vez por perfil.
   */
  private async purgarBackupsAutoAnidadosUnaVez(): Promise<void> {
    if (localStorage.getItem(this.LS_BACKUPS_BLOAT_LIMPIADO)) return;
    try {
      const todos = await dbManager.getAllConfig();
      const backupsViejos = todos.filter(item => item.key.startsWith('backup_'));
      for (const item of backupsViejos) {
        await dbManager.deleteConfig(item.key);
      }
      if (backupsViejos.length > 0) {
        logger.info(`🧹 Limpieza única: ${backupsViejos.length} backup(s) auto-anidados eliminados de IndexedDB`);
      }
    } catch (error) {
      logger.error('Error en limpieza única de backups auto-anidados', error as Error);
    } finally {
      // Marcar como hecho incluso si falló algo puntual, para no reintentar
      // en cada arranque/backup y seguir gastando tiempo en ello.
      try { localStorage.setItem(this.LS_BACKUPS_BLOAT_LIMPIADO, new Date().toISOString()); } catch {}
    }
  }

  /**
   * Crear backup completo de todos los datos
   */
  async createBackup(): Promise<BackupData | null> {
    try {
      logger.info('📦 Iniciando backup automático...');

      await this.purgarBackupsAutoAnidadosUnaVez();

      // Recolectar todos los datos
      const productos = await dbManager.getAllProductos();
      const ventas = await dbManager.getAllVentas();
      const usuarios = await dbManager.getAllUsuarios();

      // 🛡️ FIX CRÍTICO: los backups anteriores (backup_<timestamp>) y su
      // marcador (lastBackupTime) se guardan en el MISMO almacén de config
      // (dbManager.setConfig más abajo) — sin este filtro, cada backup nuevo
      // incluye TODOS los backups anteriores anidados dentro de su propio
      // campo `config` (que a su vez ya contenían los suyos), duplicando el
      // tamaño del archivo en cada ciclo (se vio crecer de 160MB a 321MB en
      // 3 minutos en producción) hasta que JSON.stringify truena con
      // "Invalid string length". Y ANTES de tronar, cada intento bloquea el
      // hilo principal por segundos serializando cientos de MB — eso es lo
      // que se sentía como que la app se congelaba al escribir.
      const configRaw = await dbManager.getAllConfig();
      const config = configRaw.filter(item => !item.key.startsWith('backup_') && item.key !== 'lastBackupTime');

      // Recolectar datos de localStorage
      const gastos = this.getFromLocalStorage('pos-gastos', []);
      const turnos = this.getFromLocalStorage('pos-turnos', []);
      const configEmpresa = this.getFromLocalStorage('codec_pos_config', null);

      // 🛡️ Histórico de cierres/estadísticas (base de datos separada) + registros
      // en localStorage que antes quedaban fuera de todo backup.
      const historico = await historicoService.exportarDatos().catch(() => ({
        ventas: [], cierres: [], estadisticas: [], contabilidad: [],
      }));
      const cierresCajaLegacy = this.getFromLocalStorage('pos-cierres-caja', []);
      const reportesGenerados = this.getFromLocalStorage('pos-reportes-generados', []);

      // Datos del módulo de Contabilidad — antes fuera de todo backup.
      const categoriasContables = this.getFromLocalStorage('codecpos_categorias_contables', []);
      const ingresosExtra = this.getFromLocalStorage('codecpos_ingresos_extra', []);
      const presupuestosCategorias = this.getFromLocalStorage('codecpos_presupuestos_categorias', []);
      const gastosRecurrentes = this.getFromLocalStorage('codecpos_gastos_recurrentes', []);
      const metaMensualGanancia = this.getFromLocalStorage('codecpos_meta_mensual_ganancia', null);

      // 🛡️ Clientes del Panel de Administración + sus módulos/permisos —
      // antes con cero cobertura de backup (ver comentario en BackupData).
      const clientesAdmin = this.getFromLocalStorage('codecpos_dev_clientes', []);
      const modulosClientesAdmin: Record<string, any> = {};
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('codec_pos_modulos_cliente_')) {
            modulosClientesAdmin[key] = this.getFromLocalStorage(key, null);
          }
        }
      } catch { /* no crítico */ }
      const permisosUsuariosAdmin = this.getFromLocalStorage('codec_pos_permisos_usuarios', null);

      const backupData: BackupData = {
        version: this.APP_VERSION,
        timestamp: new Date().toISOString(),
        machineId: await this.getMachineId(),
        datos: {
          productos,
          ventas,
          usuarios,
          config: config || [],
          gastos,
          turnos,
          historico: {
            ventas: historico.ventas || [],
            cierres: historico.cierres || [],
            estadisticas: historico.estadisticas || [],
            contabilidad: historico.contabilidad || [],
          },
          cierresCajaLegacy,
          reportesGenerados,
          configEmpresa,
          categoriasContables,
          ingresosExtra,
          presupuestosCategorias,
          gastosRecurrentes,
          metaMensualGanancia,
          clientesAdmin,
          modulosClientesAdmin,
          permisosUsuariosAdmin,
        },
        stats: {
          totalProductos: productos.length,
          totalVentas: ventas.length,
          totalUsuarios: usuarios.length,
          tamañoBytes: 0, // Se calculará después
        },
      };

      // Calcular tamaño aproximado
      const backupString = JSON.stringify(backupData);
      backupData.stats.tamañoBytes = new Blob([backupString]).size;

      // Guardar backup en IndexedDB
      await this.saveBackupToIndexedDB(backupData);

      // Si estamos en Electron, también guardar en disco (ruta antigua, Documents)
      if (window.electron?.saveBackup) {
        await this.saveBackupToFile(backupData);
      }

      // 🛡️ BLINDAJE: guardar además en la ruta segura fuera de %AppData%
      // (C:\CodecStudio\CODECPOS\backups\), con histórico rotativo de 7 días.
      // Esta es la copia que la Sección de Desarrollador usa para reparar/restaurar.
      await this.saveBackupToSafePath(backupData);

      // Limpiar backups antiguos (histórico interno en IndexedDB)
      await this.cleanOldBackups();

      logger.info('✅ Backup completado exitosamente', {
        productos: backupData.stats.totalProductos,
        ventas: backupData.stats.totalVentas,
        tamaño: this.formatBytes(backupData.stats.tamañoBytes),
      });

      return backupData;
    } catch (error) {
      logger.error('❌ Error creando backup', error as Error);
      return null;
    }
  }

  /**
   * Guardar backup en IndexedDB
   */
  private async saveBackupToIndexedDB(backup: BackupData): Promise<void> {
    try {
      const backupKey = `backup_${backup.timestamp}`;
      await dbManager.setConfig(backupKey, backup);
      
      // Guardar referencia del último backup
      await dbManager.setConfig('lastBackupTime', backup.timestamp);
    } catch (error) {
      logger.error('Error guardando backup en IndexedDB', error as Error);
      throw error;
    }
  }

  /**
   * Guardar backup en archivo (Electron)
   */
  private async saveBackupToFile(backup: BackupData): Promise<void> {
    try {
      if (!window.electron?.saveBackup) {
        return; // No estamos en Electron
      }

      const backupString = JSON.stringify(backup, null, 2);
      const fileName = `CODEC_POS_Backup_${this.formatDateForFilename(backup.timestamp)}.json`;

      const result = await window.electron.saveBackup({
        fileName,
        data: backupString,
      });

      if (result.success) {
        logger.info('💾 Backup guardado en archivo', { path: result.path });
      } else {
        logger.warn('⚠️ No se pudo guardar backup en archivo', { error: result.error });
      }
    } catch (error) {
      logger.error('Error guardando backup en archivo', error as Error);
    }
  }

  /**
   * 🛡️ BLINDAJE: Guardar backup en la ruta segura fuera de %AppData%
   * (C:\CodecStudio\CODECPOS\backups\), con histórico rotativo de 7 días.
   * Esta es la copia que sobrevive a perfiles de Windows corruptos, apagones
   * y borrados accidentales del cliente — y la que usa la Sección de
   * Desarrollador para reparar/restaurar con un clic.
   */
  private async saveBackupToSafePath(backup: BackupData): Promise<void> {
    try {
      if (!window.electron?.backup?.saveSafe) return; // No estamos en Electron

      const backupString = JSON.stringify(backup);
      const result = await window.electron.backup.saveSafe(backupString);

      if (result.success) {
        logger.info('🛡️ Backup blindado creado', { fileName: result.fileName, bytes: result.bytes });
      } else {
        logger.warn('⚠️ No se pudo crear el backup blindado', { error: result.error });
      }
    } catch (error) {
      logger.error('Error creando el backup blindado', error as Error);
    }
  }

  /**
   * Lista los backups blindados disponibles (fuera de %AppData%), más reciente
   * primero. `integro` indica si el checksum del archivo coincide con el
   * guardado al crearlo (false = dañado/alterado, null = backup antiguo sin
   * checksum, no verificable).
   */
  async listSafeBackups(): Promise<Array<{ fileName: string; fecha: string; size: number; integro: boolean | null }>> {
    try {
      if (!window.electron?.backup?.list) return [];
      const result = await window.electron.backup.list();
      return result.success ? result.backups : [];
    } catch {
      return [];
    }
  }

  /**
   * Info del último backup blindado exitoso (para el panel de telemetría).
   */
  async getLastSafeBackupInfo(): Promise<{ fileName: string; fecha: string; size: number; integro: boolean | null } | null> {
    try {
      if (!window.electron?.backup?.getLastInfo) return null;
      const result = await window.electron.backup.getLastInfo();
      return result.success ? result.info : null;
    } catch {
      return null;
    }
  }

  /**
   * Restaura un backup blindado específico (por nombre de archivo) directamente
   * en IndexedDB, y relanza la aplicación para aplicar el estado restaurado.
   * A diferencia de restoreBackup() (que lee de IndexedDB), esta ruta funciona
   * incluso si el IndexedDB actual está vacío, corrupto o recién reparado.
   */
  /**
   * 🛡️ FIX: 'codecpos_usuarios' mezcla personal/cajeros de la tienda (vienen
   * de dbManager.getAllUsuarios(), sí están en el backup) con la cuenta del
   * cliente creada por el Panel de Administración (creadoPor ===
   * 'PANEL_DESARROLLADOR', NUNCA estuvo en el backup — ver comentario en
   * BackupData). Antes cada restauración SOBREESCRIBÍA por completo esta
   * clave con solo el personal, borrando el acceso del cliente. Se
   * preservan las entradas de panel que ya existan localmente y se unen con
   * lo restaurado.
   */
  private mergeUsuariosPreservandoAdmin(usuariosRestaurados: any[]): any[] {
    let actuales: any[] = [];
    try { actuales = JSON.parse(localStorage.getItem('codecpos_usuarios') || '[]'); } catch { actuales = []; }
    const adminActuales = (Array.isArray(actuales) ? actuales : []).filter((u: any) => u?.creadoPor === 'PANEL_DESARROLLADOR');
    const restaurados = usuariosRestaurados || [];
    const idsRestaurados = new Set(restaurados.map((u: any) => u?.id));
    return [...restaurados, ...adminActuales.filter((u: any) => !idsRestaurados.has(u.id))];
  }

  /**
   * 🛡️ Restaura 'codecpos_dev_clientes' + módulos/permisos asociados
   * fusionando con lo que ya exista localmente (nunca reemplaza a ciegas) —
   * así una restauración jamás puede hacer desaparecer un cliente creado
   * después de la fecha del backup que se está restaurando.
   */
  private restaurarClientesAdminYModulos(datos: BackupData['datos']): void {
    try {
      if (datos.clientesAdmin && datos.clientesAdmin.length > 0) {
        let actuales: any[] = [];
        try { actuales = JSON.parse(localStorage.getItem('codecpos_dev_clientes') || '[]'); } catch { actuales = []; }
        const idsBackup = new Set(datos.clientesAdmin.map((c: any) => c?.id));
        const fusionados = [...datos.clientesAdmin, ...(Array.isArray(actuales) ? actuales : []).filter((c: any) => !idsBackup.has(c.id))];
        this.saveToLocalStorage('codecpos_dev_clientes', fusionados);
      }
      if (datos.modulosClientesAdmin) {
        for (const [key, value] of Object.entries(datos.modulosClientesAdmin)) {
          if (value != null && localStorage.getItem(key) == null) {
            this.saveToLocalStorage(key, value);
          }
        }
      }
      if (datos.permisosUsuariosAdmin != null && localStorage.getItem('codec_pos_permisos_usuarios') == null) {
        this.saveToLocalStorage('codec_pos_permisos_usuarios', datos.permisosUsuariosAdmin);
      }
    } catch (error) {
      logger.error('Error restaurando clientes/módulos del Panel de Administración', error as Error);
    }
  }

  async restoreFromSafeBackup(fileName: string): Promise<boolean> {
    try {
      if (!window.electron?.backup?.read) {
        logger.error('Restauración blindada no disponible fuera de Electron');
        return false;
      }

      logger.critical(`Restauración de backup blindado solicitada: ${fileName}`);

      const result = await window.electron.backup.read(fileName);
      if (!result.success || !result.data) {
        logger.error('No se pudo leer el backup blindado seleccionado', undefined, { fileName, error: result.error });
        return false;
      }

      const backup: BackupData = JSON.parse(result.data);
      const { datos } = backup;

      // Vaciar los stores actuales antes de repoblarlos con el backup
      await Promise.all([
        dbManager.clearStore('productos'),
        dbManager.clearStore('ventas'),
        dbManager.clearStore('usuarios'),
      ]);

      await Promise.all([
        dbManager.bulkPut('productos', datos.productos || []),
        dbManager.bulkPut('ventas', datos.ventas || []),
        dbManager.bulkPut('usuarios', datos.usuarios || []),
      ]);

      for (const item of datos.config || []) {
        await dbManager.setConfig(item.key, item.value);
      }

      this.saveToLocalStorage('pos-gastos', datos.gastos || []);
      this.saveToLocalStorage('pos-turnos', datos.turnos || []);

      // 🛡️ FIX: cierres de caja/estadísticas/reportes viven fuera de
      // CodecPOS_DB — restaurarlos aquí explícitamente, igual que el resto.
      if (datos.historico) {
        await historicoService.importarDatos(datos.historico).catch(() => {});
      }
      this.saveToLocalStorage('pos-cierres-caja', datos.cierresCajaLegacy || []);
      this.saveToLocalStorage('pos-reportes-generados', datos.reportesGenerados || []);

      // 🛡️ FIX: config del negocio (nombre, NIT, impuestos...) se capturaba en
      // el backup pero nunca se escribía de vuelta al restaurar — se perdía.
      if (datos.configEmpresa) this.saveToLocalStorage('codec_pos_config', datos.configEmpresa);

      // 🛡️ FIX: datos del módulo de Contabilidad (ingresos extra, categorías
      // dinámicas, presupuestos por categoría, gastos recurrentes, meta
      // mensual) — antes quedaban fuera de todo backup/restauración.
      this.saveToLocalStorage('codecpos_categorias_contables', datos.categoriasContables || []);
      this.saveToLocalStorage('codecpos_ingresos_extra', datos.ingresosExtra || []);
      this.saveToLocalStorage('codecpos_presupuestos_categorias', datos.presupuestosCategorias || []);
      this.saveToLocalStorage('codecpos_gastos_recurrentes', datos.gastosRecurrentes || []);
      if (datos.metaMensualGanancia != null) this.saveToLocalStorage('codecpos_meta_mensual_ganancia', datos.metaMensualGanancia);

      // 🛡️ FIX: los usuarios (empleados/cajeros) tienen TRES capas de
      // persistencia redundante (ver src/app/lib/usuariosStorage.ts):
      // IndexedDB, dos claves de localStorage con nombres inconsistentes
      // ('codecpos_usuarios' en AuthContext y 'codec_pos_usuarios' en
      // UsuariosStorage), y un archivo en disco (electronAPI). Al cargar,
      // UsuariosStorage.cargarUsuarios() SIEMPRE prioriza localStorage por
      // velocidad — así que si solo restauramos IndexedDB, un caché viejo en
      // localStorage sigue "tapando" a los usuarios recién restaurados
      // (incluyendo usuarios creados después del backup que se está
      // restaurando). Por eso se sincronizan las 3 capas explícitamente aquí.
      const usuariosFusionados = this.mergeUsuariosPreservandoAdmin(datos.usuarios || []);
      this.saveToLocalStorage('codecpos_usuarios', usuariosFusionados);
      this.saveToLocalStorage('codec_pos_usuarios', usuariosFusionados);
      try {
        await (window as any).electronAPI?.guardarUsuarios?.(usuariosFusionados);
      } catch { /* no crítico — IndexedDB y localStorage ya quedaron sincronizados */ }

      // 🛡️ Clientes del Panel de Administración + sus módulos/permisos.
      this.restaurarClientesAdminYModulos(datos);

      logger.critical('Restauración de backup blindado completada — relanzando aplicación', undefined, {
        fileName,
        ventasRestauradas: (datos.ventas || []).length,
        productosRestaurados: (datos.productos || []).length,
        usuariosRestaurados: (datos.usuarios || []).length,
      });

      if (window.electron?.relaunch) {
        await window.electron.relaunch();
      } else {
        setTimeout(() => window.location.reload(), 800);
      }

      return true;
    } catch (error) {
      logger.error('Error restaurando backup blindado', error as Error, { fileName });
      return false;
    }
  }

  /**
   * ¿Este backup contiene datos reales (al menos un producto o una venta)?
   * Usado para descartar backups "técnicamente válidos" (checksum correcto)
   * pero inútiles para recuperar — por ejemplo, los que un incidente de
   * auto-restauración en cadena pudo haber creado apuntando a una base de
   * datos ya vacía (cada arranque genera un backup inmediato vía
   * startAutoBackup(), así que un incidente repetido puede dejar varios
   * backups "recientes" vacíos por encima de los buenos).
   */
  private async backupTieneContenidoReal(fileName: string): Promise<boolean> {
    try {
      const lectura = await window.electron?.backup?.read(fileName);
      if (!lectura?.success || !lectura.data) return false;
      const contenido: BackupData = JSON.parse(lectura.data);
      return (contenido.stats?.totalProductos || 0) > 0 || (contenido.stats?.totalVentas || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * 🛡️ Recuperación de emergencia: prueba automáticamente el backup blindado
   * más reciente que tenga contenido real y, si está dañado (por un apagón a
   * medio escribir, un virus que alteró el archivo, etc.) o resulta estar
   * vacío (ver backupTieneContenidoReal), pasa al siguiente más antiguo, y así
   * hasta encontrar uno útil o agotar el historial de 7 días. Es el "un botón
   * que recupera toda la información posible" — el desarrollador no necesita
   * saber cuál backup elegir a mano.
   */
  async recuperacionEmergencia(): Promise<{ exito: boolean; backupUsado?: string; intentos: number; error?: string }> {
    try {
      const backups = await this.listSafeBackups(); // más reciente primero
      if (backups.length === 0) {
        return { exito: false, intentos: 0, error: 'No hay ningún backup blindado disponible' };
      }

      let intentos = 0;
      for (const b of backups) {
        intentos++;
        if (b.integro === false) {
          logger.warn(`Backup descartado por estar dañado o alterado: ${b.fileName}`);
          continue;
        }
        if (!(await this.backupTieneContenidoReal(b.fileName))) {
          logger.warn(`Backup descartado por no tener contenido real (posible snapshot vacío de un incidente previo): ${b.fileName}`);
          continue;
        }
        const ok = await this.restoreFromSafeBackup(b.fileName);
        if (ok) return { exito: true, backupUsado: b.fileName, intentos };
        // Si falló (p. ej. el checksum lo delató recién al leerlo), se prueba el siguiente.
      }

      return { exito: false, intentos, error: 'Ningún backup del historial tiene contenido real utilizable' };
    } catch (error) {
      return { exito: false, intentos: 0, error: (error as Error).message };
    }
  }

  /**
   * 🛡️ "Reparar base de datos": limpia el storage local corrupto (IndexedDB
   * bloqueado/vacío por un apagón) y ejecuta la recuperación de emergencia
   * (prueba el backup más reciente sano, retrocediendo en el historial si
   * hace falta). Si no hay ningún backup utilizable, deja la app lista para
   * empezar de cero limpio en vez de quedar bloqueada.
   */
  async repairDatabase(): Promise<{ success: boolean; restaurado: boolean; backupUsado?: string; intentos?: number; error?: string }> {
    try {
      if (!window.electron?.backup?.repair) {
        return { success: false, restaurado: false, error: 'Reparación no disponible fuera de Electron' };
      }

      logger.critical('Reparación de base de datos solicitada desde la Sección de Desarrollador');

      const repairResult = await window.electron.backup.repair();
      if (!repairResult.success) {
        return { success: false, restaurado: false, error: repairResult.error };
      }

      const recuperacion = await this.recuperacionEmergencia();
      if (recuperacion.exito) {
        return { success: true, restaurado: true, backupUsado: recuperacion.backupUsado, intentos: recuperacion.intentos };
      }

      logger.warn('Reparación completada sin poder restaurar ningún backup — relanzando en limpio', {
        intentos: recuperacion.intentos,
        error: recuperacion.error,
      });
      if (window.electron?.relaunch) await window.electron.relaunch();
      return { success: true, restaurado: false, intentos: recuperacion.intentos };
    } catch (error) {
      logger.error('Error reparando la base de datos', error as Error);
      return { success: false, restaurado: false, error: (error as Error).message };
    }
  }

  /**
   * 🛡️ Auto-recuperación — SOLO al detectar una actualización de versión:
   * si justo después de actualizar la app el IndexedDB aparece vacío (0
   * productos y 0 ventas) en una instalación que YA HABÍA tenido datos antes,
   * se restaura automáticamente el último backup blindado.
   *
   * ⚠️ INCIDENTE CORREGIDO (2026-07-07): esta función corría en CADA arranque
   * (no solo tras actualizar) y trataba cualquier error de lectura de
   * IndexedDB como "base de datos vacía" (`.catch(() => [])`). Un simple
   * hiccup transitorio de lectura —IndexedDB momentáneamente bloqueado, disco
   * ocupado— se interpretaba como negocio vacío y disparaba un restaurar +
   * relanzar automático que sobrescribía datos reales con un backup viejo.
   * Eso es exactamente lo que un cliente reportó como "el sistema se
   * reinicia solo y borra todo". Ahora:
   *   1. Solo se ejecuta el chequeo cuando la versión de la app cambió desde
   *      el último arranque (nunca en el uso normal del día a día).
   *   2. Si la lectura de IndexedDB falla, se ABORTA sin tocar nada — un
   *      error nunca se interpreta como "vacío".
   *   3. La restauración usa recuperacionEmergencia() (cascada por todo el
   *      historial de 7 días, saltando backups dañados o vacíos) — nunca se
   *      restaura un backup sin contenido real, así que una instalación
   *      genuinamente nueva (sin backups útiles) queda intacta sola.
   */
  async verificarYAutoRecuperar(): Promise<void> {
    try {
      if (!window.electron?.backup?.list) return; // Solo aplica en Electron

      const versionActual = window.electron?.getAppVersion ? await window.electron.getAppVersion() : null;
      const versionVista = this.getFromLocalStorage(this.LS_ULTIMA_VERSION_VISTA, null);

      if (versionActual) {
        this.saveToLocalStorage(this.LS_ULTIMA_VERSION_VISTA, versionActual);
      }

      // ⚠️ Ojo: se compara contra versionVista aunque sea null/no exista.
      // Así, la primera vez que un cliente recibe ESTA MISMA actualización
      // (la que corrige el incidente) también dispara el chequeo — necesario
      // para que la recuperación ocurra "apenas actualice", ya que la clave
      // de versión nunca existió en instalaciones con el código anterior.
      // Sigue siendo seguro: la lectura ya no swallowea errores (más abajo) y
      // solo se restaura si la instalación YA HABÍA tenido datos reales antes.
      const huboActualizacionDeVersion = !!(versionActual && versionActual !== versionVista);
      if (!huboActualizacionDeVersion) {
        return; // Arranque normal — nunca se ejecuta el chequeo destructivo
      }

      // Lectura EXPLÍCITA sin swallow: si falla, se aborta por completo.
      let productos: any[];
      let ventas: any[];
      try {
        [productos, ventas] = await Promise.all([
          dbManager.getAllProductos(),
          dbManager.getAllVentas(),
        ]);
      } catch (readError) {
        logger.warn(
          'No se pudo leer IndexedDB tras la actualización de versión — se omite la auto-recuperación por seguridad (un error de lectura nunca se trata como "vacío")',
          { error: (readError as Error).message }
        );
        return;
      }

      if (productos.length > 0 || ventas.length > 0) return; // Hay datos — no tocar nada

      // 🛡️ IMPORTANTE: no basta con mirar el backup MÁS RECIENTE. Si hubo un
      // incidente que reinició la app en cadena mientras la base ya estaba
      // vacía, cada uno de esos arranques generó un backup inmediato (ver
      // startAutoBackup) que también quedó vacío — así que los backups más
      // recientes pueden ser justamente los inútiles. Por eso se usa la
      // MISMA cascada de recuperacionEmergencia(): prueba el más reciente con
      // contenido real y, si no lo encuentra o está dañado, retrocede en el
      // historial de 7 días hasta encontrar uno útil. Esa función además ya
      // no hace nada si ningún backup tiene contenido real (instalación
      // realmente nueva y sin evidencia de negocio previo), así que es segura
      // de intentar siempre que la base actual esté confirmada vacía.
      logger.critical(
        'Tras actualizar de versión, la base de datos aparece vacía — buscando el backup blindado más reciente con contenido real para restaurar automáticamente',
        undefined,
        { versionAnterior: versionVista, versionActual }
      );

      const recuperacion = await this.recuperacionEmergencia();
      if (recuperacion.exito) {
        logger.critical('Auto-recuperación tras actualización completada', undefined, {
          backup: recuperacion.backupUsado,
          intentos: recuperacion.intentos,
        });
      } else {
        logger.warn('Auto-recuperación tras actualización: no se encontró ningún backup con contenido real utilizable', {
          intentos: recuperacion.intentos,
          error: recuperacion.error,
        });
      }
    } catch (error) {
      logger.error('Error en la verificación de auto-recuperación de arranque', error as Error);
    }
  }

  /**
   * Restaurar backup
   */
  async restoreBackup(timestamp: string): Promise<boolean> {
    try {
      logger.info('🔄 Restaurando backup...', { timestamp });

      const backupKey = `backup_${timestamp}`;
      const backup = await dbManager.getConfig(backupKey) as BackupData;

      if (!backup) {
        logger.error('❌ Backup no encontrado', null, { timestamp });
        return false;
      }

      // Confirmar con el usuario
      const confirmed = confirm(
        `¿Estás seguro de restaurar el backup del ${new Date(backup.timestamp).toLocaleString('es-CO')}?\n\n` +
        `Productos: ${backup.stats.totalProductos}\n` +
        `Ventas: ${backup.stats.totalVentas}\n\n` +
        `ADVERTENCIA: Esto sobrescribirá todos los datos actuales.`
      );

      if (!confirmed) {
        logger.info('❌ Restauración cancelada por el usuario');
        return false;
      }

      // Restaurar datos
      const { datos } = backup;

      // Limpiar datos actuales
      await this.clearAllData();

      // Restaurar productos
      for (const producto of datos.productos) {
        await dbManager.addProducto(producto);
      }

      // Restaurar ventas
      for (const venta of datos.ventas) {
        await dbManager.addVenta(venta);
      }

      // Restaurar usuarios
      for (const usuario of datos.usuarios) {
        await dbManager.addUsuario(usuario);
      }

      // Restaurar config
      for (const item of datos.config) {
        await dbManager.setConfig(item.key, item.value);
      }

      // Restaurar localStorage
      this.saveToLocalStorage('pos-gastos', datos.gastos);
      this.saveToLocalStorage('pos-turnos', datos.turnos);
      if (datos.configEmpresa) this.saveToLocalStorage('codec_pos_config', datos.configEmpresa);
      if (datos.cierresCajaLegacy) this.saveToLocalStorage('pos-cierres-caja', datos.cierresCajaLegacy);
      if (datos.reportesGenerados) this.saveToLocalStorage('pos-reportes-generados', datos.reportesGenerados);
      if (datos.historico) await historicoService.importarDatos(datos.historico).catch(() => {});
      // Datos del módulo de Contabilidad — antes se perdían al restaurar.
      if (datos.categoriasContables) this.saveToLocalStorage('codecpos_categorias_contables', datos.categoriasContables);
      if (datos.ingresosExtra) this.saveToLocalStorage('codecpos_ingresos_extra', datos.ingresosExtra);
      if (datos.presupuestosCategorias) this.saveToLocalStorage('codecpos_presupuestos_categorias', datos.presupuestosCategorias);
      if (datos.gastosRecurrentes) this.saveToLocalStorage('codecpos_gastos_recurrentes', datos.gastosRecurrentes);
      if (datos.metaMensualGanancia != null) this.saveToLocalStorage('codecpos_meta_mensual_ganancia', datos.metaMensualGanancia);

      logger.info('✅ Backup restaurado exitosamente');
      
      // Recargar página
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      return true;
    } catch (error) {
      logger.error('❌ Error restaurando backup', error as Error);
      return false;
    }
  }

  /**
   * Limpiar todos los datos (antes de restaurar)
   */
  private async clearAllData(): Promise<void> {
    // Limpiar IndexedDB
    const productos = await dbManager.getAllProductos();
    for (const producto of productos) {
      await dbManager.deleteProducto(producto.id);
    }

    const ventas = await dbManager.getAllVentas();
    for (const venta of ventas) {
      await dbManager.deleteVenta(venta.id);
    }

    // Limpiar localStorage (excepto datos de sesión)
    const keysToKeep = ['pos-user', 'pos-dark-mode'];
    const allKeys = Object.keys(localStorage);
    
    for (const key of allKeys) {
      if (!keysToKeep.includes(key) && !key.startsWith('backup_')) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Limpiar backups antiguos (mantener solo últimos 30)
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const allConfig = await dbManager.getAllConfig();
      const backups = allConfig.filter(item => item.key.startsWith('backup_'));

      if (backups.length <= this.MAX_BACKUPS) {
        return; // No hay que limpiar
      }

      // Ordenar por timestamp (más antiguos primero)
      const sortedBackups = backups.sort((a, b) => {
        const timeA = new Date(a.key.replace('backup_', '')).getTime();
        const timeB = new Date(b.key.replace('backup_', '')).getTime();
        return timeA - timeB;
      });

      // Eliminar los más antiguos
      const backupsToDelete = sortedBackups.slice(0, backups.length - this.MAX_BACKUPS);

      for (const backup of backupsToDelete) {
        await dbManager.deleteConfig(backup.key);
      }

      logger.info(`🧹 ${backupsToDelete.length} backups antiguos eliminados`);
    } catch (error) {
      logger.error('Error limpiando backups antiguos', error as Error);
    }
  }

  /**
   * Listar backups disponibles
   */
  async listBackups(): Promise<Array<{ timestamp: string; stats: any }>> {
    try {
      const allConfig = await dbManager.getAllConfig();
      const backups = allConfig.filter(item => item.key.startsWith('backup_'));

      return backups
        .map(item => ({
          timestamp: item.key.replace('backup_', ''),
          stats: (item.value as BackupData).stats,
        }))
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA; // Más recientes primero
        });
    } catch (error) {
      logger.error('Error listando backups', error as Error);
      return [];
    }
  }

  /**
   * Iniciar backups automáticos.
   * 🛡️ BLINDAJE: cada 1 hora (además del backup al cierre limpio, ver
   * wireQuitBackupHook()) se genera una copia completa en la ruta segura
   * fuera de %AppData%. Se ejecuta también una vez de inmediato al arrancar
   * para no depender de que la app quede abierta una hora completa.
   */
  private readonly INTERVALO_BACKUP_MS = 60 * 60 * 1000; // 1 hora

  startAutoBackup(): void {
    if (this.autoBackupInterval) {
      return; // Ya está iniciado
    }

    this.createBackup();

    this.autoBackupInterval = window.setInterval(() => {
      this.createBackup();
    }, this.INTERVALO_BACKUP_MS);

    logger.info('⏰ Backups automáticos blindados iniciados (cada 1 hora)');
  }

  /**
   * Detener backups automáticos
   */
  stopAutoBackup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = null;
      logger.info('⏸️ Backups automáticos detenidos');
    }
  }

  /**
   * 🛡️ Backup al cierre limpio: el proceso Main pide un último respaldo justo
   * antes de salir (antes de destruir la ventana). Solo el renderer puede leer
   * el IndexedDB, así que se genera aquí y se confirma de vuelta a Main para
   * que continúe el cierre (con un tope de tiempo del lado de Main por si algo falla).
   */
  wireQuitBackupHook(): void {
    if (!window.electron?.backup?.onBeforeQuitBackup) return;
    window.electron.backup.onBeforeQuitBackup(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        logger.error('Error creando el backup de cierre', error as Error);
      } finally {
        window.electron?.backup?.notifyQuitBackupComplete();
      }
    });
  }

  /**
   * 🛡️ Reduce la ventana de pérdida de datos entre backups automáticos:
   * además del backup por hora, dispara uno extra apenas se registra el
   * cierre de un turno (equivalente a un cierre de caja) o cada cierta
   * cantidad de ventas nuevas. Así, en el peor caso de un apagón justo antes
   * del siguiente backup horario, lo máximo que se puede perder es un puñado
   * de ventas recientes, no una hora completa de operación.
   */
  private ventasDesdeUltimoBackupExtra = 0;
  private readonly VENTAS_PARA_BACKUP_EXTRA = 20;

  wireEventTriggeredBackups(): void {
    storeEvents.on('venta:nueva', () => {
      this.ventasDesdeUltimoBackupExtra++;
      if (this.ventasDesdeUltimoBackupExtra >= this.VENTAS_PARA_BACKUP_EXTRA) {
        this.ventasDesdeUltimoBackupExtra = 0;
        logger.info(`Backup extra disparado tras ${this.VENTAS_PARA_BACKUP_EXTRA} ventas nuevas`);
        this.createBackup();
      }
    });

    storeEvents.on('turno:fin', () => {
      logger.info('Backup extra disparado por cierre de turno/caja');
      this.createBackup();
    });
  }

  // ==================== BACKUP DEL CLIENTE (archivo descargable) ====================
  // A diferencia del backup blindado (oculto, en C:\CodecStudio\CODECPOS\), esta es una
  // copia que el propio cliente descarga, guarda donde quiera (USB, nube, correo) y puede
  // volver a subir para restaurar el sistema si algo sale mal. Vive en Configuración.

  private readonly LS_BACKUP_DIARIO_HABILITADO = 'codec_pos_backup_diario_habilitado';
  private readonly LS_BACKUP_DIARIO_ULTIMA_FECHA = 'codec_pos_backup_diario_ultima_fecha';

  /**
   * Genera un backup completo y dispara la descarga del archivo .json en el
   * navegador (carpeta de Descargas del sistema). El cliente puede guardar
   * este archivo donde quiera como copia de seguridad propia.
   */
  async descargarBackupArchivo(): Promise<boolean> {
    try {
      const backup = await this.createBackup();
      if (!backup) {
        logger.error('No se pudo generar el backup para descargar');
        return false;
      }

      const contenido = JSON.stringify(backup, null, 2);
      const blob = new Blob([contenido], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const fileName = `CODEC_POS_Backup_${this.formatDateForFilename(backup.timestamp)}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      logger.info('📥 Backup descargado por el cliente', { fileName });
      return true;
    } catch (error) {
      logger.error('Error descargando el backup', error as Error);
      return false;
    }
  }

  /**
   * Restaura el sistema a partir de un archivo de backup subido por el cliente
   * (el mismo tipo de archivo que genera descargarBackupArchivo()). Reemplaza
   * TODOS los datos actuales y relanza/recarga la aplicación al terminar.
   */
  async restaurarDesdeArchivo(file: File): Promise<{ exito: boolean; error?: string }> {
    try {
      const contenido = await file.text();
      const backup: BackupData = JSON.parse(contenido);

      if (!backup?.datos || !backup?.stats) {
        return { exito: false, error: 'El archivo no tiene el formato de un backup válido de CODEC POS' };
      }

      logger.critical('Restauración desde archivo subido por el cliente solicitada', undefined, {
        fileName: file.name,
        ventas: backup.stats.totalVentas,
        productos: backup.stats.totalProductos,
      });

      const { datos } = backup;

      await Promise.all([
        dbManager.clearStore('productos'),
        dbManager.clearStore('ventas'),
        dbManager.clearStore('usuarios'),
      ]);

      await Promise.all([
        dbManager.bulkPut('productos', datos.productos || []),
        dbManager.bulkPut('ventas', datos.ventas || []),
        dbManager.bulkPut('usuarios', datos.usuarios || []),
      ]);

      for (const item of datos.config || []) {
        await dbManager.setConfig(item.key, item.value);
      }

      this.saveToLocalStorage('pos-gastos', datos.gastos || []);
      this.saveToLocalStorage('pos-turnos', datos.turnos || []);

      // 🛡️ Ver comentario equivalente en restoreFromSafeBackup(): cierres de
      // caja/estadísticas/reportes viven fuera de CodecPOS_DB.
      if (datos.historico) {
        await historicoService.importarDatos(datos.historico).catch(() => {});
      }
      this.saveToLocalStorage('pos-cierres-caja', datos.cierresCajaLegacy || []);
      this.saveToLocalStorage('pos-reportes-generados', datos.reportesGenerados || []);

      // 🛡️ Ver comentario equivalente en restoreFromSafeBackup(): sincronizar
      // las 3 capas de persistencia de usuarios para que ningún caché viejo
      // de localStorage "tape" a los usuarios recién restaurados.
      const usuariosFusionados = this.mergeUsuariosPreservandoAdmin(datos.usuarios || []);
      this.saveToLocalStorage('codecpos_usuarios', usuariosFusionados);
      this.saveToLocalStorage('codec_pos_usuarios', usuariosFusionados);
      try {
        await (window as any).electronAPI?.guardarUsuarios?.(usuariosFusionados);
      } catch { /* no crítico */ }

      // 🛡️ Clientes del Panel de Administración + sus módulos/permisos.
      this.restaurarClientesAdminYModulos(datos);

      logger.critical('Restauración desde archivo completada — reiniciando aplicación', undefined, {
        ventasRestauradas: (datos.ventas || []).length,
        usuariosRestaurados: (datos.usuarios || []).length,
      });

      if (window.electron?.relaunch) {
        await window.electron.relaunch();
      } else {
        setTimeout(() => window.location.reload(), 800);
      }

      return { exito: true };
    } catch (error) {
      logger.error('Error restaurando desde archivo subido', error as Error, { fileName: file.name });
      return { exito: false, error: 'El archivo no se pudo leer. Verifica que sea un backup válido de CODEC POS.' };
    }
  }

  // ==================== BÚSQUEDA Y RECUPERACIÓN INDIVIDUAL ====================
  // Para cuando NO hace falta restaurar todo el sistema (productos/ventas ya
  // están bien), sino recuperar puntualmente un registro específico que se
  // perdió — típicamente un usuario/empleado, por el bug de caché de
  // localStorage descrito en restoreFromSafeBackup().

  /**
   * Busca un usuario por nombre de usuario, nombre completo o cédula en TODO
   * el historial de backups blindados (hasta 7 días), sin restaurar nada.
   * Devuelve, por cada backup donde aparece, los datos del usuario encontrado
   * y la fecha del backup — para que el desarrollador elija cuál recuperar.
   */
  async buscarUsuarioEnBackups(termino: string): Promise<Array<{
    backupFileName: string;
    backupFecha: string;
    usuario: any;
  }>> {
    const resultados: Array<{ backupFileName: string; backupFecha: string; usuario: any }> = [];
    const busqueda = termino.trim().toLowerCase();
    if (!busqueda) return resultados;

    try {
      const backups = await this.listSafeBackups(); // más reciente primero
      for (const b of backups) {
        try {
          const lectura = await window.electron?.backup?.read(b.fileName);
          if (!lectura?.success || !lectura.data) continue;
          const contenido: BackupData = JSON.parse(lectura.data);
          const usuarios: any[] = contenido.datos?.usuarios || [];

          const encontrado = usuarios.find(u =>
            String(u.username || '').toLowerCase().includes(busqueda) ||
            String(u.nombreCompleto || '').toLowerCase().includes(busqueda) ||
            String(u.cedula || '').toLowerCase().includes(busqueda)
          );

          if (encontrado) {
            resultados.push({ backupFileName: b.fileName, backupFecha: b.fecha, usuario: encontrado });
          }
        } catch { /* backup ilegible — se salta, no interrumpe la búsqueda */ }
      }
    } catch (error) {
      logger.error('Error buscando usuario en backups', error as Error, { termino });
    }

    return resultados;
  }

  /**
   * Recupera UN solo usuario (por ejemplo, encontrado con buscarUsuarioEnBackups)
   * y lo agrega/actualiza en la lista ACTUAL de usuarios del sistema, en las
   * 3 capas de persistencia (IndexedDB, ambas claves de localStorage y el
   * archivo de Electron) — sin tocar productos, ventas, ni al resto de
   * usuarios. No relanza la app; el usuario recuperado aparece de inmediato
   * en Personal del Sistema tras recargar esa pantalla.
   */
  async recuperarUsuarioIndividual(usuario: any): Promise<{ exito: boolean; error?: string }> {
    try {
      const actuales: any[] = JSON.parse(localStorage.getItem('codecpos_usuarios') || '[]');

      const idx = actuales.findIndex((u: any) => u.id === usuario.id || u.username === usuario.username);
      const actualizados = idx >= 0
        ? actuales.map((u: any, i: number) => (i === idx ? usuario : u))
        : [...actuales, usuario];

      await dbManager.updateUsuario(usuario).catch(() => dbManager.addUsuario(usuario).catch(() => {}));

      this.saveToLocalStorage('codecpos_usuarios', actualizados);
      this.saveToLocalStorage('codec_pos_usuarios', actualizados);
      try {
        await (window as any).electronAPI?.guardarUsuarios?.(actualizados);
      } catch { /* no crítico */ }

      logger.critical(`Usuario recuperado individualmente desde backup: ${usuario.username}`, undefined, {
        usuarioId: usuario.id,
        username: usuario.username,
      });

      return { exito: true };
    } catch (error) {
      logger.error('Error recuperando usuario individual', error as Error, { usuario: usuario?.username });
      return { exito: false, error: (error as Error).message };
    }
  }

  /** ¿El cliente activó la descarga automática diaria del backup? */
  isBackupDiarioHabilitado(): boolean {
    return this.getFromLocalStorage(this.LS_BACKUP_DIARIO_HABILITADO, false) === true;
  }

  setBackupDiarioHabilitado(habilitado: boolean): void {
    this.saveToLocalStorage(this.LS_BACKUP_DIARIO_HABILITADO, habilitado);
    logger.info(habilitado ? 'Backup diario descargable activado por el cliente' : 'Backup diario descargable desactivado por el cliente');
  }

  /**
   * Si el backup diario está habilitado y todavía no se ha descargado uno hoy,
   * dispara la descarga automáticamente. Pensado para llamarse una vez al
   * cargar la app (Configuración/POSContext) — no requiere que el sistema
   * quede abierto a una hora exacta, basta con abrir el sistema ese día.
   */
  async verificarYDescargarBackupDiario(): Promise<void> {
    if (!this.isBackupDiarioHabilitado()) return;

    const hoy = new Date().toISOString().split('T')[0];
    const ultimaFecha = this.getFromLocalStorage(this.LS_BACKUP_DIARIO_ULTIMA_FECHA, '');
    if (ultimaFecha === hoy) return; // ya se descargó uno hoy

    const ok = await this.descargarBackupArchivo();
    if (ok) {
      this.saveToLocalStorage(this.LS_BACKUP_DIARIO_ULTIMA_FECHA, hoy);
    }
  }

  /**
   * Diagnóstico rápido: intenta leer productos y ventas directamente de
   * IndexedDB. Si esto falla, es la señal más directa posible de que el
   * motor de datos está bloqueado o corrupto — antes de que el cliente
   * note que "no le está funcionando".
   */
  async verificarSaludBaseDatos(): Promise<{ ok: boolean; productos: number; ventas: number; error?: string }> {
    try {
      const [productos, ventas] = await Promise.all([
        dbManager.getAllProductos(),
        dbManager.getAllVentas(),
      ]);
      return { ok: true, productos: productos.length, ventas: ventas.length };
    } catch (error) {
      return { ok: false, productos: 0, ventas: 0, error: (error as Error).message };
    }
  }

  // ==================== HELPERS ====================

  private getFromLocalStorage(key: string, defaultValue: any): any {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private saveToLocalStorage(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      logger.error(`Error guardando ${key} en localStorage`, error as Error);
    }
  }

  private async getMachineId(): Promise<string> {
    try {
      if (window.electron?.getMachineId) {
        return await window.electron.getMachineId();
      }
      return 'WEB-' + Date.now();
    } catch {
      return 'UNKNOWN';
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private formatDateForFilename(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}`;
  }
}

// Singleton
export const backupService = new BackupService();

// Auto-iniciar backups automáticos + blindaje de arranque/cierre
if (typeof window !== 'undefined') {
  // 🛡️ Si el IndexedDB aparece vacío tras una actualización pero hay un
  // backup blindado con ventas, se restaura antes de arrancar los backups
  // automáticos (para no sobrescribir el backup bueno con uno vacío).
  backupService.verificarYAutoRecuperar().finally(() => {
    backupService.startAutoBackup();
    // 📥 Backup diario descargable para el cliente (Configuración), si lo activó.
    backupService.verificarYDescargarBackupDiario();
  });
  backupService.wireQuitBackupHook();
  backupService.wireEventTriggeredBackups();
}