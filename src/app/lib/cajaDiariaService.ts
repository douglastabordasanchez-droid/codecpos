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

  getSesionActiva(usuarioId?: string, fecha: string = getHoy()): SesionCajaDiaria | null {
    if (!usuarioId) return null;
    const sesiones = this.getAll();
    return sesiones.find(s => s.usuarioId === usuarioId && s.fecha === fecha && s.estado === 'abierta') || null;
  }

  abrirSesion(params: { usuarioId: string; usuarioNombre: string; baseInicial: number; fecha?: string }): SesionCajaDiaria {
    const fecha = params.fecha || getHoy();
    const sesiones = this.getAll();

    const existenteAbierta = sesiones.find(s => s.usuarioId === params.usuarioId && s.fecha === fecha && s.estado === 'abierta');
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

  // Cierra todas las sesiones abiertas del usuario en el día actual (net de seguridad)
  cerrarSesionesDelUsuarioHoy(usuarioId: string): void {
    const fecha = getHoy();
    const sesiones = this.getAll();
    let changed = false;
    for (const s of sesiones) {
      if (s.usuarioId === usuarioId && s.fecha === fecha && s.estado === 'abierta') {
        s.estado = 'cerrada';
        s.cierreISO = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.saveAll(sesiones);
  }

  getSesionesRango(fechaInicio: string, fechaFin: string, usuarioId?: string): SesionCajaDiaria[] {
    return this.getAll().filter(s => {
      const enRango = s.fecha >= fechaInicio && s.fecha <= fechaFin;
      const coincideUsuario = usuarioId ? s.usuarioId === usuarioId : true;
      return enRango && coincideUsuario;
    });
  }

  getSesionesAbiertas(fecha: string = getHoy()): SesionCajaDiaria[] {
    return this.getAll().filter(s => s.fecha === fecha && s.estado === 'abierta');
  }
}

export const cajaDiariaService = new CajaDiariaService();
