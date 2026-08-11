/**
 * CODECPOS v2.0 - Contexto de Autenticación
 * Sistema de usuarios y control de acceso
 * ✅ OPTIMIZADO: Sistema robusto de almacenamiento (IndexedDB + localStorage + Electron)
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { electronStore } from '../lib/electronStore';
import { logger } from '../lib/logger';
import UsuariosStorage from '../lib/usuariosStorage';
import {
  obtenerModulosCliente,
  obtenerPermisosUsuario,
  guardarPermisosUsuarioPersistente,
  obtenerModulosGlobales,
  guardarModulosGlobales,
  EVENTO_PERMISOS_ACTUALIZADOS,
  ModuloPOS,
  MODULOS_MAESTRO_OFICIALES,
} from '../lib/permissions';
import { dispararEvento } from '../lib/webhookService';
import { hashPassword, verificarPassword, esHashBcrypt } from '../lib/passwordHash';
import {
  verificarAccesoStaff,
  signInSupabase,
  solicitarRecuperacionPassword as solicitarRecuperacionPasswordSupabase,
} from '../lib/supabase/authService';
import { getSupabaseClient } from '../lib/supabase/config';
import { vincularNegocio, isLinked } from '../lib/supabase/tenantLink';

export type RolUsuario = 'super_usuario' | 'cajero' | 'tecnico';

export interface PermisosUsuario {
  dashboard: boolean;
  ventas: boolean;
  productos: boolean;
  alertas: boolean;
  configuracion: boolean;
  usuarios: boolean;
  cierreCaja?: boolean;
  reportes?: boolean;
  contabilidad?: boolean;
  gastos?: boolean;
  codecVerify?: boolean;
  devoluciones?: boolean;
  empleados?: boolean;
  multitienda?: boolean;
  fidelizacion?: boolean;
  panaderiaOnces?: boolean;
  // ── Caja (universal) ──
  verFaltanteCaja?: boolean;       // Si false, cajero no ve la diferencia en tiempo real
  modificarBaseApertura?: boolean; // Puede editar la base inicial de apertura
  // ── Panadería / Onces ──
  panaderiaVentas?: boolean;
  panaderiaCategorias?: boolean;
  panaderiaMermas?: boolean;
  // ── Taller de Reparaciones ──
  tallerCrearOrdenes?: boolean;    // Puede crear nuevas órdenes de reparación
  tallerEditarPrecios?: boolean;   // Puede modificar precios y presupuestos
  // Patrón extensible: añade aquí los permisos operacionales de cada módulo futuro
}

export interface Usuario {
  id: string;
  nombreCompleto: string;
  cedula: string;
  username: string;
  password: string;
  /** Opcional: habilita recuperación de contraseña real vía Supabase Auth para esta cuenta */
  email?: string;
  rol: RolUsuario;
  activo: boolean;
  fechaCreacion: string;
  creadoPor: string;
  permisos?: PermisosUsuario;
  hardware_id_autorizado?: string;
  esClienteSupabase?: boolean;
  clienteSupabaseId?: string;
  planCliente?: 'BASICO' | 'PREMIUM';
  modulosActivos?: string[];
  // Datos laborales/operativos del empleado
  cargo?: string;
  telefono?: string;
  salario?: number;
  fechaContratacion?: string;
}

export interface SesionActiva {
  usuarioId: string;
  nombreUsuario: string;
  rol: Usuario['rol'];
  horaInicio: string;
  ultimaActividad?: string;
  // Agregar el usuario completo para clientes demo
  usuario?: Usuario;
}

export interface RegistroSesion {
  id: string;
  usuarioId: string;
  nombreUsuario: string;
  cedula: string;
  horaInicio: string;
  horaFin?: string;
  duracion?: number; // en minutos
  ventasRealizadas?: number;
  totalVentas?: number;
}

interface AuthContextType {
  user?: Usuario | null; // Alias para compatibilidad
  usuarioActual: Usuario | null;
  sesionActiva: SesionActiva | null;
  usuarios: Usuario[];
  registrosSesiones: RegistroSesion[];
  configuracionInicial: boolean;
  configuracionClienteCompletada: boolean;
  estaAutenticado: boolean;
  esSuperUsuario: boolean;
  esDesarrollador: boolean; // Nueva propiedad
  modoAdminTemporalActivo: boolean;
  logoutKey: number; // Incrementa en cada logout para forzar re-mount del Login
  activarModoAdminTemporal: (username: string, password: string) => boolean;
  desactivarModoAdminTemporal: () => void;
  refrescarPermisosUsuario: (userId: string) => void;
  iniciarSesion: (username: string, password: string) => Promise<boolean>;
  /** Acceso de staff Codec Studio (Panel Desarrollador) vía Supabase Auth — requiere internet */
  iniciarSesionStaff: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Envía correo de restablecimiento de contraseña vía Supabase Auth (requiere que la cuenta tenga email) */
  solicitarRecuperacionPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Establece sesión con datos de usuario recibidos desde el servidor de red local */
  registrarSesionRedLocal: (usuario: Usuario) => void;
  cerrarSesion: () => void;
  crearUsuario: (usuario: Omit<Usuario, 'id' | 'fechaCreacion'>) => boolean;
  actualizarUsuario: (id: string, datos: Partial<Usuario>) => boolean;
  eliminarUsuario: (id: string) => boolean;
  cambiarPassword: (usuarioId: string, passwordAnterior: string, passwordNueva: string) => boolean;
  completarConfiguracionInicial: (usuario: Omit<Usuario, 'id' | 'fechaCreacion'>) => void;
  completarConfiguracionCliente: (usuario: Usuario, desactivarAdmin: boolean) => void;
  obtenerRegistrosSesionesPorUsuario: (usuarioId: string) => RegistroSesion[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_USUARIOS = 'codecpos_usuarios';
const STORAGE_KEY_SESIONES = 'codecpos_sesiones';
const STORAGE_KEY_SESION_ACTIVA = 'codecpos_sesion_activa';
const STORAGE_KEY_CONFIG_INICIAL = 'codecpos_config_inicial';
const STORAGE_KEY_CONFIG_CLIENTE = 'codecpos_config_cliente_completada';
const MAX_USUARIOS = 5; // Máximo 5 usuarios por terminal

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sesionActiva, setSesionActiva] = useState<SesionActiva | null>(null);
  const [registrosSesiones, setRegistrosSesiones] = useState<RegistroSesion[]>([]);
  const [configuracionInicial, setConfiguracionInicial] = useState(true);
  const [configuracionClienteCompletada, setConfiguracionClienteCompletada] = useState(false);
  // ✅ NUEVO: Estado de carga para evitar bloqueos
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [intervaloVerificacion, setIntervaloVerificacion] = useState<NodeJS.Timeout | null>(null);
  const [modoAdminTemporalActivo, setModoAdminTemporalActivo] = useState(false);
  const [cajeroSessionBackup, setCajeroSessionBackup] = useState<SesionActiva | null>(null);
  const [logoutKey, setLogoutKey] = useState(0);
  // ✅ Acceso de staff Codec Studio (Panel Desarrollador), verificado vía Supabase Auth.
  // Reemplaza la antigua contraseña maestra hardcodeada: se otorga en caliente tras
  // `iniciarSesionStaff`, nunca se persiste, y se pierde al reiniciar la app.
  const [esDesarrollador, setEsDesarrollador] = useState(false);

