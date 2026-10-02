/**
 * Convierte lo que el usuario arrastra (XML sueltos y/o ZIP con XML dentro)
 * en una lista plana de documentos ya parseados, con su hash para
 * deduplicar. Sin base de datos y sin UI: quien llama decide qué guardar.
 */
import { parseDianXml } from './parser';
import { leerZipSeguro, sha256Hex, ZipError } from './zip';
import type { ResultadoParseo } from './types';

export interface ArchivoLeido {
  nombre: string;
  xml: string;
  hash: string;
  resultado: ResultadoParseo;
}

export interface ResultadoLectura {
  documentos: ArchivoLeido[];
  /** Archivos que no se pudieron abrir (ZIP dañado, extensión no soportada). */
  errores: Array<{ nombre: string; mensaje: string }>;
  /** Entradas de ZIP ignoradas por no ser XML (PDF, carpetas...). */
  ignorados: number;
}

const esZip = (nombre: string) => /\.zip$/i.test(nombre);
const esXml = (nombre: string) => /\.xml$/i.test(nombre);

export async function leerArchivosDian(
  archivos: File[],
  alAvanzar?: (procesados: number, total: number) => void,
): Promise<ResultadoLectura> {
  const crudos: Array<{ nombre: string; xml: string }> = [];
  const errores: ResultadoLectura['errores'] = [];
  let ignorados = 0;

  for (const archivo of archivos) {
    try {
      if (esZip(archivo.name)) {
        const zip = leerZipSeguro(await archivo.arrayBuffer());
        ignorados += zip.ignorados;
        for (const e of zip.entradas) crudos.push({ nombre: e.nombre, xml: e.contenido });
      } else if (esXml(archivo.name)) {
        crudos.push({ nombre: archivo.name, xml: await archivo.text() });
      } else {
        errores.push({ nombre: archivo.name, mensaje: 'Solo se aceptan archivos .xml o .zip' });
      }
    } catch (e) {
      errores.push({
        nombre: archivo.name,
        mensaje: e instanceof ZipError ? e.message : `No se pudo leer el archivo: ${(e as Error).message}`,
      });
    }
  }

  const documentos: ArchivoLeido[] = [];
  const hashesVistos = new Set<string>();

  for (let i = 0; i < crudos.length; i++) {
    const { nombre, xml } = crudos[i];
    const hash = await sha256Hex(xml);
    // El mismo XML suele venir dos veces en una misma carga (suelto y dentro
    // del ZIP): se queda con el primero.
    if (!hashesVistos.has(hash)) {
      hashesVistos.add(hash);
      documentos.push({ nombre, xml, hash, resultado: parseDianXml(xml) });
    }
    alAvanzar?.(i + 1, crudos.length);
    // Cede el hilo cada tanto: un lote de miles de XML no debe congelar la
    // pantalla mientras se parsea.
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0));
  }

  return { documentos, errores, ignorados };
}
