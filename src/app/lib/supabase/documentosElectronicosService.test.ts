import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { SupabaseFalso } from './supabaseFalso';

let falso: SupabaseFalso;
vi.mock('./config', () => ({ getSupabaseClient: () => falso }));

import { leerArchivosDian } from '../dian/recepcion/archivos';
import { causarDocumentoElectronico, guardarDocumentosLeidos } from './documentosElectronicosService';

const fixture = (nombre: string) => readFileSync(join(__dirname, '..', 'dian', 'recepcion', 'fixtures', nombre), 'utf8');
const archivo = (nombre: string, contenido: string | Uint8Array) => new File([contenido as BlobPart], nombre);

const CONTEXTO = { clienteId: 'cliente-1', empleadoId: 'empleado-1', nitPropio: '' };

beforeEach(() => {
  falso = new SupabaseFalso({ documentos_electronicos: [] });
  falso.unicos.documentos_electronicos = [['cliente_id', 'hash_sha256'], ['cliente_id', 'cufe']];
});

describe('leerArchivosDian', () => {
  it('lee XML sueltos y los de un ZIP, sin repetir el que viene dos veces', async () => {
    const simple = fixture('sint-0001-pos-simple.xml');
    const zip = zipSync({
      'lote/sint-0001-pos-simple.xml': strToU8(simple),
      'lote/sint-0004-nota-debito.xml': strToU8(fixture('sint-0004-nota-debito.xml')),
      'lote/representacion.pdf': strToU8('%PDF'),
    });

    const r = await leerArchivosDian([
      archivo('sint-0001-pos-simple.xml', simple),
      archivo('lote.zip', zip),
      archivo('foto.png', 'x'),
    ]);

    expect(r.documentos.map((d) => d.resultado.documento?.tipo)).toEqual(['documento_equivalente', 'nota_debito']);
    expect(r.ignorados).toBe(1);
    expect(r.errores).toEqual([{ nombre: 'foto.png', mensaje: 'Solo se aceptan archivos .xml o .zip' }]);
  });

  it('un ZIP dañado no tumba el resto de la carga', async () => {
    const r = await leerArchivosDian([
      archivo('roto.zip', 'esto no es un zip'),
      archivo('ok.xml', fixture('sint-0001-pos-simple.xml')),
    ]);
    expect(r.documentos).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].nombre).toBe('roto.zip');
  });
});

