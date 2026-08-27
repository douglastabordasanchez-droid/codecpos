/**
 * CODEC POS v2.0 – Sección de gestión de personal del sistema
 * Acceso exclusivo: Admin maestro en el Panel de Desarrollador
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Search, Lock, Unlock, Eye, EyeOff, RefreshCw,
  Download, Upload, ChevronDown, ChevronUp, Shield,
  CheckCircle2, XCircle, KeyRound, Check, X,
  FileSpreadsheet, ExternalLink, AlertTriangle, User, Crown,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import {
  MODULOS_CATALOGO,
  MODULOS_CLIENTE_OFICIALES,
  ModuloPOS,
  obtenerPermisosUsuario,
  guardarPermisosUsuarioPersistente,
  esModuloActivoGlobal,
} from '../../lib/permissions';
import { hashPassword } from '../../lib/passwordHash';

interface UsuarioLocal {
  id: string;
  nombreCompleto: string;
  cedula?: string;
  username: string;
  password: string;
  rol: string;
  activo: boolean;
  cargo?: string;
  creadoPor?: string;
}

const ROL_COLOR: Record<string, string> = {
  admin: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  administrador: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  super_usuario: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  tecnico: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
};
const rolColor = (rol: string) => ROL_COLOR[rol.toLowerCase()] ?? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';

const ROL_AVATAR: Record<string, string> = {
  admin: 'from-purple-600 to-indigo-600',
  administrador: 'from-purple-600 to-indigo-600',
  super_usuario: 'from-amber-500 to-orange-500',
  tecnico: 'from-blue-500 to-cyan-500',
};
const rolAvatar = (rol: string) => ROL_AVATAR[rol.toLowerCase()] ?? 'from-emerald-500 to-teal-500';

const modulosCliente = MODULOS_CATALOGO.filter(m => MODULOS_CLIENTE_OFICIALES.includes(m.id));

function parsearCSV(text: string): UsuarioLocal[] | null {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, '').trim());
  const idx = (name: string) => headers.findIndex(h => h.includes(name));
  const idIdx      = idx('id');
  const userIdx    = idx('usuario');
  const pwdIdx     = idx('contraseña') >= 0 ? idx('contraseña') : idx('password');
  const nameIdx    = idx('nombre');
  const cedulaIdx  = idx('dula');
  const rolIdx     = idx('rol');
  const activoIdx  = idx('activo');
  if (userIdx < 0) return null;
  return lines.slice(1)
    .map(l => l.split(sep))
    .filter(cols => cols[userIdx]?.trim())
    .map(cols => ({
      id:             idIdx >= 0 ? cols[idIdx]?.trim() || '' : '',
      username:       cols[userIdx]?.trim() || '',
      password:       pwdIdx >= 0 ? cols[pwdIdx]?.trim() || '' : '',
      nombreCompleto: nameIdx >= 0 ? cols[nameIdx]?.trim() || '' : '',
      cedula:         cedulaIdx >= 0 ? cols[cedulaIdx]?.trim() : undefined,
      rol:            rolIdx >= 0 ? cols[rolIdx]?.trim() || 'cajero' : 'cajero',
      activo:         activoIdx >= 0 ? cols[activoIdx]?.trim().toUpperCase() === 'SI' : true,
    }));
}

export function PersonalAdminSection({ darkMode: dm }: { darkMode: boolean }) {
  const [usuarios, setUsuarios] = useState<UsuarioLocal[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('TODOS');

  // Expanded state: 'permisos' | 'resetPwd' | null per user
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<'permisos' | 'resetPwd'>('permisos');

  // Password reset
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);

  // Permissions draft
  const [permisosDraft, setPermisosDraft] = useState<Record<string, Set<ModuloPOS>>>({});

  // Google Sheets sync
  const [sheetUrl, setSheetUrl]   = useState(() => localStorage.getItem('codecpos_dev_sheet_url') || '');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [lastSync, setLastSync]   = useState<string | null>(() => localStorage.getItem('codecpos_dev_sheet_last_sync'));
  const [showInstructions, setShowInstructions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargarUsuarios = () => {
    try {
      const raw = localStorage.getItem('codecpos_usuarios');
      setUsuarios(raw ? JSON.parse(raw) : []);
    } catch { setUsuarios([]); }
  };

  useEffect(() => {
    cargarUsuarios();
    // Auto-sync on mount if URL is saved
    const savedUrl = localStorage.getItem('codecpos_dev_sheet_url');
    if (savedUrl) sincronizarDesdeSheet(savedUrl, true);
    const handler = () => cargarUsuarios();
    window.addEventListener('codecpos:usuarios-sincronizados', handler);
    return () => window.removeEventListener('codecpos:usuarios-sincronizados', handler);
  }, []);

  const guardarUsuariosLocal = (list: UsuarioLocal[]) => {
    localStorage.setItem('codecpos_usuarios', JSON.stringify(list));
    setUsuarios(list);
    window.dispatchEvent(new CustomEvent('codecpos:usuarios-sincronizados'));
  };

  const toggleActivo = (id: string) => {
    const u = usuarios.find(u => u.id === id);
    if (!u) return;
    guardarUsuariosLocal(usuarios.map(x => x.id === id ? { ...x, activo: !x.activo } : x));
    toast.success(u.activo ? 'Usuario bloqueado' : 'Usuario habilitado', { description: u.nombreCompleto });
  };

  const confirmarResetPassword = (id: string) => {
    if (!resetPwdValue || resetPwdValue.length < 4) { toast.error('Mínimo 4 caracteres'); return; }
    // 🛡️ FIX seguridad: esto guardaba resetPwdValue (texto plano tal cual lo
    // escribió el admin) directo en localStorage, saltándose hashPassword()
    // que sí usa el resto de usuariosStorage.ts -- cualquiera con acceso al
    // localStorage de la máquina podía leer la contraseña real del usuario.
    guardarUsuariosLocal(usuarios.map(u => u.id === id ? { ...u, password: hashPassword(resetPwdValue) } : u));
    toast.success('Contraseña restablecida');
    setExpandedId(null);
    setResetPwdValue('');
    setShowResetPwd(false);
  };

  // ── Permissions ──
  const initDraft = (userId: string) => {
    if (permisosDraft[userId]) return;
    const p = obtenerPermisosUsuario(userId);
    setPermisosDraft(prev => ({ ...prev, [userId]: new Set(p.modulosHabilitados) }));
  };

  const togglePermisoLocal = (userId: string, modulo: ModuloPOS) => {
    setPermisosDraft(prev => {
      const s = new Set(prev[userId] || []);
      s.has(modulo) ? s.delete(modulo) : s.add(modulo);
      return { ...prev, [userId]: s };
    });
  };

  const guardarPermisos = async (userId: string) => {
    const list = Array.from(permisosDraft[userId] || []);
    await guardarPermisosUsuarioPersistente({ userId, modulosHabilitados: list });
    toast.success('Permisos guardados');
  };

  // ── CSV Export ──
  const exportarCSV = () => {
    const sep = ';';
    const headers = ['ID', 'Usuario', 'Contraseña', 'Nombre Completo', 'Cédula', 'Rol', 'Activo'].join(sep);
    const rows = usuarios.map(u =>
      [u.id, u.username, u.password, u.nombreCompleto, u.cedula || '', u.rol, u.activo ? 'SI' : 'NO'].join(sep)
    );
    const csv = '﻿' + [headers, ...rows].join('\n'); // BOM for Excel/Sheets encoding
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codecpos_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exportado — ${usuarios.length} usuarios`);
  };

  // ── CSV Import (from file) ──
  const importarArchivoCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string || '').replace(/\r/g, '');
      const importados = parsearCSV(text);
      if (!importados) { toast.error('Formato CSV inválido — revisa las columnas'); return; }
      aplicarImportacion(importados);
    };
    reader.readAsText(file, 'utf-8');
  };

  const aplicarImportacion = (importados: UsuarioLocal[]) => {
    let actualizados = 0;
    const lista = usuarios.map(u => {
      // 🛡️ FIX: esta importación (CSV manual o auto-sync silencioso de
      // Google Sheets al abrir la pestaña) es para personal/cajeros
      // internos. Las cuentas creadas por el Panel de Administración
      // (creadoPor === 'PANEL_DESARROLLADOR') viven en el mismo arreglo
      // 'codecpos_usuarios' pero NUNCA deben tocarse aquí — una fila vacía o
      // desfasada en el Sheet podía desactivar a un cliente sin ninguna
      // confirmación, indistinguible de "se borró la cuenta".
      if ((u as any)?.creadoPor === 'PANEL_DESARROLLADOR') return u;
      const match = importados.find(i => (i.id && i.id === u.id) || i.username === u.username);
      if (!match) return u;
      actualizados++;
      return {
        ...u,
        // 🛡️ FIX seguridad: el Sheet/CSV trae la contraseña en texto plano
        // (un humano la escribió en la celda) -- se hashea antes de guardarla,
        // igual que confirmarResetPassword() de arriba.
        ...(match.password ? { password: hashPassword(match.password) } : {}),
        ...(match.nombreCompleto ? { nombreCompleto: match.nombreCompleto } : {}),
        ...(match.cedula !== undefined ? { cedula: match.cedula } : {}),
        ...(match.rol ? { rol: match.rol } : {}),
        activo: match.activo,
      };
    });
    guardarUsuariosLocal(lista);
    toast.success(`Importación completada`, { description: `${actualizados} usuarios actualizados` });
  };

  // ── Sync from Sheet ──
  const sincronizarDesdeSheet = async (url: string, silencioso = false) => {
    if (!url.trim()) { if (!silencioso) toast.error('Ingresa la URL del Sheet publicado'); return; }
    setSyncStatus('syncing');
    try {
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).replace(/\r/g, '');
      const importados = parsearCSV(text);
      if (!importados) throw new Error('Formato no reconocido');
      aplicarImportacion(importados);
      const ahora = new Date().toLocaleString('es-CO');
      setLastSync(ahora);
      localStorage.setItem('codecpos_dev_sheet_last_sync', ahora);
      setSyncStatus('ok');
      if (!silencioso) toast.success('Sincronización completada desde Google Sheets');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err: any) {
      setSyncStatus('error');
      if (!silencioso) toast.error('Error al sincronizar', { description: err.message || String(err) });
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const guardarSheetUrl = (url: string) => {
    setSheetUrl(url);
    localStorage.setItem('codecpos_dev_sheet_url', url);
  };

  // ── Expand toggle ──
  const toggleExpand = (id: string, mode: 'permisos' | 'resetPwd') => {
    if (expandedId === id && expandedMode === mode) {
      setExpandedId(null);
      setResetPwdValue('');
      setShowResetPwd(false);
    } else {
      setExpandedId(id);
      setExpandedMode(mode);
      setResetPwdValue('');
      setShowResetPwd(false);
      if (mode === 'permisos') initDraft(id);
    }
  };

  // ── Filtering ──
  const usuariosFiltrados = usuarios.filter(u => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || u.nombreCompleto.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.cedula || '').includes(q);
    const matchRol = filtroRol === 'TODOS' || u.rol.toLowerCase() === filtroRol.toLowerCase();
    return matchQ && matchRol;
  });

  const stats = {
    total: usuarios.length,
    activos: usuarios.filter(u => u.activo).length,
    bloqueados: usuarios.filter(u => !u.activo).length,
  };

  const rolesUnicos = [...new Set(usuarios.map(u => u.rol.toLowerCase()))];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5">

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Usuarios', value: stats.total,     icon: Users,        color: 'text-indigo-500' },
          { label: 'Activos',        value: stats.activos,   icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'Bloqueados',     value: stats.bloqueados, icon: XCircle,      color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className={`border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className={`text-xs font-semibold ${dm ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
              </div>
              <Icon className={`w-8 h-8 ${color} opacity-70`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Google Sheets Sync ── */}
      <Card className={`border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h3 className={`text-sm font-bold ${dm ? 'text-white' : 'text-slate-900'}`}>Sincronización con Google Sheets</h3>
              <p className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                {lastSync ? `Última sincronización: ${lastSync}` : 'Sin sincronizaciones registradas'}
              </p>
            </div>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${dm ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              ¿Cómo configurar? {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <AnimatePresence>
            {showInstructions && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className={`rounded-xl p-4 text-xs space-y-2 ${dm ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}
              >
                <p className={`font-bold ${dm ? 'text-white' : 'text-slate-800'}`}>Pasos para conectar Google Sheets:</p>
                <ol className={`space-y-1.5 list-decimal list-inside ${dm ? 'text-slate-300' : 'text-slate-600'}`}>
                  <li>Haz clic en <b>"Exportar CSV"</b> para descargar el listado de usuarios.</li>
                  <li>Abre <b>Google Sheets</b>, crea una hoja nueva e importa el CSV (Archivo → Importar).</li>
                  <li>Desde esa hoja ve a <b>Archivo → Compartir → Publicar en la web</b>.</li>
                  <li>Selecciona la hoja y el formato <b>"Valores separados por comas (.csv)"</b> → Publicar.</li>
                  <li>Copia la URL generada y pégala abajo. ¡Listo!</li>
                </ol>
                <p className={`${dm ? 'text-amber-300' : 'text-amber-700'}`}>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Para <b>bloquear un usuario</b> desde el Sheet, cambia la columna <b>Activo</b> de SI a NO y luego sincroniza.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* URL input + sync */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <FileSpreadsheet className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${dm ? 'text-slate-400' : 'text-slate-400'}`} />
              <Input
                value={sheetUrl}
                onChange={e => guardarSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                className={`pl-9 h-9 text-xs font-mono ${dm ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 placeholder:text-slate-400'}`}
              />
            </div>
            <Button
              onClick={() => sincronizarDesdeSheet(sheetUrl)}
              disabled={syncStatus === 'syncing'}
              className={`h-9 px-4 text-xs font-semibold gap-1.5 shrink-0 ${
                syncStatus === 'ok'    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                syncStatus === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' :
                'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? 'Sincronizado' : syncStatus === 'error' ? 'Error' : 'Sincronizar'}
            </Button>
          </div>

          {/* Export / Import */}
          <div className="flex gap-2">
            <Button
              onClick={exportarCSV}
              variant="outline"
              className={`flex-1 h-9 text-xs font-semibold gap-1.5 ${dm ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}
            >
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </Button>
            <Button
              onClick={() => fileRef.current?.click()}
              variant="outline"
              className={`flex-1 h-9 text-xs font-semibold gap-1.5 ${dm ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}
            >
              <Upload className="w-3.5 h-3.5" /> Importar CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importarArchivoCSV(f); e.target.value = ''; }} />
          </div>
        </CardContent>
      </Card>

      {/* ── Search & filter ── */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-slate-400' : 'text-slate-400'}`} />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, usuario o cédula…"
            className={`pl-10 ${dm ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white'}`}
          />
        </div>
        <select
          value={filtroRol}
          onChange={e => setFiltroRol(e.target.value)}
          className={`h-10 px-3 rounded-md border text-sm ${dm ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
        >
          <option value="TODOS">Todos los roles</option>
          {rolesUnicos.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <Button
          onClick={cargarUsuarios}
          variant="outline"
          className={`h-10 w-10 p-0 shrink-0 ${dm ? 'border-slate-700 hover:bg-slate-700' : ''}`}
          title="Recargar lista"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* ── User list ── */}
      <div className="space-y-2">
        {usuariosFiltrados.length === 0 ? (
          <Card className={`border ${dm ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
            <CardContent className="py-10 text-center">
              <Users className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`text-sm ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                {usuarios.length === 0 ? 'No hay usuarios registrados en el sistema' : 'Sin resultados para la búsqueda'}
              </p>
            </CardContent>
          </Card>
        ) : (
          usuariosFiltrados.map(usuario => {
            const isExpanded      = expandedId === usuario.id;
            const isPermExpanded  = isExpanded && expandedMode === 'permisos';
            const isPwdExpanded   = isExpanded && expandedMode === 'resetPwd';
            const draft           = permisosDraft[usuario.id];
            const permCount       = draft?.size ?? obtenerPermisosUsuario(usuario.id).modulosHabilitados.length;

            return (
              <Card
                key={usuario.id}
                className={`border overflow-hidden transition-shadow ${
                  !usuario.activo
                    ? dm ? 'bg-red-950/20 border-red-800/30' : 'bg-red-50/60 border-red-200'
                    : dm ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4">
                  {/* ── Main row ── */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${rolAvatar(usuario.rol)} flex items-center justify-center shrink-0 text-white font-bold text-sm`}>
                      {usuario.nombreCompleto.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold text-sm truncate ${dm ? 'text-white' : 'text-slate-900'}`}>
                          {usuario.nombreCompleto}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${rolColor(usuario.rol)}`}>
                          {usuario.rol}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          usuario.activo
                            ? dm ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                            : dm ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700'
                        }`}>
                          {usuario.activo ? '● Activo' : '● Bloqueado'}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                        @{usuario.username}
                        {usuario.cedula && <span> · CC {usuario.cedula}</span>}
                        <span className={`ml-2 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                          {permCount} permisos activos
                        </span>
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Block / Unblock */}
                      <button
                        onClick={() => toggleActivo(usuario.id)}
                        title={usuario.activo ? 'Bloquear acceso' : 'Habilitar acceso'}
                        className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${
                          usuario.activo
                            ? dm ? 'border-slate-600 hover:bg-red-900/30 hover:border-red-600 text-slate-400 hover:text-red-400' : 'border-slate-200 hover:bg-red-50 hover:border-red-300 text-slate-500 hover:text-red-500'
                            : dm ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40' : 'border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {usuario.activo ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      {/* Reset password */}
                      <button
                        onClick={() => toggleExpand(usuario.id, 'resetPwd')}
                        title="Restablecer contraseña"
                        className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${
                          isPwdExpanded
                            ? dm ? 'border-amber-500/40 bg-amber-900/20 text-amber-400' : 'border-amber-300 bg-amber-50 text-amber-600'
                            : dm ? 'border-slate-600 hover:bg-slate-700 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                        }`}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>

                      {/* Permissions */}
                      <button
                        onClick={() => toggleExpand(usuario.id, 'permisos')}
                        title="Gestionar permisos"
                        className={`h-8 flex items-center gap-1 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                          isPermExpanded
                            ? dm ? 'border-indigo-500/40 bg-indigo-900/20 text-indigo-400' : 'border-indigo-300 bg-indigo-50 text-indigo-600'
                            : dm ? 'border-slate-600 hover:bg-slate-700 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Permisos
                        {isPermExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded: reset password ── */}
                  <AnimatePresence>
                    {isPwdExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`mt-3 pt-3 border-t ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
                          <p className={`text-xs font-semibold mb-2 ${dm ? 'text-amber-300' : 'text-amber-700'}`}>
                            <KeyRound className="w-3 h-3 inline mr-1" />
                            Restablecer contraseña de {usuario.nombreCompleto}
                          </p>
                          <div className="flex gap-2 max-w-sm">
                            <div className="flex-1 relative">
                              <Input
                                type={showResetPwd ? 'text' : 'password'}
                                value={resetPwdValue}
                                onChange={e => setResetPwdValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && confirmarResetPassword(usuario.id)}
                                placeholder="Nueva contraseña (mín. 4 caracteres)"
                                className={`h-9 pr-9 text-xs ${dm ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                              />
                              <button type="button" tabIndex={-1}
                                onClick={() => setShowResetPwd(!showResetPwd)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                              >
                                {showResetPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <Button
                              onClick={() => confirmarResetPassword(usuario.id)}
                              className="h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Guardar
                            </Button>
                            <Button
                              onClick={() => { setExpandedId(null); setResetPwdValue(''); }}
                              variant="outline"
                              className={`h-9 w-9 p-0 ${dm ? 'border-slate-600 hover:bg-slate-700' : ''}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Expanded: permissions ── */}
                  <AnimatePresence>
                    {isPermExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`mt-3 pt-3 border-t ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
                          {/* Permissions header */}
                          <div className="flex items-center justify-between mb-3">
                            <p className={`text-xs font-bold ${dm ? 'text-indigo-300' : 'text-indigo-700'}`}>
                              <Shield className="w-3 h-3 inline mr-1" />
                              Módulos — {usuario.nombreCompleto}
                              <span className={`ml-2 font-normal ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                                {permCount}/{modulosCliente.length} activos
              </span>
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setPermisosDraft(prev => ({ ...prev, [usuario.id]: new Set(modulosCliente.map(m => m.id)) }));
                                }}
                                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${dm ? 'text-indigo-300 hover:bg-indigo-900/30' : 'text-indigo-600 hover:bg-indigo-50'}`}
                              >
                                Activar todo
                              </button>
                              <button
                                onClick={() => {
                                  setPermisosDraft(prev => ({ ...prev, [usuario.id]: new Set() }));
                                }}
                                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${dm ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                Quitar todo
                              </button>
                              <Button
                                onClick={() => guardarPermisos(usuario.id)}
                                className="h-7 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1"
                              >
                                <Check className="w-3 h-3" /> Guardar
                              </Button>
                            </div>
                          </div>

                          {/* Permissions grid */}
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                            {modulosCliente.map(modulo => {
                              const activo = (draft ?? new Set(obtenerPermisosUsuario(usuario.id).modulosHabilitados)).has(modulo.id);
                              const globalOff = !esModuloActivoGlobal(modulo.id);
                              return (
                                <button
                                  key={modulo.id}
                                  type="button"
                                  onClick={() => togglePermisoLocal(usuario.id, modulo.id)}
                                  disabled={globalOff}
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-xs ${
                                    globalOff ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                  } ${
                                    activo
                                      ? dm ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                      : dm ? 'bg-slate-700/40 border-slate-700 text-slate-400 hover:bg-slate-700/70' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                                  }`}
                                >
                                  <span className="text-sm shrink-0">{modulo.icono}</span>
                                  <span className="truncate font-medium">{modulo.nombre}</span>
                                  {activo && <Check className="w-3 h-3 ml-auto shrink-0 text-indigo-400" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
