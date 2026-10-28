import { describe, it, expect } from 'vitest';
import {
  areaDeItem, agruparPorArea, lineasReciboArea, lineasConsolidado, perrosAtendidos, htmlRecibos, seVendeSinStock, type ItemVendido,
} from './ventasPorArea';

describe('areaDeItem', () => {
  it('respeta el área guardada en la venta', () => {
    expect(areaDeItem({ nombre: 'Cualquier cosa', area: 'consultas', categoria: 'Juguetes' })).toBe('consultas');
  });

  it('granel por tipo, por báscula o por categoría', () => {
    expect(areaDeItem({ nombre: 'Chunky', tipoProducto: 'granel' })).toBe('granel');
    expect(areaDeItem({ nombre: 'Chunky', pesable: true, categoria: 'Gatos premium' })).toBe('granel');
    expect(areaDeItem({ nombre: 'Dog Chow', categoria: 'Concentrado Perros' })).toBe('granel');
  });

  it('servicios de Veterinaria (Electron y web)', () => {
    expect(areaDeItem({ nombre: 'Corte de Pelo — Toby', categoria: 'Peluquería' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'Baño Básico — Luna', categoria: 'Estética' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'Consulta General', categoria: 'Servicios Médicos' })).toBe('consultas');
    expect(areaDeItem({ nombre: 'Sutura', categoria: 'Consultas y procedimientos', tipoProducto: 'servicio' })).toBe('consultas');
  });

  it('servicios viejos sin categoría: por el nombre', () => {
    expect(areaDeItem({ nombre: 'Corte de Uñas: Max' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'Desparasitación Externa: Kira' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'Vacunación antirrábica' })).toBe('consultas');
    expect(areaDeItem({ nombre: 'Cirugía Rocky' })).toBe('consultas');
  });

  it('un servicio nunca cae en accesorios por la palabra "mascotas"', () => {
    expect(areaDeItem({ nombre: 'Guardería día', categoria: 'Servicios Mascotas', tipoProducto: 'servicio' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'Algo raro', categoria: 'Servicios Mascotas', tipoProducto: 'servicio' })).toBe('otros');
  });

  it('medicamentos y accesorios', () => {
    expect(areaDeItem({ nombre: 'Amoxicilina', categoria: 'Medicamentos' })).toBe('medicamentos');
    expect(areaDeItem({ nombre: 'Gotas', requiereReceta: true, categoria: 'General' })).toBe('medicamentos');
    expect(areaDeItem({ nombre: 'Collar', categoria: 'Accesorios Mascotas' })).toBe('accesorios');
    expect(areaDeItem({ nombre: 'Pelota', categoria: 'Juguetes' })).toBe('accesorios');
  });

  it('lo de otros negocios queda en otros', () => {
    expect(areaDeItem({ nombre: 'Pan francés', categoria: 'Panadería' })).toBe('otros');
  });

  it('categorías reales de una tienda de mascotas (Mega Can)', () => {
    expect(areaDeItem({ nombre: 'BAÑO # 10', categoria: 'PELUQUERIA' })).toBe('peluqueria');
    expect(areaDeItem({ nombre: 'ESTERILIZACION 0 - 10 KL', categoria: 'VETERINARIA' })).toBe('consultas');
    expect(areaDeItem({ nombre: 'Flativet 120ml', categoria: 'MEDICAMENTOS' })).toBe('medicamentos');
    expect(areaDeItem({ nombre: 'Algo', categoria: 'Medicamentos Veterinarios' })).toBe('medicamentos');
    expect(areaDeItem({ nombre: 'CHURU BITES X 8', categoria: 'COMIDA' })).toBe('alimentos');
    expect(areaDeItem({ nombre: 'Dog Chow granel', categoria: 'COMIDA GRANEL' })).toBe('granel');
    expect(areaDeItem({ nombre: 'DALcAT CASTRADO GRANEL', categoria: 'ACCESORIOS', tipoProducto: 'granel' })).toBe('granel');
    for (const cat of ['ACCESORIOS', 'JUGUETES', 'LAZOS', 'ROPA', 'ASEO', 'ARENAS', 'PECES']) {
      expect(areaDeItem({ nombre: 'x', categoria: cat })).toBe('accesorios');
    }
  });

  it('se cobra sin stock: servicios, peluquería y procedimientos; no lo demás', () => {
    expect(seVendeSinStock({ nombre: 'BAÑO # 10', categoria: 'PELUQUERIA' })).toBe(true);
    expect(seVendeSinStock({ nombre: 'NEBULIZACION', categoria: 'VETERINARIA' })).toBe(true);
    expect(seVendeSinStock({ nombre: 'Guardería', categoria: 'Lo que sea', tipoProducto: 'servicio' })).toBe(true);
    expect(seVendeSinStock({ nombre: 'Flativet', categoria: 'MEDICAMENTOS' })).toBe(false);
    expect(seVendeSinStock({ nombre: 'Collar', categoria: 'ACCESORIOS' })).toBe(false);
  });
});