describe('guardarDocumentosLeidos', () => {
  it('guarda cada documento con sus totales, líneas y estado', async () => {
    const { documentos } = await leerArchivosDian([
      archivo('a.xml', fixture('sint-0001-pos-simple.xml')),
      archivo('b.xml', fixture('sint-0005-pos-consumidor-final.xml')),
      archivo('c.xml', '<esto no cierra'),
    ]);
    const resumen = await guardarDocumentosLeidos(documentos, CONTEXTO);

    expect(resumen).toMatchObject({ nuevos: 3, duplicados: 0, invalidos: 1, enRevision: 1, fallidos: [] });

    const filas = falso.tablas.documentos_electronicos;
    const simple = filas.find((f) => f.nombre_archivo === 'a.xml')!;
    const original = documentos[0].resultado.documento!;
    expect(simple).toMatchObject({
      cliente_id: 'cliente-1',
      subido_por: 'empleado-1',
      tipo: 'documento_equivalente',
      estado: 'procesado',
      cufe: original.cufe,
      numero_completo: original.numeroCompleto,
      emisor_nit: original.emisor.nit,
      subtotal: original.totales.brutoLineas,
      total_iva: original.resumen.iva,
      total: original.totales.total,
    });
    expect(simple.fecha_emision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(simple.lineas).toHaveLength(original.lineas.length);
    expect(simple.xml).toBe(documentos[0].xml);

    expect(filas.find((f) => f.nombre_archivo === 'b.xml')!.estado).toBe('revision');

    // El ilegible también se guarda, para que el usuario vea qué archivo falló.
    const roto = filas.find((f) => f.nombre_archivo === 'c.xml')!;
    expect(roto.estado).toBe('invalido');
    expect(roto.tipo).toBeUndefined();
  });

  it('marca como emitido el documento cuyo emisor es el propio negocio', async () => {
    const { documentos } = await leerArchivosDian([archivo('a.xml', fixture('sint-0001-pos-simple.xml'))]);
    const nit = documentos[0].resultado.documento!.emisor.nit;

    await guardarDocumentosLeidos(documentos, { ...CONTEXTO, nitPropio: nit });
    expect(falso.tablas.documentos_electronicos[0].direccion).toBe('emitido');
  });

  it('no vuelve a guardar lo que ya estaba: mismo archivo o mismo CUFE', async () => {
    const simple = fixture('sint-0001-pos-simple.xml');
    const primera = await leerArchivosDian([archivo('a.xml', simple)]);
    await guardarDocumentosLeidos(primera.documentos, CONTEXTO);

    // Mismo archivo otra vez, y el mismo documento con un espacio de más
    // (otro hash, mismo CUFE), junto a uno realmente nuevo.
    const segunda = await leerArchivosDian([
      archivo('a-copia.xml', simple),
      archivo('a-reformateado.xml', simple + '\n'),
      archivo('nuevo.xml', fixture('sint-0003-pos-restaurante-inc.xml')),
    ]);
    const resumen = await guardarDocumentosLeidos(segunda.documentos, CONTEXTO);

    expect(resumen).toMatchObject({ nuevos: 1, duplicados: 2 });
    expect(falso.tablas.documentos_electronicos).toHaveLength(2);
  });

  it('si otra pestaña subió uno del lote a la vez, guarda el resto y lo cuenta como duplicado', async () => {
    const { documentos } = await leerArchivosDian([
      archivo('a.xml', fixture('sint-0001-pos-simple.xml')),
      archivo('b.xml', fixture('sint-0003-pos-restaurante-inc.xml')),
    ]);
    // La carrera: la fila aparece DESPUÉS de la consulta de duplicados y antes del insert.
    const insertOriginal = falso.from.bind(falso);
    let colado = false;
    falso.from = ((tabla: string) => {
      const consulta = insertOriginal(tabla);
      const insertar = consulta.insert.bind(consulta);
      consulta.insert = (filas: any) => {
        if (!colado) {
          colado = true;
          falso.tablas.documentos_electronicos.push({ cliente_id: 'cliente-1', hash_sha256: documentos[0].hash, cufe: 'otro' });
        }
        return insertar(filas);
      };
      return consulta;
    }) as typeof falso.from;

    const resumen = await guardarDocumentosLeidos(documentos, CONTEXTO);
    expect(resumen).toMatchObject({ nuevos: 1, duplicados: 1, fallidos: [] });
  });
});

describe('causarDocumentoElectronico', () => {
  it('manda a la RPC los parámetros con los nombres que espera la migración 0099', async () => {
    await causarDocumentoElectronico({
      documentoId: 'doc-1', categoria: 'inventario', medioPago: 'efectivo', aCredito: false,
      fecha: '2026-09-28T17:00:00.000Z', empleadoId: null, empleadoNombre: 'Admin local',
      lineasInventario: [{ productoId: 'prod-1', cantidad: 24, costoUnitario: 2000 }],
    });

    expect(falso.rpcs).toEqual([{
      nombre: 'causar_documento_electronico',
      args: {
        p_documento_id: 'doc-1', p_categoria: 'inventario', p_medio_pago: 'efectivo', p_a_credito: false,
        p_fecha: '2026-09-28T17:00:00.000Z', p_empleado_id: null, p_empleado_nombre: 'Admin local',
        p_lineas_inventario: [{ producto_id: 'prod-1', cantidad: 24, costo_unitario: 2000 }],
      },
    }]);
  });
});
