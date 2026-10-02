/**
 * Cliente Supabase de mentira, SOLO para pruebas (*.test.ts): tablas en
 * memoria y el subconjunto del constructor de consultas que usan los
 * servicios probados. Respeta lo que más importa imitar de PostgREST: el
 * tope de 1000 filas por petición y el error 23505 de índice único.
 */
type Fila = Record<string, any>;

const TOPE_POSTGREST = 1000;

const comparar = (a: any, b: any): number => {
  const fa = typeof a === 'string' ? Date.parse(a) : NaN;
  const fb = typeof b === 'string' ? Date.parse(b) : NaN;
  if (!Number.isNaN(fa) && !Number.isNaN(fb)) return fa - fb;
  return a < b ? -1 : a > b ? 1 : 0;
};

class Consulta implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private orden: Array<{ col: string; asc: boolean }> = [];
  private rango: [number, number] | null = null;
  private tope: number | null = null;
  private unico = false;
  private contar = false;
  private soloCabecera = false;
  private accion: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private carga: any = null;

  constructor(private readonly db: SupabaseFalso, private readonly tabla: string) {}

  select(_cols?: string, opciones?: { count?: string; head?: boolean }) {
    if (opciones?.count) this.contar = true;
    if (opciones?.head) this.soloCabecera = true;
    return this;
  }
  insert(filas: Fila | Fila[]) { this.accion = 'insert'; this.carga = Array.isArray(filas) ? filas : [filas]; return this; }
  update(cambios: Fila) { this.accion = 'update'; this.carga = cambios; return this; }
  delete() { this.accion = 'delete'; return this; }

  eq(col: string, v: any) { this.filtros.push((f) => f[col] === v); return this; }
  in(col: string, vs: any[]) { this.filtros.push((f) => vs.includes(f[col])); return this; }
  gte(col: string, v: any) { this.filtros.push((f) => f[col] != null && comparar(f[col], v) >= 0); return this; }
  lte(col: string, v: any) { this.filtros.push((f) => f[col] != null && comparar(f[col], v) <= 0); return this; }
  lt(col: string, v: any) { this.filtros.push((f) => f[col] != null && comparar(f[col], v) < 0); return this; }
  is(col: string, v: null) { this.filtros.push((f) => (f[col] ?? null) === v); return this; }
  not(col: string, _op: 'is', v: null) { this.filtros.push((f) => (f[col] ?? null) !== v); return this; }
  order(col: string, opciones?: { ascending?: boolean }) { this.orden.push({ col, asc: opciones?.ascending !== false }); return this; }
  range(a: number, b: number) { this.rango = [a, b]; return this; }
  limit(n: number) { this.tope = n; return this; }
  maybeSingle() { this.unico = true; return this; }
  single() { this.unico = true; return this; }

  private ejecutar(): { data: any; error: any; count?: number } {
    this.db.peticiones.push({ tabla: this.tabla, accion: this.accion });
    const filas = (this.db.tablas[this.tabla] ||= []);
    const coincide = (f: Fila) => this.filtros.every((p) => p(f));

    if (this.accion === 'insert') {
      // Como en Postgres: si una sola fila del lote choca, no entra ninguna.
      const unicos = this.db.unicos[this.tabla] || [];
      const aceptadas: Fila[] = [];
      for (const nueva of this.carga as Fila[]) {
        const choca = unicos.some((cols) =>
          cols.every((c) => nueva[c] != null && nueva[c] !== '')
          && [...filas, ...aceptadas].some((f) => cols.every((c) => f[c] === nueva[c])));
        if (choca) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        aceptadas.push({ id: `id-${filas.length + aceptadas.length + 1}`, ...nueva });
      }
      filas.push(...aceptadas);
      return { data: null, error: null };
    }
    if (this.accion === 'update') {
      const tocadas = filas.filter(coincide);
      tocadas.forEach((f) => Object.assign(f, this.carga));
      return { data: tocadas.map((f) => ({ id: f.id })), error: null };
    }
    if (this.accion === 'delete') {
      this.db.tablas[this.tabla] = filas.filter((f) => !coincide(f));
      return { data: null, error: null };
    }

    let resultado = filas.filter(coincide);
    const total = resultado.length;
    for (const { col, asc } of [...this.orden].reverse()) {
      resultado = [...resultado].sort((a, b) => comparar(a[col], b[col]) * (asc ? 1 : -1));
    }
    if (this.rango) resultado = resultado.slice(this.rango[0], this.rango[1] + 1);
    resultado = resultado.slice(0, Math.min(this.tope ?? TOPE_POSTGREST, TOPE_POSTGREST));

    if (this.soloCabecera) return { data: null, error: null, count: total };
    if (this.unico) return { data: resultado[0] ?? null, error: null };
    return { data: resultado, error: null, count: this.contar ? total : undefined };
  }

  then<R1 = any, R2 = never>(
    alCumplir?: ((v: { data: any; error: any; count?: number }) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((razon: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.ejecutar()).then(alCumplir, alFallar);
  }
}

export class SupabaseFalso {
  peticiones: Array<{ tabla: string; accion: string }> = [];
  rpcs: Array<{ nombre: string; args: any }> = [];
  /** Índices únicos por tabla: lista de grupos de columnas. */
  unicos: Record<string, string[][]> = {};

  constructor(public tablas: Record<string, Fila[]> = {}) {}

  from(tabla: string) { return new Consulta(this, tabla); }

  rpc(nombre: string, args: any) {
    this.rpcs.push({ nombre, args });
    return Promise.resolve({ data: null, error: null });
  }
}
