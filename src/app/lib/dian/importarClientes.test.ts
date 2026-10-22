import { describe, expect, it } from 'vitest';
import { leerClientesDeFilas, leerClientesDeLibro } from './importarClientes';

// Así exporta Siigo la «Búsqueda de terceros»: títulos arriba y el encabezado en la fila 7.
const siigo = [
  [''],
  ['Búsqueda de terceros'],
  ['LUIS CARLOS BOHORQUEZ VACA'],
  ['1049796031-3'],
  [''],
  [''],
  ['Nombre tercero', 'Tipo de identificación', 'Identificación', 'Digito verificación', 'Sucursal', 'Tipo de regimen IVA', 'Dirección', 'Ciudad', 'Teléfono.', 'Nombres contacto', 'Nombre Comercial', 'Es Juridica o Persona', 'Correo electrónico', 'Correo electrónico del contacto'],
  ['55 B Nail Sas', 'NIT', 901278460, 7, '', 'Responsable de IVA', 'cra 12 27  04', 'Bogotá', '601-3228408615-', 'Contacto', '', 'Juridica', 'contabilidad@tumagicnails.com', 'otro@x.com'],
  ['A.I.C.', 'NIT', 817001773, 3, '', 'No responsable de IVA', 'Cra. 36c #5B2-32', 'Cali', '031-0000000-', '', '', 'Juridica', 'generico@generico.com', ''],
  ['Pedro Pérez', 'Cédula de ciudadanía', 1022925002, '', '', '', '', 'Bogotá', 310000000, '', '', 'Persona', '', ''],
  ['', 'NIT', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Sin documento', 'NIT', '', '', '', '', '', '', '', '', '', '', '', ''],
];

describe('leerClientesDeFilas', () => {
  it('lee la exportación de terceros de Siigo y limpia los datos de relleno', () => {
    const { clientes, descartadas } = leerClientesDeFilas(siigo);
    expect(descartadas).toBe(1);
    expect(clientes).toHaveLength(3);
    expect(clientes[0]).toMatchObject({
      tipoDocumento: '31', numeroDocumento: '901278460', digitoVerificacion: '7', nombre: '55 B Nail Sas',
      email: 'contabilidad@tumagicnails.com', telefono: '3228408615', direccion: 'cra 12 27 04', ciudad: 'Bogotá',
    });
    expect(clientes[1].email).toBeUndefined();
    expect(clientes[1].telefono).toBeUndefined();
    expect(clientes[2]).toMatchObject({ tipoDocumento: '13', numeroDocumento: '1022925002', telefono: undefined, digitoVerificacion: undefined });
  });

  it('lee la plantilla de Codec POS con las retenciones', () => {
    const { clientes } = leerClientesDeFilas([
      ['Tipo documento', 'Número documento', 'DV', 'Nombre o razón social', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'Agente retención fuente', 'Agente ReteICA'],
      ['NIT', '860018862', '1', 'Empresa S.A.S.', 'compras@empresa.com', '6012325448', 'Cr 16', 'Bogotá', 'Sí', 'No'],
    ]);
    expect(clientes[0]).toMatchObject({ tipoDocumento: '31', digitoVerificacion: '1', agenteRetencionFuente: true, agenteRetencionIca: false });
  });

  it('un libro con varias hojas usa la que más clientes tiene', () => {
    const r = leerClientesDeLibro([[['Hoja vacía']], siigo]);
    expect(r.clientes).toHaveLength(3);
  });
});
