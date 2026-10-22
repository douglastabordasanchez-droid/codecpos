/**
 * Lee una base de clientes desde una hoja de cálculo: la plantilla de Codec
 * POS o lo que exporta otro programa (Siigo «Búsqueda de terceros», Alegra,
 * World Office...). No exige el orden de las columnas ni que el encabezado
 * esté en la primera fila: busca la fila que tenga nombre e identificación.
 *
 * Limpia los datos de relleno que ponen esos programas cuando el campo está
 * vacío (generico@generico.com, 031-0000000) para que no lleguen a la
 * factura de nadie.
 */
import type { ClienteFacturacion } from '../supabase/clientesFacturacionService';

type Celda = string | number | boolean | null | undefined;

const clave = (s: Celda) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** Columnas aceptadas, por el comienzo del encabezado sin tildes ni espacios. */
const COLUMNAS: Record<string, string[]> = {
  nombre: ['nombretercero', 'nombreorazonsocial', 'razonsocial', 'nombrecliente', 'nombrecompleto', 'cliente', 'nombre'],
  tipo: ['tipodeidentificacion', 'tipoidentificacion', 'tipodedocumento', 'tipodocumento', 'tipodoc', 'tipo'],
  numero: ['numerodedocumento', 'numerodocumento', 'identificacion', 'documento', 'numero', 'nit', 'cedula'],
  dv: ['digitoverificacion', 'digitodeverificacion', 'dv', 'digito'],
  email: ['correoelectronico', 'correo', 'email', 'mail'],
  telefono: ['telefono', 'celular', 'movil', 'tel'],
  direccion: ['direccion'],
  ciudad: ['ciudad', 'municipio'],
  retefuente: ['agenteretencionfuente', 'agentederetencionenlafuente', 'retefuente', 'retencionfuente', 'retencionenlafuente'],
  reteica: ['agentereteica', 'agentederetencionica', 'reteica', 'retencionica'],
};

/** Índice de la columna para cada campo, o -1. Lo más específico gana. */
function mapearEncabezado(fila: Celda[]): Record<string, number> {
  const claves = fila.map(clave);
  const usadas = new Set<number>();
  const mapa: Record<string, number> = {};
  for (const [campo, nombres] of Object.entries(COLUMNAS)) {
    mapa[campo] = -1;
    for (const n of nombres) {
      const i = claves.findIndex((k, idx) => !usadas.has(idx) && k.startsWith(n)
        // «Tipo de régimen IVA» no es el tipo de documento.
        && !(campo === 'tipo' && k.includes('regimen')));
      if (i >= 0) { mapa[campo] = i; usadas.add(i); break; }
    }
  }
  return mapa;
}

const esSi = (v: Celda) => /^(s[ií]|x|1|true|verdadero)$/i.test(String(v ?? '').trim());

/** "NIT", "31", "Cédula de ciudadanía" → código DIAN. */
export function tipoDocumentoDesdeTexto(v: Celda): string {
  const t = clave(v);
  if (!t) return '13';
  if (['13', '31', '22', '41', '12'].includes(String(v).trim())) return String(v).trim();
  if (t.includes('nit')) return '31';
  if (t.includes('extranj')) return '22';
  if (t.includes('pasaporte')) return '41';
  if (t.includes('tarjeta')) return '12';
  return '13';
}

/** Correos de relleno que exportan otros programas cuando el campo está vacío. */
function correoReal(v: Celda): string | undefined {
  const c = String(v ?? '').trim().toLowerCase();
  if (!c || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return undefined;
  if (/^(generico|sincorreo|nocorreo|noaplica|na|ninguno|correo|cliente)@/.test(c) || c.endsWith('@generico.com')) return undefined;
  return c;
}

/** Solo dígitos; descarta los de relleno (031-0000000, 310000000, 0000000). */
function telefonoReal(v: Celda): string | undefined {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length < 7) return undefined;
  const sinIndicativo = d.replace(/^(57|0?31|60\d)/, '');
  if (/^0+$/.test(sinIndicativo) || /^310?0{6,}$/.test(d) || /^(\d)\1+$/.test(d)) return undefined;
  // Siigo junta indicativo y número ("601-3228408615-"): se deja el celular o el fijo de 10 dígitos.
  return d.length > 10 ? d.slice(-10) : d;
}

const texto = (v: Celda) => String(v ?? '').replace(/\s+/g, ' ').trim() || undefined;

export interface ResultadoLectura {
  clientes: ClienteFacturacion[];
  /** Filas con datos que no se pudieron leer (sin nombre o sin documento). */
  descartadas: number;
}

/** Filas de una hoja (sheet_to_json con header: 1) → clientes. */
export function leerClientesDeFilas(filas: Celda[][]): ResultadoLectura {
  const inicio = filas.findIndex((f) => {
    const m = mapearEncabezado(f || []);
    return m.nombre >= 0 && m.numero >= 0;
  });
  if (inicio < 0) return { clientes: [], descartadas: 0 };
  const col = mapearEncabezado(filas[inicio]);
  const v = (f: Celda[], campo: string) => (col[campo] >= 0 ? f[col[campo]] : undefined);

  const clientes: ClienteFacturacion[] = [];
  let descartadas = 0;
  for (const f of filas.slice(inicio + 1)) {
    if (!f || f.every((c) => String(c ?? '').trim() === '')) continue;
    const crudo = String(v(f, 'numero') ?? '').trim();
    const nombre = texto(v(f, 'nombre'));
    const [numero, dvEnNumero] = crudo.split('-');
    if (!numero?.replace(/\D/g, '') && !nombre) continue; // fila sin datos del cliente
    if (!numero?.replace(/\D/g, '') || !nombre) { descartadas++; continue; }
    const dv = String(v(f, 'dv') ?? '').replace(/\D/g, '').slice(0, 1) || dvEnNumero?.replace(/\D/g, '').slice(0, 1);
    const tipo = col.tipo >= 0 ? tipoDocumentoDesdeTexto(v(f, 'tipo')) : (dv ? '31' : '13');
    clientes.push({
      tipoDocumento: tipo,
      numeroDocumento: numero.replace(/[^0-9A-Za-z]/g, ''),
      digitoVerificacion: tipo === '31' ? dv || undefined : undefined,
      nombre,
      email: correoReal(v(f, 'email')),
      telefono: telefonoReal(v(f, 'telefono')),
      direccion: texto(v(f, 'direccion')),
      ciudad: texto(v(f, 'ciudad')),
      agenteRetencionFuente: esSi(v(f, 'retefuente')),
      agenteRetencionIca: esSi(v(f, 'reteica')),
    });
  }
  return { clientes, descartadas };
}

/** Un libro con varias hojas: se usa la que más clientes tenga. */
export function leerClientesDeLibro(hojas: Celda[][][]): ResultadoLectura {
  return hojas
    .map(leerClientesDeFilas)
    .reduce((mejor, r) => (r.clientes.length > mejor.clientes.length ? r : mejor), { clientes: [], descartadas: 0 });
}
