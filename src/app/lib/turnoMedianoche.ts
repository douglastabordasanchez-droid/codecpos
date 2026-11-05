/**
 * Turnos que pasan de medianoche.
 *
 * Un turno que abre el 24 a las 3:47 p.m. y cierra el 25 a las 12:35 a.m.
 * pertenece al 24, pero los reportes por día ponen esos 35 minutos en el 25.
 * Estas funciones arman el aviso que se muestra en la tirilla, en el
 * historial de cierres (Electron) y en la Caja de la web y el celular, para
 * que el dueño sepa por qué el cierre no coincide con el reporte del día.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface TramoDiaSiguiente {
  /** true si el cierre cae en un día calendario distinto al de la apertura. */
  cruza: boolean;
  /** Minutos trabajados después de la medianoche del día de apertura. */
  minutos: number;
  /** «24 oct»: día al que pertenece el turno. */
  diaTurno: string;
  /** «25 oct»: día siguiente del que tomó tiempo. */
  diaSiguiente: string;
  /** «35 min» o «1 h 10 min». */
  duracion: string;
  /** «12:35 a. m.»: hora del cierre. */
  horaCierre: string;
}

function aFecha(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function diaCorto(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function formatoDuracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

function horaAmPm(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export function tramoDiaSiguiente(apertura: unknown, cierre: unknown): TramoDiaSiguiente {
  const a = aFecha(apertura);
  const c = aFecha(cierre);
  const vacio: TramoDiaSiguiente = { cruza: false, minutos: 0, diaTurno: '', diaSiguiente: '', duracion: '', horaCierre: '' };
  if (!a || !c || c.getTime() <= a.getTime()) return vacio;
  if (a.toDateString() === c.toDateString()) return { ...vacio, diaTurno: diaCorto(a) };

  const medianoche = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1, 0, 0, 0, 0);
  const minutos = (c.getTime() - medianoche.getTime()) / 60000;
  return {
    cruza: true,
    minutos,
    diaTurno: diaCorto(a),
    diaSiguiente: diaCorto(medianoche),
    duracion: formatoDuracion(minutos),
    horaCierre: horaAmPm(c),
  };
}

/**
 * «Turno del 24 oct: tomó 35 min del 25 oct (cerró a las 12:35 a. m.)».
 * Cadena vacía si el turno no pasó de medianoche.
 */
export function avisoTurnoMedianoche(apertura: unknown, cierre: unknown): string {
  const t = tramoDiaSiguiente(apertura, cierre);
  if (!t.cruza) return '';
  return `Turno del ${t.diaTurno}: tomó ${t.duracion} del ${t.diaSiguiente} (cerró a las ${t.horaCierre})`;
}
