/**
 * SISTEMA Y BLINDAJE — CODEC POS v2.0
 *
 * Sección de Desarrollador: telemetría en tiempo real, visor de la "caja
 * negra" (auditoría física en disco) y recuperación con un clic.
 *
 * Objetivo: cuando un cliente alegue "el sistema falló solo" o "se borró
 * todo de la nada", este panel da evidencia técnica verificable (usuario de
 * Windows activo, perfiles temporales, errores de motor de datos) y permite
 * reparar o restaurar el sistema en segundos.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  HardDrive,
  Database,
  Clock,
  Terminal,
  RefreshCw,
  Wrench,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  FolderOpen,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
  Printer,
  Network,
  Power,
  Activity,
  Search,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { backupService } from '../../lib/backupService';

interface Telemetria {
  windowsUser: string;
  storagePath: string;
  userDataPath: string;
  dbSizeBytes: number;
  lastBackup: { fileName: string; fecha: string; size: number; integro: boolean | null } | null;
  backupsDir: string;
  logsDir: string;
}

interface InfoSistema {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  release: string;
  arch: string;
}

interface BackupInfo {
  fileName: string;
  fecha: string;
  size: number;
  integro: boolean | null;
}

type EstadoSalud = 'ok' | 'warn' | 'critical' | 'na';

interface DiagnosticoItem {
  label: string;
  estado: EstadoSalud;
  detalle: string;
  icon: typeof Database;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function clasificarLinea(linea: string): 'critical' | 'warn' | 'normal' {
  if (/\[CRITICAL\]|corrupt|corromp|CURRENT|bloque/i.test(linea)) return 'critical';
  if (/\[WARN\]|PERFIL TEMPORAL|\[ERROR\]/i.test(linea)) return 'warn';
  return 'normal';
}

const ESTADO_STYLES: Record<EstadoSalud, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  ok:       { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  warn:     { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  critical: { icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10' },
  na:       { icon: Activity,     color: 'text-slate-400',  bg: 'bg-white/5' },
};

export function SistemaBlindajePanel({ darkMode }: { darkMode: boolean }) {
  const [telemetria, setTelemetria] = useState<Telemetria | null>(null);
  const [infoSistema, setInfoSistema] = useState<InfoSistema | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [reparando, setReparando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [buscandoUsuario, setBuscandoUsuario] = useState(false);
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Array<{ backupFileName: string; backupFecha: string; usuario: any }> | null>(null);
  const [recuperandoUsuarioId, setRecuperandoUsuarioId] = useState<string | null>(null);
  const [estadoActualizacion, setEstadoActualizacion] = useState<{ evento: string; version?: string; porcentaje?: number } | null>(null);
  const [buscandoActualizacion, setBuscandoActualizacion] = useState(false);

  const cargarTodo = useCallback(async () => {
    if (!window.electron?.system?.getTelemetry) {
      setCargando(false);
      return;
    }
    try {
      const [tel, logs, listado, salud, disco, lanStatus, printerStatus, runtimeVersions, osInfo] = await Promise.all([
        window.electron.system.getTelemetry(),
        window.electron.logs?.readRecent(100) ?? Promise.resolve({ success: false, lines: [] as string[] }),
        backupService.listSafeBackups(),
        backupService.verificarSaludBaseDatos(),
        window.electron.system?.getDiskSpace?.() ?? Promise.resolve({ freeBytes: null, usedBytes: null, drive: 'C' }),
        (window as any).electron?.lan?.getStatus?.() ?? Promise.resolve(null),
        (window as any).electron?.printer?.resolveTarget?.() ?? Promise.resolve(null),
        (window as any).electron?.getRuntimeVersions?.() ?? Promise.resolve(null),
        (window as any).electron?.getOSInfo?.() ?? Promise.resolve(null),
      ]);

      setTelemetria(tel);
      if (runtimeVersions && osInfo) {
        setInfoSistema({
          appVersion: runtimeVersions.appVersion,
          electron: runtimeVersions.electron,
          chrome: runtimeVersions.chrome,
          node: runtimeVersions.node,
          platform: osInfo.platform,
          release: osInfo.release,
          arch: osInfo.arch,
        });
      }
      const lineas = logs.success ? logs.lines : [];
      setLogLines(lineas);
      setBackups(listado);

      const erroresCriticos = lineas.filter(l => clasificarLinea(l) === 'critical').length;
      const freeGB = disco.freeBytes != null ? disco.freeBytes / (1024 ** 3) : null;

      setDiagnostico([
        {
          label: 'Motor de base de datos',
          icon: Database,
          estado: salud.ok ? 'ok' : 'critical',
          detalle: salud.ok
            ? `Accesible — ${salud.productos} productos, ${salud.ventas} ventas`
            : `No se pudo leer: ${salud.error || 'error desconocido'}`,
        },
        {
          label: 'Espacio en disco (C:)',
          icon: HardDrive,
          estado: freeGB == null ? 'na' : freeGB < 0.2 ? 'critical' : freeGB < 1 ? 'warn' : 'ok',
          detalle: freeGB == null ? 'No disponible en este sistema' : `${freeGB.toFixed(1)} GB libres`,
        },
        {
          label: 'Impresora térmica',
          icon: Printer,
          estado: printerStatus?.found ? 'ok' : 'warn',
          detalle: printerStatus?.found
            ? `Conectada: ${printerStatus.deviceName}`
            : 'No detectada (revisar solo si el negocio imprime tickets)',
        },
        {
          label: 'Red LAN entre terminales',
          icon: Network,
          estado: !lanStatus || lanStatus.mode === 'none'
            ? 'na'
            : lanStatus.connected ? 'ok' : 'warn',
          detalle: !lanStatus || lanStatus.mode === 'none'
            ? 'Inactiva (terminal única, no requerida)'
            : lanStatus.connected
              ? `Conectada — modo ${lanStatus.mode}`
              : `Configurada en modo ${lanStatus.mode} pero desconectada`,
        },
        {
          label: 'Errores críticos recientes',
          icon: AlertTriangle,
          estado: erroresCriticos === 0 ? 'ok' : 'critical',
          detalle: erroresCriticos === 0
            ? 'Sin errores críticos en el registro reciente'
            : `${erroresCriticos} error(es) crítico(s) en las últimas ${lineas.length} líneas del log`,
        },
      ]);
    } catch (error) {
      console.error('Error cargando panel de blindaje:', error);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
    const interval = setInterval(cargarTodo, 30000); // refrescar cada 30s
    return () => clearInterval(interval);
  }, [cargarTodo]);

  useEffect(() => {
    const desuscribir = (window as any).electron?.onUpdateEvent?.((data: { evento: string; version?: string; porcentaje?: number }) => {
      setEstadoActualizacion(data);
      if (data.evento === 'disponible') toast.info(`Nueva versión disponible: v${data.version}. Descargando en segundo plano...`);
      if (data.evento === 'lista') toast.success(`Versión v${data.version} lista para instalar.`);
    });
    return () => desuscribir?.();
  }, []);

  const handleBuscarActualizacion = async () => {
    setBuscandoActualizacion(true);
    try {
      await (window as any).electron?.checarActualizaciones?.();
      toast.info('Buscando actualizaciones de Codec POS...');
    } finally {
      setTimeout(() => setBuscandoActualizacion(false), 3000);
    }
  };

  const handleInstalarActualizacion = async () => {
    await (window as any).electron?.instalarActualizacionAhora?.();
  };

  const handleReparar = async () => {
    if (!confirm(
      'Esto limpiará el almacenamiento local corrupto (IndexedDB/localStorage) y probará ' +
      'automáticamente el backup blindado más reciente disponible. Si está dañado, se prueba ' +
      'el siguiente más antiguo hasta encontrar uno que funcione. ¿Continuar?'
    )) return;

    setReparando(true);
    try {
      const resultado = await backupService.repairDatabase();
      if (resultado.success) {
        toast.success(resultado.restaurado
          ? `Base de datos reparada y restaurada (backup: ${resultado.backupUsado}, ${resultado.intentos} intento(s)). Reiniciando...`
          : 'Reparación completada. Reiniciando...');
      } else {
        toast.error(`No se pudo reparar: ${resultado.error || 'error desconocido'}`);
      }
    } finally {
      setReparando(false);
    }
  };

  const handleReiniciar = async () => {
    if (!confirm(
      'Esto cierra y vuelve a abrir CODEC POS. No borra ni modifica ningún dato — úsalo cuando ' +
      'el sistema se sienta lento, la red LAN quede colgada o la impresora deje de responder. ¿Continuar?'
    )) return;

    setReiniciando(true);
    try {
      if (window.electron?.relaunch) {
        await window.electron.relaunch();
      } else {
        window.location.reload();
      }
    } finally {
      setReiniciando(false);
    }
  };

  const handleRestaurar = async (fileName: string) => {
    if (!confirm(
      `¿Restaurar el backup "${fileName}"?\n\nEsto reemplazará TODOS los datos actuales ` +
      `(productos, ventas, usuarios) por los del backup seleccionado y reiniciará la app.`
    )) return;

    setRestaurando(fileName);
    try {
      const ok = await backupService.restoreFromSafeBackup(fileName);
      if (!ok) {
        toast.error('No se pudo restaurar el backup seleccionado');
        setRestaurando(null);
      }
      // Si tuvo éxito, la app se relanza sola — no hace falta limpiar estado.
    } catch {
      setRestaurando(null);
    }
  };

  const handleBuscarUsuario = async () => {
    if (!terminoBusqueda.trim()) {
      toast.error('Escribe un usuario, nombre o cédula para buscar');
      return;
    }
    setBuscandoUsuario(true);
    setResultadosBusqueda(null);
    try {
      const resultados = await backupService.buscarUsuarioEnBackups(terminoBusqueda);
      setResultadosBusqueda(resultados);
      if (resultados.length === 0) {
        toast.info('No se encontró ningún usuario con ese criterio en los backups disponibles');
      } else {
        toast.success(`Encontrado en ${resultados.length} backup(s)`);
      }
    } finally {
      setBuscandoUsuario(false);
    }
  };

  const handleRecuperarUsuario = async (usuario: any) => {
    if (!confirm(
      `¿Recuperar al usuario "${usuario.username}" (${usuario.nombreCompleto})?\n\n` +
      `Se agregará/actualizará en la lista actual de usuarios, sin tocar productos ni ventas.`
    )) return;

    setRecuperandoUsuarioId(usuario.id || usuario.username);
    try {
      const resultado = await backupService.recuperarUsuarioIndividual(usuario);
      if (resultado.exito) {
        toast.success(`Usuario "${usuario.username}" recuperado — ya aparece en Personal del Sistema`);
      } else {
        toast.error(resultado.error || 'No se pudo recuperar el usuario');
      }
    } finally {
      setRecuperandoUsuarioId(null);
    }
  };

  const handleBackupManual = async () => {
    toast.info('Generando backup blindado...');
    const backup = await backupService.createBackup();
    if (backup) {
      toast.success('Backup blindado generado correctamente');
      cargarTodo();
    } else {
      toast.error('No se pudo generar el backup');
    }
  };

  if (!window.electron?.system?.getTelemetry) {
    return (
      <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
            Este panel solo está disponible dentro de la aplicación de escritorio (Electron).
          </p>
        </CardContent>
      </Card>
    );
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const cardCls = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white';
  const labelCls = darkMode ? 'text-gray-400' : 'text-gray-500';
  const valueCls = darkMode ? 'text-white' : 'text-gray-900';

  return (
    <div className="space-y-6">
      {/* ═══ BLOQUE A: TELEMETRÍA Y ESTADO ACTUAL ═══ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cardCls}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className={valueCls}>Telemetría y Estado Actual</CardTitle>
                  <CardDescription className={labelCls}>Estado en vivo del sistema y su blindaje</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={cargarTodo} className={darkMode ? 'border-slate-600' : ''}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <User className={`w-5 h-5 mt-0.5 flex-shrink-0 ${telemetria?.windowsUser?.toLowerCase().includes('temp') ? 'text-red-500' : 'text-emerald-500'}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${labelCls}`}>Usuario de Windows activo</p>
                <p className={`font-mono text-sm truncate ${valueCls}`}>{telemetria?.windowsUser || '—'}</p>
                {telemetria?.windowsUser?.toLowerCase().includes('temp') && (
                  <p className="text-xs text-red-500 font-semibold mt-0.5">⚠ Perfil temporal detectado</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FolderOpen className={`w-5 h-5 mt-0.5 flex-shrink-0 ${labelCls}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${labelCls}`}>Ruta de almacenamiento local</p>
                <p className={`font-mono text-xs break-all ${valueCls}`}>{telemetria?.storagePath || '—'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Database className={`w-5 h-5 mt-0.5 flex-shrink-0 ${labelCls}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${labelCls}`}>Tamaño de la base de datos</p>
                <p className={`font-mono text-sm ${valueCls}`}>{formatBytes(telemetria?.dbSizeBytes || 0)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className={`w-5 h-5 mt-0.5 flex-shrink-0 ${labelCls}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${labelCls}`}>Último backup blindado exitoso</p>
                <p className={`font-mono text-sm ${valueCls}`}>
                  {telemetria?.lastBackup ? new Date(telemetria.lastBackup.fecha).toLocaleString('es-CO') : 'Sin backups aún'}
                </p>
                {telemetria?.lastBackup && (
                  <p className={`text-xs ${labelCls}`}>
                    {formatBytes(telemetria.lastBackup.size)}
                    {telemetria.lastBackup.integro === false && (
                      <span className="ml-2 text-red-500 font-semibold">⚠ Dañado — no se restaurará automáticamente</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ BLOQUE A.5: DIAGNÓSTICO RÁPIDO ═══ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
        <Card className={cardCls}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className={valueCls}>Diagnóstico Rápido</CardTitle>
                <CardDescription className={labelCls}>Chequeo de salud del sistema — útil para atender una llamada del cliente sin adivinar</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {diagnostico.map(item => {
              const style = ESTADO_STYLES[item.estado];
              const EstadoIcon = style.icon;
              return (
                <div
                  key={item.label}
                  className={`flex items-start gap-3 p-3 rounded-xl ${darkMode ? style.bg : 'bg-gray-50'}`}
                >
                  <EstadoIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.color}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${valueCls}`}>{item.label}</p>
                    <p className={`text-xs ${labelCls}`}>{item.detalle}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ BLOQUE B: VISOR DE AUDITORÍA DINÁMICO ═══ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className={cardCls}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center">
                <Terminal className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <CardTitle className={valueCls}>Caja Negra — Visor de Auditoría</CardTitle>
                <CardDescription className={labelCls}>Últimas {logLines.length} líneas del log físico ({telemetria?.logsDir})</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-xl p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1" style={{ scrollbarWidth: 'thin' }}>
              {logLines.length === 0 ? (
                <p className="text-gray-500">Aún no hay registros en el log.</p>
              ) : (
                logLines.map((linea, idx) => {
                  const tipo = clasificarLinea(linea);
                  const color = tipo === 'critical' ? 'text-red-400' : tipo === 'warn' ? 'text-amber-400' : 'text-emerald-300';
                  return <p key={idx} className={`${color} whitespace-pre-wrap break-all`}>{linea}</p>;
                })
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ BLOQUE C: MÓDULO DE RECUPERACIÓN ═══ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className={cardCls}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-red-600 to-orange-600 rounded-xl flex items-center justify-center">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className={valueCls}>Recuperación con un Clic</CardTitle>
                <CardDescription className={labelCls}>Reparar el motor de datos o restaurar un backup blindado</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className={`p-4 rounded-xl flex items-center justify-between gap-4 ${darkMode ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-blue-50 border border-blue-200'}`}>
              <div>
                <p className={`font-semibold text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>Reiniciar Aplicación</p>
                <p className={`text-xs ${darkMode ? 'text-blue-200/70' : 'text-blue-700/80'}`}>
                  Cierra y vuelve a abrir CODEC POS sin tocar ningún dato. Úsalo primero cuando el
                  sistema se sienta lento, la red LAN quede colgada o la impresora deje de responder.
                </p>
              </div>
              <Button
                onClick={handleReiniciar}
                disabled={reiniciando}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
              >
                {reiniciando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
                Reiniciar
              </Button>
            </div>

            <div className={`p-4 rounded-xl flex items-center justify-between gap-4 ${darkMode ? 'bg-red-900/20 border border-red-700/30' : 'bg-red-50 border border-red-200'}`}>
              <div>
                <p className={`font-semibold text-sm ${darkMode ? 'text-red-300' : 'text-red-800'}`}>Reparar Base de Datos</p>
                <p className={`text-xs ${darkMode ? 'text-red-200/70' : 'text-red-700/80'}`}>
                  Para casos de apagón repentino (archivos CURRENT dañados o bloqueos de índices).
                  Limpia el almacenamiento corrupto y restaura el último backup disponible.
                </p>
              </div>
              <Button
                onClick={handleReparar}
                disabled={reparando}
                className="bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
              >
                {reparando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
                Reparar
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <p className={`font-semibold text-sm ${valueCls}`}>Backups disponibles (últimos 7 días)</p>
              <Button variant="outline" size="sm" onClick={handleBackupManual} className={darkMode ? 'border-slate-600' : ''}>
                <HardDrive className="w-4 h-4 mr-2" />
                Generar backup ahora
              </Button>
            </div>

            {backups.length === 0 ? (
              <p className={`text-sm ${labelCls}`}>Aún no se ha generado ningún backup blindado.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {backups.map(b => {
                  const dañado = b.integro === false;
                  return (
                  <div
                    key={b.fileName}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      dañado
                        ? darkMode ? 'bg-red-500/[0.04] border-red-500/20' : 'bg-red-50 border-red-200'
                        : darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-mono truncate ${valueCls}`}>{new Date(b.fecha).toLocaleString('es-CO')}</p>
                      <p className={`text-xs ${labelCls}`}>
                        {formatBytes(b.size)} · {b.fileName}
                        {dañado && <span className="ml-2 text-red-500 font-semibold">⚠ Dañado</span>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleRestaurar(b.fileName)}
                      disabled={restaurando !== null || dañado}
                      title={dañado ? 'Este backup no se puede restaurar — checksum no coincide' : undefined}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white flex-shrink-0 disabled:opacity-40"
                    >
                      {restaurando === b.fileName ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                      Restaurar Datos
                    </Button>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ BLOQUE D: BUSCAR Y RECUPERAR UN USUARIO PUNTUAL ═══ */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className={cardCls}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className={valueCls}>Buscar y Recuperar Usuario</CardTitle>
                <CardDescription className={labelCls}>
                  Para cuando falta un usuario puntual (p. ej. tras una restauración) sin necesidad de restaurar todo el sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={terminoBusqueda}
                onChange={e => setTerminoBusqueda(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleBuscarUsuario(); }}
                placeholder="Usuario, nombre completo o cédula (ej: tecknostark)"
                className={darkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500' : ''}
              />
              <Button onClick={handleBuscarUsuario} disabled={buscandoUsuario} className="bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0">
                {buscandoUsuario ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar
              </Button>
            </div>

            {resultadosBusqueda !== null && (
              resultadosBusqueda.length === 0 ? (
                <p className={`text-sm ${labelCls}`}>No se encontró ningún usuario con ese criterio en los backups de los últimos 7 días.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {resultadosBusqueda.map((r, idx) => {
                    const recuperando = recuperandoUsuarioId === (r.usuario.id || r.usuario.username);
                    return (
                      <div
                        key={`${r.backupFileName}-${idx}`}
                        className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${valueCls}`}>{r.usuario.nombreCompleto} <span className={labelCls}>· @{r.usuario.username}</span></p>
                          <p className={`text-xs ${labelCls}`}>
                            {r.usuario.rol} · {r.usuario.activo ? 'Activo' : 'Inactivo'} · Encontrado en backup del {new Date(r.backupFecha).toLocaleString('es-CO')}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleRecuperarUsuario(r.usuario)}
                          disabled={recuperandoUsuarioId !== null}
                          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white flex-shrink-0"
                        >
                          {recuperando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserCheck className="w-4 h-4 mr-1" />}
                          Recuperar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </motion.div>

      {infoSistema && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={darkMode ? 'bg-slate-800/50 border-slate-700' : ''}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 text-base ${valueCls}`}>
                <Terminal className="w-4 h-4" />
                Acerca del sistema
              </CardTitle>
              <CardDescription>
                Información técnica útil para soporte — versión instalada y entorno de ejecución.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className={labelCls}>Codec POS</p><p className={`font-medium ${valueCls}`}>v{infoSistema.appVersion}</p></div>
                <div><p className={labelCls}>Electron</p><p className={`font-medium ${valueCls}`}>{infoSistema.electron}</p></div>
                <div><p className={labelCls}>Chrome</p><p className={`font-medium ${valueCls}`}>{infoSistema.chrome}</p></div>
                <div><p className={labelCls}>Node</p><p className={`font-medium ${valueCls}`}>{infoSistema.node}</p></div>
                <div><p className={labelCls}>Sistema operativo</p><p className={`font-medium ${valueCls}`}>{infoSistema.platform} {infoSistema.release}</p></div>
                <div><p className={labelCls}>Arquitectura</p><p className={`font-medium ${valueCls}`}>{infoSistema.arch}</p></div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-3 flex-wrap">
                {estadoActualizacion?.evento === 'lista' ? (
                  <>
                    <p className="text-sm text-emerald-400">Versión v{estadoActualizacion.version} lista para instalar.</p>
                    <Button size="sm" onClick={handleInstalarActualizacion} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      Instalar y reiniciar
                    </Button>
                  </>
                ) : estadoActualizacion?.evento === 'descargando' ? (
                  <p className="text-sm text-slate-400">Descargando actualización... {estadoActualizacion.porcentaje ?? 0}%</p>
                ) : estadoActualizacion?.evento === 'disponible' ? (
                  <p className="text-sm text-slate-400">Nueva versión v{estadoActualizacion.version} disponible, descargando...</p>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleBuscarActualizacion} disabled={buscandoActualizacion} className={darkMode ? 'border-slate-600' : ''}>
                    Buscar actualizaciones
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

export default SistemaBlindajePanel;
