import { describe, it, expect } from 'vitest';
import { agruparPorArea, type ItemVendido } from './ventasPorArea';
import { htmlDocumento, nombreArchivo, pdfDocumento, pdfTirilla, recibosDe } from './recibosPdf';

const items: ItemVendido[] = [
  { nombre: 'BAÑO # 10', cantidad: 1, total: 44000, area: 'peluqueria' },
  { nombre: 'Corte de Pelo: Toby', cantidad: 1, total: 35000, area: 'peluqueria' },
  { nombre: 'GATSY CARNE X 17K (AGRANEL)', cantidad: 0.5, total: 5000, area: 'granel' },
  { nombre: 'Consulta General: Max', cantidad: 1, total: 45000, area: 'consultas' },
];
const { areas, total } = agruparPorArea(items);
const d = { negocio: 'MEGA CAN', cajero: 'Ana', desde: '2026-10-28T00:46:00.000Z', hasta: '2026-10-28T01:05:00.000Z' };

const paginasPdf = async (b: Blob) => {
  const txt = new TextDecoder('latin1').decode(new Uint8Array(await b.arrayBuffer()));
  return { txt, paginas: (txt.match(/\/Type \/Page\b/g) || []).length, mediaBox: [...txt.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number)) };
};

describe('recibosDe', () => {
  it('cierre completo = cada área + consolidado; consolidado y área solos', () => {
    expect(recibosDe('completo', areas, total, d)).toHaveLength(areas.length + 1);
    expect(recibosDe('consolidado', areas, total, d)).toHaveLength(1);
    expect(recibosDe('peluqueria', areas, total, d)[0].some((l) => l.texto === 'Perros atendidos')).toBe(true);
  });
});

describe('PDF', () => {
  it('tirilla de 58 mm: una página por recibo y del ancho del papel', async () => {
    const { paginas, mediaBox } = await paginasPdf(await pdfTirilla(recibosDe('completo', areas, total, d), 58));
    expect(paginas).toBe(areas.length + 1);
    // 58 mm = 164,4 puntos
    for (const [, , w] of mediaBox) expect(Math.round(w)).toBe(164);
  });

  it('tirilla de 80 mm', async () => {
    const { mediaBox } = await paginasPdf(await pdfTirilla(recibosDe('consolidado', areas, total, d), 80));
    expect(Math.round(mediaBox[0][2])).toBe(227);
  });

  it('documento tamaño carta con el consolidado y el detalle', async () => {
    const { txt, mediaBox } = await paginasPdf(await pdfDocumento('completo', areas, total, d));
    expect(mediaBox[0].slice(2).map(Math.round)).toEqual([612, 792]);
    expect(txt).toContain('MEGA CAN');
    expect(txt).toContain('TOTAL VENTAS DEL D');
    expect(txt).toContain('2 perros atendidos');
  });

  it('documento HTML y nombre de archivo', () => {
    const html = htmlDocumento('peluqueria', areas, total, d);
    expect(html).toContain('size: letter');
    expect(html).toContain('Corte de Pelo: Toby');
    expect(html).not.toContain('TOTAL VENTAS DEL DÍA');
    expect(nombreArchivo('consolidado', 'tirilla')).toMatch(/^consolidado_\d{4}-\d{2}-\d{2}_tirilla\.pdf$/);
  });
});
