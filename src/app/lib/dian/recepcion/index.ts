/**
 * Motor de recepción de documentos electrónicos DIAN (XML UBL 2.1).
 *
 * Portado de Codec Document (sección «Documentos electrónicos / DIAN»):
 * xml.ts y types.ts son copia fiel de allá; parser.ts también, salvo dos
 * tolerancias añadidas para leer el XML que emite este mismo POS (buscar
 * «no está en Codec Document» y «TaxSubtotal» en parser.ts). TypeScript
 * puro, sin dependencias de entorno: corre igual en Electron y en la web.
 */
export * from './types';
export { parseDianXml, marcarDireccion, VERSION_MOTOR } from './parser';
export { leerZipSeguro, sha256Hex, ZipError, LIMITES_ZIP } from './zip';
export { XmlError } from './xml';
export { leerArchivosDian, type ArchivoLeido, type ResultadoLectura } from './archivos';
