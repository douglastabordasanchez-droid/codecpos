/**
 * Lectura segura de los ZIP que entrega el portal de la DIAN (o que arma el
 * propio negocio con los XML de sus facturas).
 *
 * Portado de Codec Document (src/lib/dian/zip.ts), con las MISMAS defensas,
 * pero sobre `fflate` en vez de `pizzip`: fflate ya viaja en el bundle (lo
 * trae jspdf) y permite descomprimir por trozos, que es lo que hace posible
 * abortar a mitad de una bomba ZIP en vez de descubrirla cuando la memoria
 * ya se agotó.
 *
 * ── Defensas ────────────────────────────────────────────────────────────
 *  · Tope de entradas          — un ZIP con un millón de archivos vacíos
 *  · Tope de tamaño acumulado  — se aborta a mitad, no al final
 *  · Tope por archivo          — un XML de 500 MB dentro de un ZIP de 1 MB
 *  · Ratio de compresión       — la firma clásica de una bomba ZIP
 *  · Se ignora la ruta interna — un nombre "../../etc/passwd" no puede
 *    escapar porque nunca se usa como ruta: sólo se conserva el nombre base.
 */

import { Unzip, UnzipInflate } from 'fflate';

export interface LimitesZip {
  maxEntradas: number;
  maxBytesTotales: number;
  maxBytesPorArchivo: number;
  maxRatioCompresion: number;
}

export const LIMITES_ZIP: LimitesZip = {
  // Una importación real ronda los 5.000 documentos; 20.000 deja margen sin
  // permitir un archivo absurdo.
  maxEntradas: 20_000,
  // 5.000 XML de ~50 KB son ~250 MB. 600 MB deja el doble de margen.
  maxBytesTotales: 600 * 1024 * 1024,
  maxBytesPorArchivo: 12 * 1024 * 1024,
  // Un XML comprime ~10:1. Por encima de 200:1 no es un documento, es una
  // bomba.
  maxRatioCompresion: 200,
};

export class ZipError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DEMASIADAS_ENTRADAS'
      | 'DEMASIADO_GRANDE'
      | 'ARCHIVO_DEMASIADO_GRANDE'
      | 'POSIBLE_BOMBA'
      | 'ZIP_ILEGIBLE'
      | 'SIN_XML',
  ) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface EntradaZip {
  /** Nombre base, sin ninguna parte de la ruta interna del ZIP. */
  nombre: string;
  contenido: string;
  bytes: number;
}

export interface ResultadoZip {
  entradas: EntradaZip[];
  /** Archivos ignorados por no ser XML (PDF de representación gráfica,
   *  carpetas, ficheros de sistema). No es un error: el ZIP de la DIAN los
   *  trae y el usuario no tiene por qué saberlo. */
  ignorados: number;
  bytesTotales: number;
}

const esXml = (nombre: string): boolean => /\.xml$/i.test(nombre);

/** Sólo el nombre base: la ruta interna del ZIP es el vector clásico de
 *  path traversal, y además suele llevar el NIT dentro. */
const nombreBase = (ruta: string): string => ruta.split(/[/\\]/).pop() ?? ruta;

/** Descarta lo que ningún ZIP legítimo necesita: metadatos de macOS,
 *  miniaturas de Windows, archivos ocultos. */
function esRuido(ruta: string): boolean {
  const base = nombreBase(ruta);
  return (
    ruta.startsWith('__MACOSX/') ||
    base === '.DS_Store' ||
    base === 'Thumbs.db' ||
    base.startsWith('._')
  );
}

/** Tamaño del trozo con el que se alimenta el descompresor. Entre trozo y
 *  trozo se revisan los topes, así que una bomba se corta como mucho un
 *  trozo después de cruzar el límite. */
const TROZO = 64 * 1024;

export function leerZipSeguro(
  datos: ArrayBuffer | Uint8Array,
  limites: LimitesZip = LIMITES_ZIP,
): ResultadoZip {
  const bytesZip = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const bytesComprimidos = bytesZip.length;

  const entradas: EntradaZip[] = [];
  let bytesTotales = 0;
  let ignorados = 0;
  let vistas = 0;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  unzip.onfile = (archivo) => {
    if (++vistas > limites.maxEntradas) {
      throw new ZipError(
        `El comprimido tiene más de ${limites.maxEntradas} archivos`,
        'DEMASIADAS_ENTRADAS',
      );
    }

    const ruta = archivo.name;
    if (ruta.endsWith('/') || esRuido(ruta) || !esXml(ruta)) { ignorados++; return; }

    const trozos: Uint8Array[] = [];
    let bytes = 0;

    archivo.ondata = (err, trozo, final) => {
      if (err) throw new ZipError(`No se pudo descomprimir ${nombreBase(ruta)}: ${err.message}`, 'ZIP_ILEGIBLE');

      bytes += trozo.length;
      bytesTotales += trozo.length;

      if (bytes > limites.maxBytesPorArchivo) {
        throw new ZipError(
          `El archivo ${nombreBase(ruta)} supera el máximo por archivo de ${limites.maxBytesPorArchivo} bytes descomprimido`,
          'ARCHIVO_DEMASIADO_GRANDE',
        );
      }
      if (bytesTotales > limites.maxBytesTotales) {
        throw new ZipError(
          `El contenido descomprimido supera ${limites.maxBytesTotales} bytes`,
          'DEMASIADO_GRANDE',
        );
      }
      // El ratio se comprueba sobre el acumulado y no archivo por archivo:
      // un XML pequeño y muy repetitivo puede comprimir 300:1 de forma
      // legítima, pero el conjunto no.
      if (bytesComprimidos > 0 && bytesTotales / bytesComprimidos > limites.maxRatioCompresion) {
        throw new ZipError(
          'La proporción de compresión es anómala; el archivo podría estar manipulado',
          'POSIBLE_BOMBA',
        );
      }

      trozos.push(trozo);
      if (!final) return;

      const completo = new Uint8Array(bytes);
      let pos = 0;
      for (const t of trozos) { completo.set(t, pos); pos += t.length; }
      entradas.push({
        nombre: nombreBase(ruta),
        contenido: new TextDecoder('utf-8').decode(completo),
        bytes,
      });
    };

    archivo.start();
  };

  try {
    for (let i = 0; i < bytesZip.length; i += TROZO) {
      const fin = Math.min(i + TROZO, bytesZip.length);
      unzip.push(bytesZip.subarray(i, fin), fin === bytesZip.length);
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError(
      `No se pudo abrir el archivo comprimido: ${(e as Error).message}`,
      'ZIP_ILEGIBLE',
    );
  }

  if (entradas.length === 0) {
    throw new ZipError('El comprimido no contiene ningún archivo XML', 'SIN_XML');
  }

  return { entradas, ignorados, bytesTotales };
}

/** SHA-256 en hexadecimal. Es el primer nivel de deduplicación: mismo
 *  archivo byte a byte. */
export async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
