export interface EmployeeActivityLog {
  id: string;
  sesionCajaId: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string; // YYYY-MM-DD (local)
  aperturaISO: string;
  cierreISO?: string;
  baseInicial: number;
  totalVentas?: number;
  totalTransacciones?: number;
  resumenOperaciones?: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    rappi?: number;
  };
}

const LS_ACTIVITY = 'pos-personal-activity-logs';
const LS_PURGE_NOTICE_DAY = 'pos-personal-activity-purge-notice-day';

const getFechaLocalISO = (date: Date = new Date()): string => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
};

const diffDays = (from: string, to: string): number => {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
};

class EmployeeActivityLogService {
  private load(): EmployeeActivityLog[] {
    try {
      const data = JSON.parse(localStorage.getItem(LS_ACTIVITY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private save(logs: EmployeeActivityLog[]) {
    try {
      localStorage.setItem(LS_ACTIVITY, JSON.stringify(logs));
    } catch {
      // no-op
    }
  }

  runRetentionMaintenance(todayISO: string = getFechaLocalISO()): {
    removed: number;
    day34Pending: number;
  } {
    const logs = this.load();
    const kept: EmployeeActivityLog[] = [];
    let removed = 0;
    let day34Pending = 0;

    for (const log of logs) {
      const age = diffDays(log.fecha, todayISO);
      if (age >= 35) {
        removed += 1;
        continue;
      }
      if (age === 34) day34Pending += 1;
      kept.push(log);
    }

    if (removed > 0 || kept.length !== logs.length) {
      this.save(kept);
    }

    return { removed, day34Pending };
  }

  shouldNotifyPurgeWarning(todayISO: string = getFechaLocalISO()): boolean {
    const marker = localStorage.getItem(LS_PURGE_NOTICE_DAY);
    if (marker === todayISO) return false;
    const status = this.runRetentionMaintenance(todayISO);
    if (status.day34Pending > 0) {
      try {
        localStorage.setItem(LS_PURGE_NOTICE_DAY, todayISO);
      } catch {
        // no-op
      }
      return true;
    }
    return false;
  }

  registerApertura(params: {
    sesionCajaId: string;
    usuarioId: string;
    usuarioNombre: string;
    aperturaISO: string;
    baseInicial: number;
  }): void {
    const logs = this.load();
    const fecha = getFechaLocalISO(new Date(params.aperturaISO));
    const idx = logs.findIndex((l) => l.sesionCajaId === params.sesionCajaId);

    const baseRecord: EmployeeActivityLog = {
      id: idx >= 0 ? logs[idx].id : `ACT-${params.sesionCajaId}`,
      sesionCajaId: params.sesionCajaId,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha,
      aperturaISO: params.aperturaISO,
      baseInicial: Number(params.baseInicial) || 0,
      cierreISO: idx >= 0 ? logs[idx].cierreISO : undefined,
      totalVentas: idx >= 0 ? logs[idx].totalVentas : undefined,
      totalTransacciones: idx >= 0 ? logs[idx].totalTransacciones : undefined,
      resumenOperaciones: idx >= 0 ? logs[idx].resumenOperaciones : undefined,
    };

    if (idx >= 0) logs[idx] = baseRecord;
    else logs.push(baseRecord);

    this.save(logs);
    this.runRetentionMaintenance();
  }

  registerCierre(params: {
    sesionCajaId: string;
    cierreISO: string;
    totalVentas: number;
    totalTransacciones: number;
    resumenOperaciones: {
      efectivo: number;
      tarjeta: number;
      nequi: number;
      daviplata: number;
      transferencia: number;
      rappi?: number;
    };
  }): void {
    const logs = this.load();
    const idx = logs.findIndex((l) => l.sesionCajaId === params.sesionCajaId);
    if (idx < 0) return;

    logs[idx] = {
      ...logs[idx],
      cierreISO: params.cierreISO,
      totalVentas: Number(params.totalVentas) || 0,
      totalTransacciones: Number(params.totalTransacciones) || 0,
      resumenOperaciones: {
        efectivo: Number(params.resumenOperaciones.efectivo) || 0,
        tarjeta: Number(params.resumenOperaciones.tarjeta) || 0,
        nequi: Number(params.resumenOperaciones.nequi) || 0,
        daviplata: Number(params.resumenOperaciones.daviplata) || 0,
        transferencia: Number(params.resumenOperaciones.transferencia) || 0,
        rappi: Number(params.resumenOperaciones.rappi) || 0,
      },
    };

    this.save(logs);
    this.runRetentionMaintenance();
  }

  getEmployeeLogs(params: {
    usuarioId: string;
    fechaDesde?: string;
    fechaHasta?: string;
    todayISO?: string;
  }): EmployeeActivityLog[] {
    const todayISO = params.todayISO || getFechaLocalISO();
    this.runRetentionMaintenance(todayISO);

    const minVisibleDate = getFechaLocalISO(new Date(Date.now() - 30 * 86400000));

    return this.load()
      .filter((l) => l.usuarioId === params.usuarioId)
      .filter((l) => l.fecha >= minVisibleDate)
      .filter((l) => (params.fechaDesde ? l.fecha >= params.fechaDesde : true))
      .filter((l) => (params.fechaHasta ? l.fecha <= params.fechaHasta : true))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}

export const employeeActivityLogService = new EmployeeActivityLogService();
export const employeeActivityRetentionPolicy = {
  visibleDays: 30,
  purgeDays: 35,
};
