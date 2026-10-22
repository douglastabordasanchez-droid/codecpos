import { describe, expect, it } from 'vitest';
import { adquirenteDesdeCobro, clienteParaGuardar, CLIENTE_COBRO_VACIO, conClienteConocido, dvDe, nitConDvPegado } from './clienteCobro';

describe('clienteCobro', () => {
  it('detecta el NIT escrito con el DV pegado (caso DBM1507)', () => {
    expect(nitConDvPegado({ tipo: '31', documento: '8300515738' })).toBe('830051573');
    expect(nitConDvPegado({ tipo: '13', documento: '8300515738' })).toBe('830051573');
    expect(nitConDvPegado({ tipo: '31', documento: '830051573' })).toBeNull();
    expect(nitConDvPegado({ tipo: '31', documento: '8300515731' })).toBeNull();
    expect(nitConDvPegado({ tipo: '13', documento: '1022925002' })).toBeNull();
  });

  it('NIT: calcula el DV y va como tipo 31', () => {
    const datos = { ...CLIENTE_COBRO_VACIO, tipo: '31', documento: '830.051.573', nombre: 'Medios y Servicios Integrados MIS Ltda' };
    expect(dvDe(datos)).toBe('8');
    expect(adquirenteDesdeCobro(datos)).toMatchObject({ tipoDocumento: '31', numeroDocumento: '830051573', digitoVerificacion: '8' });
    expect(clienteParaGuardar(datos)).toMatchObject({ documento: '830051573-8', tipoDocumento: '31' });
  });

  it('sin documento es consumidor final', () => {
    expect(adquirenteDesdeCobro(CLIENTE_COBRO_VACIO)).toMatchObject({ numeroDocumento: '222222222222', nombreORazonSocial: 'Consumidor final' });
  });

  it('un cliente conocido llena lo vacío y pasa a NIT si lo es', () => {
    const r = conClienteConocido({ ...CLIENTE_COBRO_VACIO, documento: '816004455' }, { documento: '816004455-1', nombre: 'Studio 4 Sas', email: 'a@b.co', tipoDocumento: '31' }, false);
    expect(r).toMatchObject({ tipo: '31', documento: '816004455', nombre: 'Studio 4 Sas', email: 'a@b.co' });
  });
});
