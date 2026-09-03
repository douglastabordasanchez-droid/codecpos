// Genera un CSV de 100 productos ficticios para el módulo Veterinaria/Mascotas,
// en el mismo formato que espera ImportMasivaCSV.tsx (plantilla "veterinaria"):
// delimitador ';', BOM UTF-8, columnas:
// Código;Nombre;Stock;Costo;Precio;Categoría;MinStock;FechaVencimiento;
// TipoProducto;EsBulto;PesoBultoKg;PrecioPorKilo;RendimientoRaciones;Lote;Especie;RequiereReceta
//
// Uso: node scripts/generate_mascotas_products_csv.mjs
// Salida: seed-data/mascotas-100-productos-demo.csv

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'seed-data');

// PRNG determinista (mismo resultado cada vez que se corre el script).
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}
function roundTo(n, step) {
  return Math.round(n / step) * step;
}
function futureDate() {
  const year = randInt(2026, 2027);
  const month = String(randInt(1, 12)).padStart(2, '0');
  const day = String(randInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function lote() {
  return `L${randInt(1000, 9999)}`;
}

const MARGEN = {
  'Alimentos para Perros': 0.68,
  'Alimentos para Gatos': 0.68,
  'Medicamentos Veterinarios': 0.60,
  'Accesorios para Mascotas': 0.55,
  'Juguetes': 0.50,
  'Higiene y Cuidado': 0.55,
  'Suplementos': 0.58,
  'Snacks y Premios': 0.55,
  'Camas y Transportadoras': 0.52,
  'Collares y Correas': 0.50,
  'Otros Animales': 0.60,
  'Antipulgas y Garrapatas': 0.58,
  'Areneros': 0.55,
  'Peceras y Acuarios': 0.55,
};

const STOCK_RANGE = {
  'Alimentos para Perros': [10, 30],
  'Alimentos para Gatos': [10, 30],
  'Medicamentos Veterinarios': [10, 40],
  'Accesorios para Mascotas': [10, 35],
  'Juguetes': [15, 45],
  'Higiene y Cuidado': [12, 30],
  'Suplementos': [10, 25],
  'Snacks y Premios': [20, 50],
  'Camas y Transportadoras': [8, 20],
  'Collares y Correas': [15, 35],
  'Otros Animales': [10, 25],
  'Antipulgas y Garrapatas': [10, 25],
  'Areneros': [8, 20],
  'Peceras y Acuarios': [8, 18],
};

const CON_VENCIMIENTO = new Set(['Alimentos para Perros', 'Alimentos para Gatos', 'Medicamentos Veterinarios']);
const CON_LOTE = new Set(['Medicamentos Veterinarios']);

// [prefijo, nombre, categoría, especie, tipo('fisico'|'granel'|'servicio'), precio o {pesoBultoKg, precioPorKilo, rendimiento}, requiereReceta?]
const ITEMS = [
  // Alimentos para Perros (11)
  ['ALP', 'Concentrado Dog Chow Adulto (bulto)', 'Alimentos para Perros', 'Perro', 'granel', { pesoBultoKg: 25, precioPorKilo: 6800, rendimiento: 90 }],
  ['ALP', 'Concentrado Pedigree Cachorro (bulto)', 'Alimentos para Perros', 'Perro', 'granel', { pesoBultoKg: 21, precioPorKilo: 7200, rendimiento: 75 }],
  ['ALP', 'Concentrado Purina Pro Plan Raza Pequeña (bulto)', 'Alimentos para Perros', 'Perro', 'granel', { pesoBultoKg: 15, precioPorKilo: 9800, rendimiento: 55 }],
  ['ALP', 'Concentrado Ringo Adulto (bulto)', 'Alimentos para Perros', 'Perro', 'granel', { pesoBultoKg: 22, precioPorKilo: 5200, rendimiento: 85 }],
  ['ALP', 'Concentrado Nutrican Cachorro (bulto)', 'Alimentos para Perros', 'Perro', 'granel', { pesoBultoKg: 20, precioPorKilo: 5800, rendimiento: 78 }],
  ['ALP', 'Dog Chow Adulto Bolsa x8kg', 'Alimentos para Perros', 'Perro', 'fisico', 68000],
  ['ALP', 'Pedigree Adulto Razas Pequeñas x3kg', 'Alimentos para Perros', 'Perro', 'fisico', 42000],
  ['ALP', 'Purina One Adulto x8kg', 'Alimentos para Perros', 'Perro', 'fisico', 79000],
  ['ALP', 'Royal Canin Medium Adult x15kg', 'Alimentos para Perros', 'Perro', 'fisico', 285000],
  ['ALP', 'Hill\'s Science Diet Cachorro x7.5kg', 'Alimentos para Perros', 'Perro', 'fisico', 195000],
  ['ALP', 'Comida Húmeda Pedigree Lata x374g', 'Alimentos para Perros', 'Perro', 'fisico', 8500],

  // Alimentos para Gatos (10)
  ['ALG', 'Whiskas Adulto x1kg', 'Alimentos para Gatos', 'Gato', 'fisico', 18500],
  ['ALG', 'Cat Chow Adulto x8kg', 'Alimentos para Gatos', 'Gato', 'fisico', 89000],
  ['ALG', 'Friskies Adulto x7kg', 'Alimentos para Gatos', 'Gato', 'fisico', 72000],
  ['ALG', 'Purina Pro Plan Gato Esterilizado x7.5kg', 'Alimentos para Gatos', 'Gato', 'fisico', 168000],
  ['ALG', 'Royal Canin Gato Indoor x7.5kg', 'Alimentos para Gatos', 'Gato', 'fisico', 210000],
  ['ALG', 'Concentrado Ringo Gato (bulto)', 'Alimentos para Gatos', 'Gato', 'granel', { pesoBultoKg: 20, precioPorKilo: 5600, rendimiento: 80 }],
  ['ALG', 'Whiskas Sobre Alimento Húmedo x85g', 'Alimentos para Gatos', 'Gato', 'fisico', 3200],
  ['ALG', 'Friskies Pouch Salmón x85g', 'Alimentos para Gatos', 'Gato', 'fisico', 3400],
  ['ALG', 'Cat Chow Gatitos x1.5kg', 'Alimentos para Gatos', 'Gato', 'fisico', 27000],
  ['ALG', 'Purina Fancy Feast Lata x85g', 'Alimentos para Gatos', 'Gato', 'fisico', 6200],

  // Medicamentos Veterinarios (10)
  ['MED', 'Ivermectina Inyectable 50ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 32000, true],
  ['MED', 'Amoxicilina Suspensión 60ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 21000, true],
  ['MED', 'Meloxicam Inyectable 20ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 28000, true],
  ['MED', 'Dexametasona Inyectable 50ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 19500, true],
  ['MED', 'Suero Fisiológico 500ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 9800, false],
  ['MED', 'Vitaminas AD3E Inyectable 100ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 24000, false],
  ['MED', 'Desparasitante Drontal Plus x2 Tab', 'Medicamentos Veterinarios', 'Generales', 'fisico', 26500, false],
  ['MED', 'Antibiótico Enrofloxacina 50ml', 'Medicamentos Veterinarios', 'Generales', 'fisico', 23000, true],
  ['MED', 'Vacuna Antirrábica Unidosis', 'Medicamentos Veterinarios', 'Generales', 'fisico', 18000, true],
  ['MED', 'Vacuna Quíntuple Canina', 'Medicamentos Veterinarios', 'Perro', 'fisico', 45000, true],

  // Accesorios para Mascotas (8)
  ['ACC', 'Comedero Doble Acero Inoxidable', 'Accesorios para Mascotas', 'Generales', 'fisico', 32000],
  ['ACC', 'Bebedero Automático 2L', 'Accesorios para Mascotas', 'Generales', 'fisico', 45000],
  ['ACC', 'Plato Antivoraz para Perro', 'Accesorios para Mascotas', 'Perro', 'fisico', 28000],
  ['ACC', 'Rascador para Gato Torre', 'Accesorios para Mascotas', 'Gato', 'fisico', 120000],
  ['ACC', 'Bozal de Tela Talla M', 'Accesorios para Mascotas', 'Perro', 'fisico', 22000],
  ['ACC', 'Escalera para Mascotas', 'Accesorios para Mascotas', 'Generales', 'fisico', 65000],
  ['ACC', 'Impermeable para Perro Talla S', 'Accesorios para Mascotas', 'Perro', 'fisico', 38000],
  ['ACC', 'Bandeja para Cachorros con Rejilla', 'Accesorios para Mascotas', 'Perro', 'fisico', 55000],

  // Juguetes (8)
  ['JUG', 'Pelota de Goma con Sonido', 'Juguetes', 'Perro', 'fisico', 12000],
  ['JUG', 'Hueso de Nylon para Morder', 'Juguetes', 'Perro', 'fisico', 15000],
  ['JUG', 'Cuerda de Algodón Trenzada', 'Juguetes', 'Perro', 'fisico', 9500],
  ['JUG', 'Ratón de Peluche con Catnip', 'Juguetes', 'Gato', 'fisico', 7500],
  ['JUG', 'Frisbee para Perro', 'Juguetes', 'Perro', 'fisico', 14000],
  ['JUG', 'Juguete Interactivo Dispensador de Premios', 'Juguetes', 'Perro', 'fisico', 42000],
  ['JUG', 'Varita con Plumas para Gato', 'Juguetes', 'Gato', 'fisico', 11000],
  ['JUG', 'Kong Clásico Talla M', 'Juguetes', 'Perro', 'fisico', 55000],

  // Higiene y Cuidado (8)
  ['HIG', 'Shampoo Antipulgas para Perro 500ml', 'Higiene y Cuidado', 'Perro', 'fisico', 24000],
  ['HIG', 'Shampoo Hipoalergénico para Gato 500ml', 'Higiene y Cuidado', 'Gato', 'fisico', 26000],
  ['HIG', 'Cepillo Deslanador', 'Higiene y Cuidado', 'Generales', 'fisico', 18000],
  ['HIG', 'Cortauñas para Mascotas', 'Higiene y Cuidado', 'Generales', 'fisico', 13500],
  ['HIG', 'Toallitas Húmedas para Mascotas x80', 'Higiene y Cuidado', 'Generales', 'fisico', 16000],
  ['HIG', 'Colonia para Perro 250ml', 'Higiene y Cuidado', 'Perro', 'fisico', 19000],
  ['HIG', 'Servicio de Baño y Corte (Grooming)', 'Higiene y Cuidado', 'Generales', 'servicio', 38000],
  ['HIG', 'Servicio de Corte de Uñas', 'Higiene y Cuidado', 'Generales', 'servicio', 12000],

  // Suplementos (6)
  ['SUP', 'Omega 3 para Piel y Pelaje x60 Cap', 'Suplementos', 'Generales', 'fisico', 45000],
  ['SUP', 'Condroprotector Articular x30 Tab', 'Suplementos', 'Perro', 'fisico', 52000],
  ['SUP', 'Probiótico Digestivo Polvo x100g', 'Suplementos', 'Generales', 'fisico', 34000],
  ['SUP', 'Multivitamínico Cachorro x30 Tab', 'Suplementos', 'Perro', 'fisico', 29000],
  ['SUP', 'Calcio para Aves x100ml', 'Suplementos', 'Aves', 'fisico', 17000],
  ['SUP', 'Suplemento para Muda de Pelo x200g', 'Suplementos', 'Gato', 'fisico', 31000],

  // Snacks y Premios (8)
  ['SNK', 'Galletas Pedigree Dentastix x7 Un', 'Snacks y Premios', 'Perro', 'fisico', 14500],
  ['SNK', 'Premios Whiskas Temptations x85g', 'Snacks y Premios', 'Gato', 'fisico', 9800],
  ['SNK', 'Huesos de Cuero Prensado x5 Un', 'Snacks y Premios', 'Perro', 'fisico', 16000],
  ['SNK', 'Snacks de Pollo Deshidratado x100g', 'Snacks y Premios', 'Generales', 'fisico', 13000],
  ['SNK', 'Premios de Entrenamiento Ringo x200g', 'Snacks y Premios', 'Perro', 'fisico', 11000],
  ['SNK', 'Barritas de Salmón para Gato x50g', 'Snacks y Premios', 'Gato', 'fisico', 8500],
  ['SNK', 'Snacks Dentales para Gato x40g', 'Snacks y Premios', 'Gato', 'fisico', 10500],
  ['SNK', 'Croquetas Premio Freeze Dried x100g', 'Snacks y Premios', 'Generales', 'fisico', 22000],

  // Camas y Transportadoras (6)
  ['CAM', 'Cama Ortopédica para Perro Talla L', 'Camas y Transportadoras', 'Perro', 'fisico', 135000],
  ['CAM', 'Cama Redonda para Gato', 'Camas y Transportadoras', 'Gato', 'fisico', 68000],
  ['CAM', 'Transportadora Plástica Talla M', 'Camas y Transportadoras', 'Generales', 'fisico', 95000],
  ['CAM', 'Transportadora de Tela Talla S', 'Camas y Transportadoras', 'Generales', 'fisico', 62000],
  ['CAM', 'Colchoneta Impermeable para Mascota', 'Camas y Transportadoras', 'Generales', 'fisico', 45000],
  ['CAM', 'Casa de Madera para Exteriores', 'Camas y Transportadoras', 'Perro', 'fisico', 220000],

  // Collares y Correas (8)
  ['COL', 'Collar Antipulgas para Perro', 'Collares y Correas', 'Perro', 'fisico', 26000],
  ['COL', 'Collar Ajustable con Hebilla Talla M', 'Collares y Correas', 'Perro', 'fisico', 18000],
  ['COL', 'Correa Retráctil 5m', 'Collares y Correas', 'Perro', 'fisico', 48000],
  ['COL', 'Arnés Acolchado Talla S', 'Collares y Correas', 'Perro', 'fisico', 34000],
  ['COL', 'Correa de Cuero Talla L', 'Collares y Correas', 'Perro', 'fisico', 52000],
  ['COL', 'Collar Isabelino Talla M', 'Collares y Correas', 'Generales', 'fisico', 21000],
  ['COL', 'Placa de Identificación Grabada', 'Collares y Correas', 'Generales', 'fisico', 15000],
  ['COL', 'Pechera Antitirón Talla M', 'Collares y Correas', 'Perro', 'fisico', 39000],

  // Otros Animales (6)
  ['OTR', 'Alimento para Conejo x2kg', 'Otros Animales', 'Generales', 'fisico', 22000],
  ['OTR', 'Alimento para Hámster x1kg', 'Otros Animales', 'Generales', 'fisico', 14000],
  ['OTR', 'Heno Timothy para Roedores x500g', 'Otros Animales', 'Generales', 'fisico', 18000],
  ['OTR', 'Alimento para Tortuga Acuática x100g', 'Otros Animales', 'Generales', 'fisico', 12500],
  ['OTR', 'Bebedero para Jaula de Aves', 'Otros Animales', 'Aves', 'fisico', 9500],
  ['OTR', 'Consulta General Veterinaria', 'Otros Animales', 'Generales', 'servicio', 45000],

  // Antipulgas y Garrapatas (5)
  ['ANT', 'Pipeta Antipulgas para Perro Frontline', 'Antipulgas y Garrapatas', 'Perro', 'fisico', 32000],
  ['ANT', 'Pipeta Antipulgas para Gato Advantage', 'Antipulgas y Garrapatas', 'Gato', 'fisico', 29000],
  ['ANT', 'Collar Antipulgas Seresto', 'Antipulgas y Garrapatas', 'Perro', 'fisico', 85000],
  ['ANT', 'Spray Antipulgas para Ambientes 500ml', 'Antipulgas y Garrapatas', 'Generales', 'fisico', 27000],
  ['ANT', 'Tableta Antipulgas Bravecto', 'Antipulgas y Garrapatas', 'Perro', 'fisico', 68000],

  // Areneros (3)
  ['ARE', 'Arenero Cerrado con Filtro', 'Areneros', 'Gato', 'fisico', 95000],
  ['ARE', 'Arena Sanitaria Aglomerante x10kg', 'Areneros', 'Gato', 'fisico', 32000],
  ['ARE', 'Pala para Arenero de Gato', 'Areneros', 'Gato', 'fisico', 8500],

  // Peceras y Acuarios (3)
  ['PEC', 'Pecera de Vidrio 20L', 'Peceras y Acuarios', 'Generales', 'fisico', 75000],
  ['PEC', 'Filtro para Acuario Interno', 'Peceras y Acuarios', 'Generales', 'fisico', 38000],
  ['PEC', 'Alimento para Peces en Hojuelas x100g', 'Peceras y Acuarios', 'Generales', 'fisico', 9500],
];

const headers = [
  'Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'FechaVencimiento',
  'TipoProducto', 'EsBulto', 'PesoBultoKg', 'PrecioPorKilo', 'RendimientoRaciones', 'Lote', 'Especie', 'RequiereReceta',
];

const counters = {};
const rows = [headers];

for (const [prefix, nombre, categoria, especie, tipo, precioOrGranel, requiereReceta] of ITEMS) {
  counters[prefix] = (counters[prefix] || 0) + 1;
  const codigo = `${prefix}${String(counters[prefix]).padStart(3, '0')}`;

  const [stockMin, stockMax] = STOCK_RANGE[categoria];
  const margen = MARGEN[categoria];

  let stock, costo, precio, tipoProductoLabel, esBulto = '', pesoBultoKg = '', precioPorKilo = '', rendimiento = '';

  if (tipo === 'granel') {
    stock = randInt(5, 20);
    tipoProductoLabel = 'Granel-Alimento';
    esBulto = 'SI';
    pesoBultoKg = precioOrGranel.pesoBultoKg;
    precioPorKilo = precioOrGranel.precioPorKilo;
    rendimiento = precioOrGranel.rendimiento;
    precio = roundTo(pesoBultoKg * precioPorKilo, 500);
    costo = roundTo(precio * margen, 500);
  } else if (tipo === 'servicio') {
    stock = 999;
    tipoProductoLabel = 'Servicio';
    precio = precioOrGranel;
    costo = 0;
  } else {
    stock = randInt(stockMin, stockMax);
    tipoProductoLabel = 'Físico';
    precio = precioOrGranel;
    costo = roundTo(precio * margen, 100);
  }

  const minStock = tipo === 'servicio' ? 0 : Math.max(3, Math.round(stock * 0.25));
  const fechaVencimiento = CON_VENCIMIENTO.has(categoria) ? futureDate() : '';
  const loteVal = CON_LOTE.has(categoria) ? lote() : '';
  const recetaVal = tipo === 'fisico' && categoria === 'Medicamentos Veterinarios' ? (requiereReceta ? 'SI' : 'NO') : 'NO';

  rows.push([
    codigo, nombre, stock, costo, precio, categoria, minStock, fechaVencimiento,
    tipoProductoLabel, esBulto, pesoBultoKg, precioPorKilo, rendimiento, loteVal, especie, recetaVal,
  ]);
}

if (rows.length - 1 !== 100) {
  throw new Error(`Se esperaban 100 productos, se generaron ${rows.length - 1}`);
}

const csvBody = rows.map((r) => r.join(';')).join('\n');
const BOM = '﻿';

mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'mascotas-100-productos-demo.csv');
writeFileSync(outPath, BOM + csvBody + '\n', 'utf8');

console.log(`Generados ${rows.length - 1} productos en ${outPath}`);
