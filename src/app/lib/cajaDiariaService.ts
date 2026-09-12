export interface SesionCajaDiaria {
  id: string;
  fecha: string; // YYYY-MM-DD
  usuarioId: string;
  usuarioNombre: string;
  baseInicial: number;
  aperturaISO: string;
  estado: 'abierta' | 'cerrada';
  cierreISO?: string;
}

const LS_SESIONES = 'pos-caja-sesiones-diarias';

const getHoy = () => {
  const ahora = new Date();
  const tzOffsetMs = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - tzOffsetMs).toISOString().split('T')[0];
};

class CajaDiariaService {
  // 🚀 FIX rendimiento (mismo patrón que electronStore.ts leerProductosLS):
  // getSesionActiva() se llama 2+ veces por venta y volvía a JSON.parse-ar
  // TODO el historial de sesiones de caja desde cero cada vez. Caché
  // autoinvalidante: si el string crudo en localStorage no cambió desde la
  // última lectura, reutiliza el array ya parseado — cualquier escritura
  // (propia o de otra pestaña) invalida automáticamente al no coincidir.
  private cacheRaw: string | null = null;
  private cacheData: SesionCajaDiaria[] = [];

  private getAll(): SesionCajaDiaria[] {
    const raw = localStorage.getItem(LS_SESIONES) || '[]';
    if (raw === this.cacheRaw) return this.cacheData;
    try {
      const data = JSON.parse(raw);
      this.cacheData = Array.isArray(data) ? data : [];
    } catch {
      this.cacheData = [];
    }
    this.cacheRaw = raw;
    return this.cacheData;
  }

  private saveAll(sesiones: SesionCajaDiaria[]) {
    try {
      const raw = JSON.stringify(sesiones);
      localStorage.setItem(LS_SESIONES, raw);
      this.cacheRaw = raw;
      this.cacheData = sesiones;
    } catch {
      // Si localStorage está lleno, intenta limpiar sesiones cerradas antiguas y reintentar
      try {
        const recientes = sesiones.filter(s => {
          if (s.estado === 'abierta') return true;
          const fecha = new Date(s.cierreISO || s.aperturaISO);
          const diasAtras = (Date.now() - fecha.getTime()) / 86400000;
          return diasAtras < 30;
        });
        const raw = JSON.stringify(recientes);
        localStorage.setItem(LS_SESIONES, raw);
        this.cacheRaw = raw;
        this.cacheData = recientes;
      } catch { /* no se puede persistir — continuar en memoria */ }
    }
  }

  // 🛡️ FIX BUG CRÍTICO: "no me deja hacer el cierre" en turnos que cruzan
  // medianoche (ej. abren a las 8pm y cierran a la 1am del día siguiente).
  // Antes esto exigía que `s.fecha` (el día en que se ABRIÓ la sesión) fuera
  // IGUAL al día calendario de HOY — así que pasada la medianoche, la sesión
  // seguía "abierta" en los datos pero dejaba de encontrarse, y la pantalla
  // de Cierre de Caja creía que no había turno activo (mostraba "Abrir caja"
  // en vez de "Cerrar caja"). Una sesión solo puede estar abierta o cerrada;
  // el día calendario en que se abrió es metadata para reportes, no parte de
  // su identidad. El parámetro `fecha` se conserva por compatibilidad de
  // firma con quienes ya lo pasan, pero ya no se usa para filtrar.
  getSesionActiva(usuarioId?: string, _fecha?: string): SesionCajaDiaria | null {
    if (!usuarioId) return null;
    const sesiones = this.getAll();
    return sesiones.find(s => s.usuarioId === usuarioId && s.estado === 'abierta') || null;
  }

  abrirSesion(params: { usuarioId: string; usuarioNombre: string; baseInicial: number; fecha?: string }): SesionCajaDiaria {
    const fecha = params.fecha || getHoy();
    const sesiones = this.getAll();

    // Mismo criterio que getSesionActiva: si el usuario YA tiene una sesión
    // abierta (aunque sea de un día calendario anterior, por un turno que
    // cruzó medianoche), se reutiliza esa en vez de crear una segunda sesión
    // abierta en paralelo — eso partiría sus ventas/gastos entre dos cajas
    // "activas" al mismo tiempo.
    const existenteAbierta = sesiones.find(s => s.usuarioId === params.usuarioId && s.estado === 'abierta');
    if (existenteAbierta) return existenteAbierta;

    const sesion: SesionCajaDiaria = {
      id: `CAJA-${params.usuarioId}-${fecha}-${Date.now()}`,
      fecha,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      baseInicial: params.baseInicial,
      aperturaISO: new Date().toISOString(),
      estado: 'abierta',
    };

    sesiones.push(sesion);
    this.saveAll(sesiones);
    return sesion;
  }

  cerrarSesion(idSesion: string): SesionCajaDiaria | null {
    const sesiones = this.getAll();
    const idx = sesiones.findIndex(s => s.id === idSesion);
    if (idx < 0) return null;

    sesiones[idx] = {
      ...sesiones[idx],
      estado: 'cerrada',
      cierreISO: new Date().toISOString(),
    };
    this.saveAll(sesiones);
    return sesiones[idx];
  }

  // Cierra todas las sesiones abiertas del usuario (net de seguridad). No se
  // limita al día calendario actual por la misma razón que getSesionActiva:
  // un turno nocturno sigue "abierto" cruzando medianoche.
  cerrarSesionesDelUsuarioHoy(usuarioId: string): void {
    const sesiones = this.getAll();
    let changed = false;
    for (const s of sesiones) {
      if (s.usuarioId === usuarioId && s.estado === 'abierta') {
        s.estado = 'cerrada';
        s.cierreISO = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.saveAll(sesiones);
  }

  // Histórico por rango de fechas (reportes) — aquí sí importa el día
  // calendario en que se abrió cada sesión, a diferencia de "¿hay una sesión
  // abierta ahora?".
  getSesionesRango(fechaInicio: string, fechaFin: string, usuarioId?: string): SesionCajaDiaria[] {
    return this.getAll().filter(s => {
      const enRango = s.fecha >= fechaInicio && s.fecha <= fechaFin;
      const coincideUsuario = usuarioId ? s.usuarioId === usuarioId : true;
      return enRango && coincideUsuario;
    });
  }

  // Todas las sesiones actualmente abiertas, sin importar qué día calendario
  // quedó registrado en `fecha` al abrirlas (turnos nocturnos incluidos).
  getSesionesAbiertas(_fecha?: string): SesionCajaDiaria[] {
    return this.getAll().filter(s => s.estado === 'abierta');
  }
}

export const cajaDiariaService = new CajaDiariaService();