  // 🛡️ Caja negra: registra cada inicio/cierre de sesión real (no re-renders)
  // en el .log físico fuera de %AppData%, incluyendo el usuario de Windows
  // activo si Electron lo expone. Esto permite reconstruir, ante un reclamo
  // del cliente, quién estaba operando el sistema en un momento dado.
  const sesionAnteriorRef = useRef<SesionActiva | null>(null);
  useEffect(() => {
    const previa = sesionAnteriorRef.current;
    if (!previa && sesionActiva) {
      logger.info(`Inicio de sesión: ${sesionActiva.nombreUsuario} (${sesionActiva.rol})`, {
        usuarioId: sesionActiva.usuarioId,
        rol: sesionActiva.rol,
      });
    } else if (previa && !sesionActiva) {
      logger.info(`Cierre de sesión: ${previa.nombreUsuario}`, { usuarioId: previa.usuarioId });
    }
    sesionAnteriorRef.current = sesionActiva;
  }, [sesionActiva]);

  const construirPermisosDesdeModulos = (
    modulosHabilitados: ModuloPOS[],
    permisosPrevios?: PermisosUsuario
  ): PermisosUsuario => {
    const mods = new Set(modulosHabilitados || []);
    return {
      ...permisosPrevios,
      dashboard: mods.has(ModuloPOS.DASHBOARD),
      ventas: mods.has(ModuloPOS.PUNTO_DE_VENTA) || mods.has(ModuloPOS.VENTAS_HISTORIAL),
      productos: mods.has(ModuloPOS.PRODUCTOS),
      alertas: mods.has(ModuloPOS.ALERTAS_STOCK),
      configuracion: mods.has(ModuloPOS.CONFIGURACION),
      usuarios: mods.has(ModuloPOS.USUARIOS),
      cierreCaja: mods.has(ModuloPOS.CIERRE_CAJA),
      reportes: mods.has(ModuloPOS.REPORTES),
      contabilidad: mods.has(ModuloPOS.CONTABILIDAD),
      gastos: mods.has(ModuloPOS.GASTOS),
      codecVerify: mods.has(ModuloPOS.CODEC_VERIFY),
      devoluciones: mods.has(ModuloPOS.DEVOLUCIONES),
      empleados: mods.has(ModuloPOS.EMPLEADOS),
      multitienda: mods.has(ModuloPOS.MULTITIENDA),
      fidelizacion: mods.has(ModuloPOS.FIDELIZACION),
      panaderiaOnces: mods.has(ModuloPOS.PANADERIA_ONCES),
      // Mantener permisos monetarios/operativos previos si ya estaban definidos.
      verFaltanteCaja: permisosPrevios?.verFaltanteCaja,
      modificarBaseApertura: permisosPrevios?.modificarBaseApertura,
      panaderiaVentas: permisosPrevios?.panaderiaVentas,
      panaderiaCategorias: permisosPrevios?.panaderiaCategorias,
      panaderiaMermas: permisosPrevios?.panaderiaMermas,
      tallerCrearOrdenes: permisosPrevios?.tallerCrearOrdenes,
      tallerEditarPrecios: permisosPrevios?.tallerEditarPrecios,
    };
  };

  const refrescarPermisosUsuario = (userId: string) => {
    if (!userId) return;

    const permisosActualizados = obtenerPermisosUsuario(userId);
    const modulos = [...permisosActualizados.modulosHabilitados] as ModuloPOS[];

    setUsuarios((prev) => prev.map((u) => (
      u.id === userId
        ? {
            ...u,
            modulosActivos: [...modulos],
            permisos: construirPermisosDesdeModulos(modulos, u.permisos),
          }
        : u
    )));

    setSesionActiva((prev) => {
      if (!prev || prev.usuarioId !== userId || !prev.usuario) return prev;
      return {
        ...prev,
        ultimaActividad: new Date().toISOString(),
        usuario: {
          ...prev.usuario,
          modulosActivos: [...modulos],
          permisos: construirPermisosDesdeModulos(modulos, prev.usuario.permisos),
        },
      };
    });
  };

  // ⚡ OPTIMIZADO: Cargar datos del localStorage de forma NO BLOQUEANTE
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const usuariosCargados = await UsuariosStorage.cargarUsuarios();
        setUsuarios(usuariosCargados);

        const sesionActivaCargada = await UsuariosStorage.cargarSesionActiva();
        if (sesionActivaCargada) {
          setSesionActiva(sesionActivaCargada);
        }

        setCargandoDatos(false);

        UsuariosStorage.cargarSesiones()
          .then(sesionesCargadas => { setRegistrosSesiones(sesionesCargadas); })
          .catch(() => {});