describe('agruparPorArea y recibos', () => {
  const items: ItemVendido[] = [
    { nombre: 'Chunky adulto', cantidad: 1.5, total: 13500, area: 'granel' },
    { nombre: 'Chunky adulto', cantidad: 0.5, total: 4500, area: 'granel' },
    { nombre: 'Corte de Pelo: Toby', cantidad: 1, total: 35000, area: 'peluqueria' },
    { nombre: 'Baño Básico: Luna', cantidad: 1, total: 25000, area: 'peluqueria' },
    { nombre: 'Consulta General', cantidad: 1, total: 45000, area: 'consultas' },
    { nombre: 'Collar', cantidad: 2, total: 30000, area: 'accesorios' },
  ];

  it('suma cada área y el total del día, en orden fijo', () => {
    const { areas, total } = agruparPorArea(items);
    expect(areas.map((a) => [a.area, a.total])).toEqual([
      ['granel', 18000], ['peluqueria', 60000], ['consultas', 45000], ['accesorios', 30000],
    ]);
    expect(total).toBe(153000);
    expect(perrosAtendidos(areas[1])).toBe(2);
  });

  it('recibo de peluquería: cada perro, cuántos y el total', () => {
    const pelu = agruparPorArea(items).areas.find((a) => a.area === 'peluqueria')!;
    const l = lineasReciboArea(pelu, { cajero: 'Ana', desde: '2026-10-27T13:00:00.000Z' });
    expect(l.find((x) => x.texto === 'VENTAS PELUQUERIA')).toBeTruthy();
    expect(l.filter((x) => /Toby|Luna/.test(x.texto))).toHaveLength(2);
    expect(l.find((x) => x.texto === 'Perros atendidos')?.valor).toBe('2');
    expect(l.at(-1)).toMatchObject({ texto: 'TOTAL PELUQUERIA', valor: '$60.000' });
  });

  it('recibo de granel junta el mismo producto y muestra los kilos', () => {
    const granel = agruparPorArea(items).areas[0];
    const l = lineasReciboArea(granel, {});
    expect(l.filter((x) => x.texto.includes('Chunky'))).toEqual([{ texto: '2 Chunky adulto', valor: '$18.000' }]);
  });

  it('consolidado con cada área y el total', () => {
    const { areas, total } = agruparPorArea(items);
    const l = lineasConsolidado(areas, total, {});
    expect(l.find((x) => x.texto === 'Peluquería (baños y cortes)')?.valor).toBe('$60.000');
    expect(l.at(-1)).toMatchObject({ texto: 'TOTAL VENTAS DEL DIA', valor: '$153.000' });
    const html = htmlRecibos([l], 58);
    expect(html).toContain('size: 58mm auto');
    expect(html).toContain('TOTAL VENTAS DEL DIA');
  });
});
