/**
 * Estilo automático del menú de Alimentos y Bebidas: según el nombre de la
 * categoría ("Hamburguesas", "Bebidas calientes", "Pasabocas"…) se elige un
 * emoji y un color, y los productos de esa categoría toman el mismo color.
 *
 * Solo se usan emojis que ya existían en Android 9 (Emoji 11), para que se
 * vean también en terminales POS con Android antiguo.
 */

export interface EstiloCategoria {
  emoji: string;
  color: string;
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// El orden importa: lo más específico primero ("bebidas calientes" antes que "bebidas").
const REGLAS: Array<{ palabras: string[]; estilo: EstiloCategoria }> = [
  { palabras: ['salchipapa', 'papas', 'papa frita'], estilo: { emoji: '🍟', color: '#f59e0b' } },
  { palabras: ['mazorcad', 'maiz', 'mazorca'], estilo: { emoji: '🌽', color: '#ca8a04' } },
  { palabras: ['hamburgues', 'burger'], estilo: { emoji: '🍔', color: '#dc2626' } },
  { palabras: ['perro', 'hot dog', 'hotdog'], estilo: { emoji: '🌭', color: '#ea580c' } },
  { palabras: ['pizza'], estilo: { emoji: '🍕', color: '#e11d48' } },
  { palabras: ['tortilla', 'wrap', 'burrito', 'rollo'], estilo: { emoji: '🌯', color: '#a16207' } },
  { palabras: ['spaghetti', 'espagueti', 'pasta', 'ravioli'], estilo: { emoji: '🍝', color: '#f97316' } },
  { palabras: ['lasana'], estilo: { emoji: '🧀', color: '#b45309' } },
  { palabras: ['patacon', 'platano'], estilo: { emoji: '🍌', color: '#65a30d' } },
  { palabras: ['soda', 'coctel', 'granizad', 'limonada', 'malteada'], estilo: { emoji: '🍹', color: '#db2777' } },
  { palabras: ['parrilla', 'asado', 'carnes'], estilo: { emoji: '🥩', color: '#991b1b' } },
  { palabras: ['plato', 'almuerzo', 'especial', 'ejecutivo'], estilo: { emoji: '🍽️', color: '#7c3aed' } },
  { palabras: ['bebidas calientes', 'caliente', 'cafe', 'tinto', 'aromatica'], estilo: { emoji: '☕', color: '#78350f' } },
  { palabras: ['bebidas frias', 'fria', 'jugo', 'bebida', 'gaseosa', 'refresco'], estilo: { emoji: '🥤', color: '#0284c7' } },
  { palabras: ['cerveza', 'licor', 'bar'], estilo: { emoji: '🍺', color: '#d97706' } },
  { palabras: ['sandwich', 'sanduche', 'sandwiche'], estilo: { emoji: '🥪', color: '#ca8a04' } },
  { palabras: ['crepe', 'panqueque', 'pancake'], estilo: { emoji: '🥞', color: '#c026d3' } },
  { palabras: ['nacho', 'taco', 'mexican'], estilo: { emoji: '🌮', color: '#16a34a' } },
  { palabras: ['omelette', 'omelet', 'tortilla de huevo'], estilo: { emoji: '🍳', color: '#f59e0b' } },
  { palabras: ['huevo'], estilo: { emoji: '🍳', color: '#eab308' } },
  { palabras: ['arepa'], estilo: { emoji: '🥙', color: '#d97706' } },
  { palabras: ['waffle', 'helado', 'postre'], estilo: { emoji: '🍦', color: '#ec4899' } },
  { palabras: ['caldo', 'sopa', 'consome', 'changua'], estilo: { emoji: '🍲', color: '#0d9488' } },
  { palabras: ['desayuno', 'calentado'], estilo: { emoji: '🍛', color: '#15803d' } },
  { palabras: ['combo', 'promo'], estilo: { emoji: '🎁', color: '#2563eb' } },
  { palabras: ['pasaboca', 'panader', 'pan', 'hojaldre', 'galleta', 'torta', 'ponque', 'mantecada'], estilo: { emoji: '🥐', color: '#d97706' } },
  { palabras: ['pollo', 'alita'], estilo: { emoji: '🍗', color: '#ea580c' } },
  { palabras: ['ensalada', 'saludable', 'vegetar'], estilo: { emoji: '🥗', color: '#16a34a' } },
  { palabras: ['pescado', 'marisco', 'camaron'], estilo: { emoji: '🍤', color: '#0891b2' } },
];

// Si ninguna regla aplica, se reparte una paleta para que cada categoría se distinga.
const RESPALDO: EstiloCategoria[] = [
  { emoji: '⭐', color: '#2563eb' }, { emoji: '🍴', color: '#7c3aed' }, { emoji: '🧺', color: '#0d9488' },
  { emoji: '🎉', color: '#db2777' }, { emoji: '🔥', color: '#dc2626' }, { emoji: '🌟', color: '#ca8a04' },
];

export function estiloCategoria(nombre: string, indice = 0): EstiloCategoria {
  const t = normalizar(nombre);
  for (const r of REGLAS) {
    if (r.palabras.some((p) => t.includes(p))) return r.estilo;
  }
  return RESPALDO[indice % RESPALDO.length];
}

/** true si el texto es un emoji (los íconos guardados como emoji se dibujan como texto). */
export function esEmoji(valor: string | undefined | null): boolean {
  if (!valor) return false;
  return /\p{Extended_Pictographic}/u.test(valor) && valor.length <= 8;
}