        setTimeout(() => {
          UsuariosStorage.verificarIntegridad().catch(() => {});
        }, 1000);

      } catch (error) {
        console.error('❌ Error cargando datos:', error);
        
        // ⚠️ FALLBACK RÁPIDO: Intentar cargar desde localStorage antiguo
        try {
          const usuariosGuardados = localStorage.getItem(STORAGE_KEY_USUARIOS);
          if (usuariosGuardados) {
            const usuariosCargados = JSON.parse(usuariosGuardados);
            setUsuarios(usuariosCargados);
            UsuariosStorage.guardarUsuarios(usuariosCargados).catch(() => {});
          }
        } catch (fallbackError) {
          console.error('❌ Error en fallback:', fallbackError);
        } finally {
          // Siempre desbloquear la UI, incluso si hay errores
          setCargandoDatos(false);
        }
      }
    };

    cargarDatos();

    // ✅ CREAR USUARIO ADMINISTRADOR POR DEFECTO SI NO EXISTE
    setTimeout(() => {
      let usuariosActuales: Usuario[] = [];
      try { usuariosActuales = JSON.parse(localStorage.getItem(STORAGE_KEY_USUARIOS) || '[]'); } catch { usuariosActuales = []; }

      if (usuariosActuales.length === 0) {

        const adminDefault: Usuario = {
          id: 'admin_default_001',
          nombreCompleto: 'Administrador',
          cedula: '000000000',
          username: 'Admin',
          // Contraseña por defecto de primer arranque — CAMBIAR de inmediato desde
          // Usuarios > Cambiar contraseña. Ya no es un secreto compartido entre
          // instalaciones con privilegios especiales: es solo una semilla local.
          password: hashPassword('Noruega2025++*'),
          rol: 'super_usuario',
          activo: true,
          fechaCreacion: new Date().toISOString(),
          creadoPor: 'SISTEMA',
          permisos: {
            dashboard: true,
            ventas: true,
            productos: true,
            alertas: true,
            configuracion: true,
            usuarios: true,
            cierreCaja: true,
            reportes: true,
            contabilidad: true,
            gastos: true,
            codecVerify: true,
            devoluciones: true,
            empleados: true,
            multitienda: true,
            fidelizacion: true,
            panaderiaOnces: true,
          },
        };

        setUsuarios([adminDefault]);
        try { localStorage.setItem(STORAGE_KEY_USUARIOS, JSON.stringify([adminDefault])); } catch { /* storage lleno */ }
      }
    }, 500);

    // Configuración inicial SIEMPRE en false
    setConfiguracionInicial(false);
    try { localStorage.setItem(STORAGE_KEY_CONFIG_INICIAL, JSON.stringify(false)); } catch { /* storage lleno */ }

    const configClienteGuardada = localStorage.getItem(STORAGE_KEY_CONFIG_CLIENTE);
    if (configClienteGuardada !== null) {
      try { setConfiguracionClienteCompletada(JSON.parse(configClienteGuardada)); } catch { /* ignorar */ }
    }
  }, []);

  // ⚡ GUARDAR USUARIOS CON SISTEMA ROBUSTO
  useEffect(() => {
    if (usuarios.length > 0) {
      try { localStorage.setItem(STORAGE_KEY_USUARIOS, JSON.stringify(usuarios)); } catch { /* storage lleno */ }
      UsuariosStorage.guardarUsuarios(usuarios).catch(() => {});
    }
  }, [usuarios]);

  // ⚡ RECARGAR USUARIOS CUANDO LA RED LAN SINCRONIZA DESDE EL SERVIDOR
  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_USUARIOS);
        if (raw) {
          const lista = JSON.parse(raw) as Usuario[];
          setUsuarios(lista);
          console.log('[LAN] Usuarios sincronizados desde red local:', lista.length);

          // 🛡️ FIX: `usuarioActual` prioriza `sesionActiva.usuario` (una foto
          // fija tomada en el momento del login) sobre la lista `usuarios`.
          // Si el Admin cambia permisos de un usuario desde OTRA terminal
          // mientras esa persona ya tiene sesión abierta aquí, la lista
          // `usuarios` se actualiza pero su sesión seguía viendo la foto
          // vieja — los permisos nuevos no aparecían hasta cerrar sesión y
          // volver a entrar. Ahora, si el usuario con sesión activa en ESTE
          // terminal vino en la lista sincronizada, se refresca su sesión
          // también, en caliente.
          setSesionActiva((prev) => {
            if (!prev) return prev;
            const actualizado = lista.find(u => u.id === prev.usuarioId);
            if (!actualizado) return prev;
            return {
              ...prev,
              nombreUsuario: actualizado.nombreCompleto || prev.nombreUsuario,
              rol: actualizado.rol,
              ultimaActividad: new Date().toISOString(),
              usuario: actualizado,
            };
          });
        }
      } catch {}
    };
    window.addEventListener('codecpos:usuarios-sincronizados', handler);
    return () => window.removeEventListener('codecpos:usuarios-sincronizados', handler);
  }, []);

  // ⚡ GUARDAR SESIONES CON SISTEMA ROBUSTO
  useEffect(() => {
    if (registrosSesiones.length > 0) {
      try { localStorage.setItem(STORAGE_KEY_SESIONES, JSON.stringify(registrosSesiones)); } catch { /* storage lleno */ }
      UsuariosStorage.guardarSesiones(registrosSesiones).catch(() => {});
    }
  }, [registrosSesiones]);

  // ⚡ GUARDAR SESIÓN ACTIVA CON SISTEMA ROBUSTO
  useEffect(() => {
    if (sesionActiva) {
      try { localStorage.setItem(STORAGE_KEY_SESION_ACTIVA, JSON.stringify(sesionActiva)); } catch { /* storage lleno */ }
      UsuariosStorage.guardarSesionActiva(sesionActiva).catch(() => {});
    } else {
      try { localStorage.removeItem(STORAGE_KEY_SESION_ACTIVA); } catch { /* ignorar */ }
      UsuariosStorage.guardarSesionActiva(null).catch(() => {});
    }
  }, [sesionActiva]);

  const usuarioActual = sesionActiva 
    ? (sesionActiva.usuario || usuarios.find(u => u.id === sesionActiva.usuarioId) || null)
    : null;

  // 🔄 Refresco automático de sesión cuando cambian permisos del usuario logueado
  useEffect(() => {
    const handlePermisosActualizados = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId: string; modulosHabilitados: string[] }>;
      const userIdActual = sesionActiva?.usuarioId;

      if (!userIdActual || customEvent.detail?.userId !== userIdActual) {
        console.log(`[Auth] Evento de permisos ignorado — afecta a userId=${customEvent.detail?.userId ?? '?'}, la sesión activa aquí es userId=${userIdActual ?? 'ninguna'}`);
        return;
      }

      refrescarPermisosUsuario(userIdActual);
      console.log(`[Auth] CONFIRMADO: permisos aplicados en caliente para la sesión activa (${sesionActiva?.usuario?.username ?? userIdActual}) — UI refrescada sin necesidad de reiniciar`, {
        modulosHabilitados: obtenerPermisosUsuario(userIdActual).modulosHabilitados,
      });
    };

    window.addEventListener(EVENTO_PERMISOS_ACTUALIZADOS, handlePermisosActualizados as EventListener);
    return () => {
      window.removeEventListener(EVENTO_PERMISOS_ACTUALIZADOS, handlePermisosActualizados as EventListener);
    };
  }, [sesionActiva?.usuarioId, sesionActiva?.usuario?.username]);

  const estaAutenticado = sesionActiva !== null;

  // ✅ SUPER USUARIO: cualquier cuenta legítima con rol super_usuario debe tener acceso administrativo completo
  // ✅ DESARROLLADOR: solo cuentas de staff Codec Studio verificadas vía Supabase (ver iniciarSesionStaff)
  const esSuperUsuario = !!usuarioActual && usuarioActual.rol === 'super_usuario' && usuarioActual.activo;

  const validarAdministradorTemporal = (username: string, password: string): Usuario | null => {
    const usernameNormalizado = username.trim();

    const adminLocal = usuarios.find(
      u =>
        u.username === usernameNormalizado &&
        verificarPassword(password, u.password).valido &&
        u.activo &&
        u.rol === 'super_usuario'
    ) || null;

    return adminLocal;
  };

  const activarModoAdminTemporal = (username: string, password: string): boolean => {
    const adminValido = validarAdministradorTemporal(username, password);
    if (!adminValido || !sesionActiva) {
      return false;
    }

    if (sesionActiva.rol === 'super_usuario') {
      setModoAdminTemporalActivo(true);
      return true;
    }

    if (!cajeroSessionBackup) {
      setCajeroSessionBackup(sesionActiva);
    }

    const permisosAdminTemporales: PermisosUsuario = {
      ...(sesionActiva.usuario?.permisos || {}),
      dashboard: true,
      ventas: true,
      productos: true,
      alertas: true,
      configuracion: true,
      usuarios: true,
      cierreCaja: true,
      reportes: true,
      contabilidad: true,
      gastos: true,
      codecVerify: true,
      devoluciones: true,
      empleados: true,
      multitienda: true,
      fidelizacion: true,
      panaderiaOnces: true,
      verFaltanteCaja: true,
      modificarBaseApertura: true,
      panaderiaVentas: true,
      panaderiaCategorias: true,
      panaderiaMermas: true,
      tallerCrearOrdenes: true,
      tallerEditarPrecios: true,
    };

    setSesionActiva((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rol: 'super_usuario',
        ultimaActividad: new Date().toISOString(),
        usuario: {
          ...(prev.usuario || {
            id: prev.usuarioId,
            nombreCompleto: prev.nombreUsuario,
            cedula: '',
            username: prev.nombreUsuario,
            password: '',
            rol: 'super_usuario',
            activo: true,
            fechaCreacion: '',
            creadoPor: 'SISTEMA',
          }),
          rol: 'super_usuario',
          activo: true,
          modulosActivos: [...MODULOS_MAESTRO_OFICIALES],
          permisos: permisosAdminTemporales,
        },
      };
    });

    setModoAdminTemporalActivo(true);
    return true;
  };

  const desactivarModoAdminTemporal = () => {
    if (cajeroSessionBackup) {
      setSesionActiva(cajeroSessionBackup);
    }
    setCajeroSessionBackup(null);
    setModoAdminTemporalActivo(false);
  };

  const configurarSuperUsuario = (datos: Omit<Usuario, 'id' | 'fechaCreacion' | 'creadoPor' | 'rol'>): boolean => {
    if (!configuracionInicial) return false;

    const nuevoSuperUsuario: Usuario = {
      ...datos,
      password: hashPassword(datos.password),
      id: 'super_' + Date.now(),
      rol: 'super_usuario',
      fechaCreacion: new Date().toISOString(),
      creadoPor: 'SISTEMA',
      activo: true,
    };

    setUsuarios([nuevoSuperUsuario]);
    setConfiguracionInicial(false);
    localStorage.setItem(STORAGE_KEY_CONFIG_INICIAL, JSON.stringify(false));

    return true;
  };

  const iniciarSesion = async (username: string, password: string): Promise<boolean> => {
    const usernameNormalizado = username.trim();
    const passwordNormalizado = password;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 INICIANDO SESIÓN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Credenciales recibidas:', { username: usernameNormalizado, password: passwordNormalizado });

    // ✅ PRIORIDAD 1: Autenticación local (usuarios del sistema)
    console.log('👥 Intentando autenticación local...');
    console.log('👥 Usuarios en sistema:', usuarios.length);

    // Buscar primero solo por username (sin filtrar por `activo` todavía);
    // la contraseña se valida aparte para poder re-hashear en caliente
    // cuentas legadas que aún guardaban la contraseña en texto plano.
    const candidatoPorUsername = usuarios.find(u => u.username === usernameNormalizado);
    const verificacion = candidatoPorUsername
      ? verificarPassword(passwordNormalizado, candidatoPorUsername.password)
      : { valido: false, requiereRehash: false };
    const candidato = verificacion.valido ? candidatoPorUsername : undefined;

    // 🔐 Migración perezosa: si la cuenta aún tenía la contraseña en texto
    // plano, se re-hashea en este mismo login exitoso, sin pedirle nada al
    // usuario ni interrumpir el flujo.
    if (candidato && verificacion.requiereRehash) {
      const hasheada = hashPassword(passwordNormalizado);
      setUsuarios(prev => prev.map(u => u.id === candidato.id ? { ...u, password: hasheada } : u));
    }

    // 🛡️ Red de seguridad anti-bloqueo de licencias VITALICIAS: `activo` en
    // codecpos_usuarios normalmente ya viene bien calculado (ver
    // sincronizarClienteEnUsuarios en DeveloperPanel.tsx), pero si por
    // cualquier bug futuro quedara desactualizado, esta verificación cruzada
    // contra el registro real del cliente evita que una licencia vitalicia
    // termine mostrando "credenciales incorrectas" por un `estado` obsoleto.
    const esActivoEfectivo = (u: typeof candidato): boolean => {
      if (!u) return false;
      if (u.activo) return true;
      if (u.creadoPor !== 'PANEL_DESARROLLADOR') return false;
      try {
        const clientes: any[] = JSON.parse(localStorage.getItem('codecpos_dev_clientes') || '[]');
        const clienteId = String(u.id || '').replace(/^cli_/, '');
        const cliente = clientes.find(c => String(c.id) === clienteId);
        return !!cliente && cliente.duracion === 'VITALICIA' && cliente.estado !== 'SUSPENDIDA';
      } catch {
        return false;
      }
    };

    const usuario = candidato && esActivoEfectivo(candidato) ? candidato : undefined;

    console.log('🔍 Resultado búsqueda en usuarios locales:', usuario ? '✅ ENCONTRADO' : '❌ NO ENCONTRADO');

    if (usuario) {
      const permisosUsuario = obtenerPermisosUsuario(usuario.id);
      const usuarioConModulos = {
        ...usuario,
        modulosActivos: [...permisosUsuario.modulosHabilitados],
        permisos: construirPermisosDesdeModulos(
          [...permisosUsuario.modulosHabilitados] as ModuloPOS[],
          usuario.permisos
        ),
      };

      if (import.meta.env.DEV) {
        console.log(`[Auth] Permisos cargados para el usuario ${usuario.username}:`, permisosUsuario.modulosHabilitados);
      }

      console.log('✅ AUTENTICACIÓN LOCAL EXITOSA');
      console.log('👤 Usuario:', usuarioConModulos);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const ahora = new Date().toISOString();
      const nuevaSesion: SesionActiva = {
        usuarioId: usuarioConModulos.id,
        nombreUsuario: usuarioConModulos.nombreCompleto,
        rol: usuarioConModulos.rol,
        horaInicio: ahora,
        ultimaActividad: ahora,
        usuario: usuarioConModulos,
      };

      const nuevoRegistro: RegistroSesion = {
        id: 'sesion_' + Date.now(),
        usuarioId: usuario.id,
        nombreUsuario: usuarioConModulos.nombreCompleto,
        cedula: usuarioConModulos.cedula,
        horaInicio: ahora,
      };

      setSesionActiva(nuevaSesion);
      setRegistrosSesiones(prev => [...prev, nuevoRegistro]);

      electronStore.iniciarTurno(usuario.id, usuario.nombreCompleto)
        .then(() => console.log('✅ Turno iniciado automáticamente'))
        .catch(err => console.error('❌ Error iniciando turno:', err));

      // ☁️ Priming best-effort de sesión Supabase (no bloquea, no afecta el
      // resultado del login local): si la cuenta tiene email vinculado y hay
      // internet, deja lista una sesión en la nube para que el motor de
      // sincronización (Fase 2) la reutilice. Si falla (sin red, cuenta aún
      // no migrada a Supabase, etc.) se ignora en silencio.
      if (usuario.email) {
        signInSupabase(usuario.email, passwordNormalizado).catch(() => {});
      }

      // 🛡️ FIX: una cuenta de dueño creada en el primer login por licencia
      // (id 'lic_{clienteId}') guarda sus módulos en caché local para poder
      // entrar offline — pero en logins SIGUIENTES esta rama (Prioridad 1)
      // nunca volvía a mirar Supabase, así que si Douglas cambiaba los
      // módulos del cliente desde Panel Desarrollador, ese cambio nunca
      // llegaba a la instalación del cliente hasta reinstalar. Ahora, en
      // segundo plano (no bloquea el login), se refresca contra la nube y se
      // aplica en caliente vía el mismo mecanismo que ya usa "Gestionar
      // Permisos" — sesión activa, sidebar y config global incluidos.
      if (navigator.onLine && usuario.id.startsWith('lic_')) {
        const clienteId = usuario.id.slice(4);
        (async () => {
          try {
            const client = getSupabaseClient();
            if (!client) return;
            const { data: clienteRow } = await client
              .from('clientes_pos')
              .select('modulos_activos, estado')
              .eq('id', clienteId)
              .maybeSingle();
            if (!clienteRow || clienteRow.estado === 'SUSPENDIDA') return;
            const modulosFrescos = (clienteRow.modulos_activos as ModuloPOS[] | null) || [];
            if (modulosFrescos.length === 0) return;
            guardarModulosGlobales({
              modulosActivos: modulosFrescos,
              forceGlobalModules: obtenerModulosGlobales().forceGlobalModules,
              ultimaActualizacion: new Date().toISOString(),
            });
            await guardarPermisosUsuarioPersistente({ userId: usuario.id, modulosHabilitados: modulosFrescos });
          } catch { /* offline o error de red — se sigue usando la caché local */ }
        })();
      }

      return true;
    }

    // ✅ PRIORIDAD 2: Buscar en clientes del Panel de Desarrollador (legacy)
    console.log('🔄 Buscando en Panel de Desarrollador (localStorage)...');
    const clientesGuardados = localStorage.getItem('codecpos_dev_clientes');

    if (clientesGuardados) {
      let clientes: any[] = [];
      try { clientes = JSON.parse(clientesGuardados); } catch { clientes = []; }
      const clienteEncontrado = clientes.find((c: any) => {
        if (c.usuario !== usernameNormalizado || c.contraseña !== passwordNormalizado) return false;

        // Bloquear por suspensión explícita
        if (c.estado === 'SUSPENDIDA') return false;

        // Bloquear por expiración automática (excepto vitalicia)
        const esVitalicia = c.duracion === 'VITALICIA';
        const estaExpirada = !esVitalicia && c.fechaExpiracion
          ? new Date(c.fechaExpiracion).getTime() <= Date.now()
          : false;

        if (estaExpirada) {
          return false;
        }

        return c.estado === 'ACTIVA';
      });

      if (clienteEncontrado) {
        console.log('🎉 Cliente encontrado en Panel Desarrollador (legacy)');

        const esPremiumLegacy = clienteEncontrado.plan === 'PREMIUM';
        const configModulosCliente = obtenerModulosCliente(clienteEncontrado.id, clienteEncontrado.plan);

        const usuarioDesdeCliente: Usuario = {
          id: clienteEncontrado.id,
          nombreCompleto: clienteEncontrado.nombreNegocio,
          cedula: clienteEncontrado.nit || 'N/A',
          username: clienteEncontrado.usuario,
          password: clienteEncontrado.contraseña,
          rol: 'super_usuario' as const,
          permisos: {
            dashboard: esPremiumLegacy,
            ventas: true,
            productos: true,
            alertas: true,
            configuracion: true,
            usuarios: true,
            cierreCaja: true,
            reportes: esPremiumLegacy,
            contabilidad: true,
            gastos: esPremiumLegacy,
            codecVerify: esPremiumLegacy,
            devoluciones: esPremiumLegacy,
            empleados: esPremiumLegacy,
            multitienda: esPremiumLegacy,
            fidelizacion: esPremiumLegacy,
            panaderiaOnces: true,
          },
          activo: true,
          fechaCreacion: new Date(clienteEncontrado.createdAt).toISOString(),
          creadoPor: 'PANEL_DESARROLLADOR',
          modulosActivos: configModulosCliente.modulosActivos,
        };

        const ahora = new Date().toISOString();
        const nuevaSesion: SesionActiva = {
          usuarioId: usuarioDesdeCliente.id,
          nombreUsuario: usuarioDesdeCliente.nombreCompleto,
          rol: usuarioDesdeCliente.rol,
          horaInicio: ahora,
          ultimaActividad: ahora,
          usuario: usuarioDesdeCliente,
        };

        const nuevoRegistro: RegistroSesion = {
          id: 'sesion_' + Date.now(),
          usuarioId: usuarioDesdeCliente.id,
          nombreUsuario: usuarioDesdeCliente.nombreCompleto,
          cedula: usuarioDesdeCliente.cedula,
          horaInicio: ahora,
        };

        setSesionActiva(nuevaSesion);
        setRegistrosSesiones(prev => [...prev, nuevoRegistro]);

        electronStore.iniciarTurno(usuarioDesdeCliente.id, usuarioDesdeCliente.nombreCompleto)
          .then(() => console.log('✅ Turno iniciado automáticamente'))
          .catch(err => console.error('❌ Error iniciando turno:', err));

        console.log('✅ AUTENTICACIÓN LEGACY COMPLETADA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return true;
      }
    }

    // 🛡️ PRIORIDAD 3: primer login de una instalación nueva con credenciales
    // de licencia reales (las que el dueño recibió al comprar el plan desde
    // el Panel Desarrollador) — no hay usuario local todavía porque la
    // máquina nunca se vinculó. Se verifica online contra Supabase; si es
    // válida, esta instalación se vincula a la nube automáticamente, se crea
    // el usuario local con los módulos REALES que se le asignaron (no una
    // suposición por plan), y entra sin pasos manuales adicionales. Sin esto,
    // un cliente nuevo tendría que entrar primero con el "Admin" de fábrica y
    // vincular a mano — justo la fricción que se quiere eliminar.
    if (navigator.onLine) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data: clienteId } = await client.rpc('resolver_login_licencia', {
            p_usuario: usernameNormalizado,
            p_password: passwordNormalizado,
          });

          if (clienteId) {
            const { data: clienteRow } = await client
              .from('clientes_pos')
              .select('nombre_negocio, plan, modulos_activos, estado')
              .eq('id', clienteId)
              .maybeSingle();

            if (clienteRow && clienteRow.estado !== 'SUSPENDIDA') {
              console.log('🎉 Licencia válida en la nube — vinculando esta instalación automáticamente');

              if (!isLinked()) {
                await vincularNegocio(clienteId, usernameNormalizado, passwordNormalizado).catch((e) =>
                  console.error('[Auth] No se pudo auto-vincular la instalación:', e)
                );
              }

              const modulosReales = (clienteRow.modulos_activos as ModuloPOS[] | null)?.length
                ? (clienteRow.modulos_activos as ModuloPOS[])
                : obtenerModulosCliente(clienteId, clienteRow.plan as 'BASICO' | 'PREMIUM').modulosActivos;

              // 🛡️ FIX: `modulosReales` (lo que el dueño realmente compró, según
              // Panel Desarrollador) solo se guardaba en `usuarioDesdeLicencia`,
              // que el gate de admin/super_usuario en POSLayoutSidebar bypasea
              // por completo. La visibilidad real terminaba dependiendo de
              // `codec_pos_modulos_globales` (config local con sus propios
              // valores por defecto, sin relación con lo que el dueño compró) —
              // así que activar/desactivar módulos desde Panel Desarrollador no
              // tenía ningún efecto visible para el dueño en su propia pantalla.
              // Ahora se sincroniza la config local con la real de la nube.
              guardarModulosGlobales({
                modulosActivos: modulosReales as ModuloPOS[],
                forceGlobalModules: false,
                ultimaActualizacion: new Date().toISOString(),
              });

              const usuarioDesdeLicencia: Usuario = {
                id: 'lic_' + clienteId,
                nombreCompleto: clienteRow.nombre_negocio,
                cedula: '',
                username: usernameNormalizado,
                password: hashPassword(passwordNormalizado),
                rol: 'super_usuario',
                permisos: construirPermisosDesdeModulos(modulosReales as ModuloPOS[], undefined),
                activo: true,
                fechaCreacion: new Date().toISOString(),
                creadoPor: 'LICENCIA_NUBE',
                modulosActivos: modulosReales as ModuloPOS[],
              };

              setUsuarios((prev) => [...prev, usuarioDesdeLicencia]);

              const ahora = new Date().toISOString();
              setSesionActiva({
                usuarioId: usuarioDesdeLicencia.id,
                nombreUsuario: usuarioDesdeLicencia.nombreCompleto,
                rol: usuarioDesdeLicencia.rol,
                horaInicio: ahora,
                ultimaActividad: ahora,
                usuario: usuarioDesdeLicencia,
              });
              setRegistrosSesiones((prev) => [
                ...prev,
                { id: 'sesion_' + Date.now(), usuarioId: usuarioDesdeLicencia.id, nombreUsuario: usuarioDesdeLicencia.nombreCompleto, cedula: '', horaInicio: ahora },
              ]);

              electronStore.iniciarTurno(usuarioDesdeLicencia.id, usuarioDesdeLicencia.nombreCompleto).catch(() => {});

              console.log('✅ AUTENTICACIÓN POR LICENCIA EN LA NUBE COMPLETADA');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              return true;
            }
          }
        }
      } catch (e) {
        console.error('[Auth] Error verificando licencia en la nube:', e);
      }
    }

    console.log('❌ AUTENTICACIÓN FALLIDA - No se encontró usuario válido');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return false;
  };

  // ⚡ SINCRONIZAR empleados con el proceso Electron cuando el Admin inicia sesión
  // Esto habilita que otras terminales en red puedan autenticarse contra este servidor
  //
  // 🛡️ FIX: "le doy permisos a María pero en la terminal cajero le siguen sin
  // aparecer". Causa raíz: un cajero que inicia sesión en OTRA terminal (no la
  // del Admin) nunca pasa por PASO 1 (auth local, `iniciarSesion` — que sí
  // recalcula `modulosActivos` fresco desde `obtenerPermisosUsuario`); en su
  // lugar usa PASO 2 (auth de red, `LoginPage.tsx` → `/api/auth/network-login`
  // en lanServer.js), que devuelve el usuario TAL CUAL está en
  // `lanServer.authData` — una copia del array `usuarios` de React de ESTA
  // terminal (la del Admin), enviada más abajo. Ese array nunca recalcula
  // `modulosActivos` para nadie salvo el usuario con sesión activa AQUÍ mismo
  // (`refrescarPermisosUsuario`, más arriba, solo corre si el evento de
  // permisos es para `sesionActiva.usuarioId`) — así que la entrada de María
  // en `usuarios` se queda con `modulosActivos: undefined` para siempre,
  // aunque el Admin le haya otorgado todo desde Gestionar Permisos o Personal.
  // Por eso su terminal recibía "sin permisos explícitos" y caía al filtro de
  // configuración global. Ahora se recalculan los módulos de TODOS los
  // usuarios (no solo el de la sesión activa) justo antes de enviarlos, y se
  // reenvían también cada vez que cambian permisos de cualquiera — no solo
  // cuando cambia la lista de usuarios.
  useEffect(() => {
    if (!estaAutenticado || !esSuperUsuario) return;
    const el = (window as any).electron;
    if (!el?.lan?.setAuthData) return;

    const enviarAuthData = () => {
      if (usuarios.length === 0) return;
      const usuariosConPermisosFrescos = usuarios.map((u) => {
        const permisosU = obtenerPermisosUsuario(u.id);
        const modulos = [...permisosU.modulosHabilitados] as ModuloPOS[];
        return {
          ...u,
          modulosActivos: modulos,
          permisos: construirPermisosDesdeModulos(modulos, u.permisos),
        };
      });
      console.log(`[LAN Auth] Reenviando authData con permisos frescos para ${usuariosConPermisosFrescos.length} usuario(s)`);
      el.lan.setAuthData(usuariosConPermisosFrescos).catch(() => {});
    };

    enviarAuthData();
    window.addEventListener(EVENTO_PERMISOS_ACTUALIZADOS, enviarAuthData);
    return () => window.removeEventListener(EVENTO_PERMISOS_ACTUALIZADOS, enviarAuthData);
  }, [estaAutenticado, esSuperUsuario, usuarios]);

  /** Registra una sesión con datos provenientes del servidor de autenticación en red local */
  const registrarSesionRedLocal = (usuario: Usuario) => {
    const ahora = new Date().toISOString();
    const nuevaSesion: SesionActiva = {
      usuarioId: usuario.id,
      nombreUsuario: usuario.nombreCompleto,
      rol: usuario.rol,
      horaInicio: ahora,
      ultimaActividad: ahora,
      usuario,
    };
    setSesionActiva(nuevaSesion);
    setRegistrosSesiones(prev => [...prev, {
      id: 'sesion_net_' + Date.now(),
      usuarioId: usuario.id,
      nombreUsuario: usuario.nombreCompleto,
      cedula: usuario.cedula || '',
      horaInicio: ahora,
    }]);
  };

  const cerrarSesion = () => {
    if (!sesionActiva) return;

    // ⚡ PASO 1 (INSTANTÁNEO): Limpiar estado de sesión inmediatamente
    // Esto desautentica al usuario sin demoras, el Login estará disponible en el siguiente frame
    const sesionACerrar = sesionActiva;
    setSesionActiva(null);
    setModoAdminTemporalActivo(false);
    setCajeroSessionBackup(null);
    setLogoutKey(prev => prev + 1); // Fuerza re-mount limpio del Login

    // Limpiar storage de sesión activa de forma síncrona (rápido)
    try { localStorage.removeItem(STORAGE_KEY_SESION_ACTIVA); } catch { /* ignorar */ }

    if (intervaloVerificacion) {
      clearInterval(intervaloVerificacion);
      setIntervaloVerificacion(null);
    }

    // ⚡ PASO 2 (BACKGROUND): Persistencia y contabilidad (no bloquea la UI)
    const ahora = new Date().toISOString();
    const horaInicio = new Date(sesionACerrar.horaInicio);
    const horaFin = new Date(ahora);
    const duracion = Math.floor((horaFin.getTime() - horaInicio.getTime()) / 1000 / 60);

    // Actualizar registros de sesión en background
    setRegistrosSesiones(prev => {
      const ultimoRegistro = prev[prev.length - 1];
      if (ultimoRegistro && ultimoRegistro.usuarioId === sesionACerrar.usuarioId && !ultimoRegistro.horaFin) {
        return [
          ...prev.slice(0, -1),
          {
            ...ultimoRegistro,
            horaFin: ahora,
            duracion,
          }
        ];
      }
      return prev;
    });

    // Finalizar turno en electronStore (async, no bloquea)
    electronStore.finalizarTurno(sesionACerrar.usuarioId)
      .catch(err => console.error('❌ Error finalizando turno:', err));
  };

  // 🛡️ Acceso de staff Codec Studio (reemplaza la contraseña maestra hardcodeada).
  // Verifica ONLINE contra Supabase Auth que la cuenta tiene `es_staff_codec=true`
  // y, si es válida, abre una sesión con privilegios completos en esta terminal.
  const iniciarSesionStaff = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const resultado = await verificarAccesoStaff(email, password);
    if (!resultado.ok) {
      return resultado;
    }

    const ahora = new Date().toISOString();
    const staffUsuario: Usuario = {
      id: 'staff-codec-' + email,
      nombreCompleto: 'Staff Codec Studio',
      cedula: '',
      username: email,
      password: '',
      email,
      rol: 'super_usuario',
      activo: true,
      fechaCreacion: ahora,
      creadoPor: 'SUPABASE_STAFF',
      modulosActivos: [...MODULOS_MAESTRO_OFICIALES],
    };

    setSesionActiva({
      usuarioId: staffUsuario.id,
      nombreUsuario: staffUsuario.nombreCompleto,
      rol: staffUsuario.rol,
      horaInicio: ahora,
      ultimaActividad: ahora,
      usuario: staffUsuario,
    });
    setEsDesarrollador(true);
    return { ok: true };
  };

  const solicitarRecuperacionPassword = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    return solicitarRecuperacionPasswordSupabase(email);
  };

  const crearUsuario = (usuario: Omit<Usuario, 'id' | 'fechaCreacion'>): boolean => {
    if (!usuarioActual || usuarioActual.rol !== 'super_usuario') {
      return false;
    }

    // El límite solo aplica a cajeros/técnicos; los admins (super_usuario) no tienen cupo
    const usuariosOperativos = usuarios.filter(u => u.rol !== 'super_usuario').length;
    if (usuario.rol !== 'super_usuario' && usuariosOperativos >= MAX_USUARIOS) {
      return false;
    }

    usuario = { ...usuario, password: hashPassword(usuario.password) };

    // Verificar que no exista el username o cédula
    if (usuarios.some(u => u.username === usuario.username || u.cedula === usuario.cedula)) {
      return false;
    }

    const nuevoUsuario: Usuario = {
      ...usuario,
      id: 'user_' + Date.now(),
      fechaCreacion: new Date().toISOString(),
      creadoPor: usuarioActual.id,
    };

    setUsuarios(prev => [...prev, nuevoUsuario]);
    window.dispatchEvent(new CustomEvent('codecpos:usuario-cambio', { detail: { action: 'CREATE', data: nuevoUsuario } }));
    dispararEvento('usuario_creado' as any, { nombre: nuevoUsuario.nombreCompleto, rol: nuevoUsuario.rol, timestamp: nuevoUsuario.fechaCreacion }).catch(() => {});
    return true;
  };

  const actualizarUsuario = (id: string, datos: Partial<Usuario>): boolean => {
    if (!usuarioActual || usuarioActual.rol !== 'super_usuario') {
      return false;
    }

    const base = usuarios.find(u => u.id === id);
    const actualizado = base ? { ...base, ...datos } : datos;
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ...datos } : u));
    setSesionActiva((prev) => {
      if (!prev || prev.usuarioId !== id || !prev.usuario) return prev;
      return {
        ...prev,
        nombreUsuario: String((actualizado as Usuario)?.nombreCompleto || prev.nombreUsuario),
        rol: ((actualizado as Usuario)?.rol || prev.rol) as Usuario['rol'],
        ultimaActividad: new Date().toISOString(),
        usuario: {
          ...prev.usuario,
          ...datos,
        },
      };
    });
    window.dispatchEvent(new CustomEvent('codecpos:usuario-cambio', { detail: { action: 'UPDATE', data: actualizado } }));
    return true;
  };

  const eliminarUsuario = (id: string): boolean => {
    if (!usuarioActual || usuarioActual.rol !== 'super_usuario') {
      return false;
    }

    // No permitir eliminar al super usuario
    const usuario = usuarios.find(u => u.id === id);
    if (usuario?.rol === 'super_usuario') {
      return false;
    }

    setUsuarios(prev => prev.filter(u => u.id !== id));
    window.dispatchEvent(new CustomEvent('codecpos:usuario-cambio', { detail: { action: 'DELETE', data: { id } } }));
    return true;
  };

  const cambiarPassword = (usuarioId: string, passwordAnterior: string, passwordNueva: string): boolean => {
    const usuario = usuarios.find(u => u.id === usuarioId);

    if (!usuario || !verificarPassword(passwordAnterior, usuario.password).valido) {
      return false;
    }

    setUsuarios(prev => prev.map(u =>
      u.id === usuarioId ? { ...u, password: hashPassword(passwordNueva) } : u
    ));

    return true;
  };

  const obtenerRegistrosSesionesPorUsuario = (usuarioId: string): RegistroSesion[] => {
    return registrosSesiones.filter(r => r.usuarioId === usuarioId).reverse(); // Más recientes primero
  };

  const completarConfiguracionInicial = (usuario: Omit<Usuario, 'id' | 'fechaCreacion'>) => {
    if (!configuracionInicial) return;

    const nuevoSuperUsuario: Usuario = {
      ...usuario,
      password: hashPassword(usuario.password),
      id: 'super_' + Date.now(),
      rol: 'super_usuario',
      fechaCreacion: new Date().toISOString(),
      creadoPor: 'SISTEMA',
      activo: true,
    };

    setUsuarios([nuevoSuperUsuario]);
    setConfiguracionInicial(false);
    localStorage.setItem(STORAGE_KEY_CONFIG_INICIAL, JSON.stringify(false));
  };

  const completarConfiguracionCliente = (usuario: Usuario, desactivarAdmin: boolean) => {
    // Agregar el nuevo super usuario del cliente
    const nuevoUsuarioCliente: Usuario = {
      ...usuario,
      password: esHashBcrypt(usuario.password) ? usuario.password : hashPassword(usuario.password),
      activo: true,
    };

    // Si se debe desactivar Admin, actualizar su estado
    const usuariosActualizados = desactivarAdmin
      ? usuarios.map(u => u.username === 'Admin' ? { ...u, activo: false } : u)
      : usuarios;

    setUsuarios([...usuariosActualizados, nuevoUsuarioCliente]);
    setConfiguracionClienteCompletada(true);
    localStorage.setItem(STORAGE_KEY_CONFIG_CLIENTE, JSON.stringify(true));
  };

  return (
    <AuthContext.Provider
      value={{
        user: usuarioActual, // Alias para compatibilidad
        usuarioActual,
        sesionActiva,
        usuarios,
        registrosSesiones,
        configuracionInicial,
        configuracionClienteCompletada,
        estaAutenticado,
        esSuperUsuario,
        esDesarrollador, // Nueva propiedad
        modoAdminTemporalActivo,
        logoutKey,
        activarModoAdminTemporal,
        desactivarModoAdminTemporal,
        refrescarPermisosUsuario,
        iniciarSesion,
        iniciarSesionStaff,
        solicitarRecuperacionPassword,
        registrarSesionRedLocal,
        cerrarSesion,
        crearUsuario,
        actualizarUsuario,
        eliminarUsuario,
        cambiarPassword,
        obtenerRegistrosSesionesPorUsuario,
        completarConfiguracionInicial,
        completarConfiguracionCliente,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
