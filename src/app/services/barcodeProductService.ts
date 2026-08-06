/**
 * CODEC POS v2.0 - Servicio de Búsqueda de Productos por Código de Barras
 * Consulta APIs externas para obtener información automática de productos
 * 
 * APIs Soportadas:
 * 1. UPC Item DB (Gratuita) - Base de datos global
 * 2. Open Food Facts (Gratuita) - Alimentos
 * 3. Barcode Lookup (Freemium) - Productos generales
 */

import { toast } from 'sonner';

export interface ProductoExternoInfo {
  codigoBarras: string;
  nombre?: string;
  marca?: string;
  descripcion?: string;
  categoria?: string;
  peso?: string;
  dimensiones?: string;
  imagenUrl?: string;
  proveedor?: string;
  pais?: string;
  // Campos específicos que el usuario debe llenar
  precio?: number;
  stock?: number;
  // Campos adicionales para ropa/textiles
  talla?: string;
  color?: string;
  material?: string;
  genero?: string;
}

/**
 * Busca información del producto en múltiples APIs
 */
export async function buscarProductoPorCodigoBarras(
  codigoBarras: string
): Promise<ProductoExternoInfo | null> {
  console.log('🔍 Buscando producto con código:', codigoBarras);
  
  // Intentar en orden de prioridad
  let resultado: ProductoExternoInfo | null = null;
  
  // 1. Intentar UPC Item DB (muy completa y gratuita)
  resultado = await buscarEnUPCItemDB(codigoBarras);
  if (resultado) return resultado;
  
  // 2. Intentar Open Food Facts (excelente para alimentos)
  resultado = await buscarEnOpenFoodFacts(codigoBarras);
  if (resultado) return resultado;
  
  // 3. Intentar Barcode Lookup (backup)
  resultado = await buscarEnBarcodeLookup(codigoBarras);
  if (resultado) return resultado;
  
  // 4. Intentar búsqueda en Google (última opción)
  resultado = await buscarEnGoogle(codigoBarras);
  if (resultado) return resultado;
  
  console.log('❌ No se encontró información del código:', codigoBarras);
  return null;
}

/**
 * API 1: UPC Item DB
 * URL: https://api.upcitemdb.com/prod/trial/lookup
 * Límite: 100 consultas/día (versión gratuita)
 */
async function buscarEnUPCItemDB(codigoBarras: string): Promise<ProductoExternoInfo | null> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${codigoBarras}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.log('UPCItemDB: No encontrado');
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      console.log('✅ UPCItemDB: Producto encontrado', item);
      
      return {
        codigoBarras,
        nombre: item.title || item.description || '',
        marca: item.brand || '',
        descripcion: item.description || '',
        categoria: item.category || '',
        peso: item.weight || '',
        dimensiones: item.dimension || '',
        imagenUrl: item.images?.[0] || '',
        proveedor: item.brand || '',
        pais: item.country || '',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error en UPCItemDB:', error);
    return null;
  }
}

/**
 * API 2: Open Food Facts
 * URL: https://world.openfoodfacts.org/api/v0/product/{barcode}.json
 * Límite: Ilimitado (open source)
 * Mejor para: Alimentos y bebidas
 */
async function buscarEnOpenFoodFacts(codigoBarras: string): Promise<ProductoExternoInfo | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${codigoBarras}.json`
    );
    
    if (!response.ok) {
      console.log('OpenFoodFacts: No encontrado');
      return null;
    }
    
    const data = await response.json();
    
    if (data.status === 1 && data.product) {
      const product = data.product;
      console.log('✅ OpenFoodFacts: Producto encontrado', product);
      
      return {
        codigoBarras,
        nombre: product.product_name || product.product_name_es || '',
        marca: product.brands || '',
        descripcion: product.generic_name || '',
        categoria: product.categories || '',
        peso: product.quantity || '',
        imagenUrl: product.image_url || product.image_front_url || '',
        pais: product.countries || '',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error en OpenFoodFacts:', error);
    return null;
  }
}

/**
 * API 3: Barcode Lookup
 * URL: https://api.barcodelookup.com/v3/products
 * Límite: 100 consultas/día (versión gratuita)
 * Requiere API Key (gratuita)
 */
async function buscarEnBarcodeLookup(codigoBarras: string): Promise<ProductoExternoInfo | null> {
  try {
    // Nota: Requiere API key gratuita de https://www.barcodelookup.com/
    // El usuario debe registrarse y agregar la key en variables de entorno
    const apiKey = import.meta.env.VITE_BARCODE_LOOKUP_API_KEY;
    
    if (!apiKey) {
      console.log('BarcodeLookup: API key no configurada');
      return null;
    }
    
    const response = await fetch(
      `https://api.barcodelookup.com/v3/products?barcode=${codigoBarras}&key=${apiKey}`
    );
    
    if (!response.ok) {
      console.log('BarcodeLookup: No encontrado');
      return null;
    }
    
    const data = await response.json();
    
    if (data.products && data.products.length > 0) {
      const product = data.products[0];
      console.log('✅ BarcodeLookup: Producto encontrado', product);
      
      return {
        codigoBarras,
        nombre: product.title || product.product_name || '',
        marca: product.brand || product.manufacturer || '',
        descripcion: product.description || '',
        categoria: product.category || '',
        imagenUrl: product.images?.[0] || '',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error en BarcodeLookup:', error);
    return null;
  }
}

/**
 * API 4: Búsqueda en Google (última opción)
 * Usa Google Custom Search para intentar obtener información básica
 */
async function buscarEnGoogle(codigoBarras: string): Promise<ProductoExternoInfo | null> {
  try {
    // Esta es una búsqueda básica que intenta inferir el nombre del producto
    // Nota: Para producción, se recomienda usar Google Custom Search API
    console.log('Google: Búsqueda manual requerida para', codigoBarras);
    
    // Por ahora retornamos null para que el usuario complete manualmente
    return null;
  } catch (error) {
    console.error('Error en búsqueda Google:', error);
    return null;
  }
}

/**
 * Sistema de caché local para evitar consultas repetidas
 */
const CACHE_KEY = 'codecpos_barcode_cache';
const CACHE_EXPIRY_DAYS = 30;

interface CacheEntry {
  data: ProductoExternoInfo;
  timestamp: number;
}

/**
 * Guarda resultado en caché local
 */
export function guardarEnCache(info: ProductoExternoInfo): void {
  try {
    const cache = obtenerCache();
    cache[info.codigoBarras] = {
      data: info,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log('💾 Producto guardado en caché:', info.codigoBarras);
  } catch (error) {
    console.error('Error guardando en caché:', error);
  }
}

/**
 * Busca en caché local primero
 */
export function buscarEnCache(codigoBarras: string): ProductoExternoInfo | null {
  try {
    const cache = obtenerCache();
    const entry = cache[codigoBarras];
    
    if (!entry) return null;
    
    // Verificar si la entrada no ha expirado
    const edad = Date.now() - entry.timestamp;
    const expiry = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    if (edad > expiry) {
      console.log('🗑️ Entrada de caché expirada:', codigoBarras);
      delete cache[codigoBarras];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    
    console.log('✅ Producto encontrado en caché:', codigoBarras);
    return entry.data;
  } catch (error) {
    console.error('Error leyendo caché:', error);
    return null;
  }
}

/**
 * Obtiene el caché completo
 */
function obtenerCache(): Record<string, CacheEntry> {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    return cacheStr ? JSON.parse(cacheStr) : {};
  } catch (error) {
    console.error('Error leyendo caché:', error);
    return {};
  }
}

/**
 * Limpia el caché completo
 */
export function limpiarCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('🗑️ Caché de códigos de barras limpiado');
}

/**
 * Función principal con caché integrado
 */
export async function buscarProductoConCache(
  codigoBarras: string
): Promise<ProductoExternoInfo | null> {
  // 1. Buscar en caché primero
  const cached = buscarEnCache(codigoBarras);
  if (cached) {
    toast.info('Producto encontrado en caché local', {
      icon: '💾',
      duration: 2000,
    });
    return cached;
  }
  
  // 2. Buscar en APIs externas
  toast.loading('Buscando producto en bases de datos...', {
    icon: '🔍',
    duration: 1000,
  });
  
  const info = await buscarProductoPorCodigoBarras(codigoBarras);
  
  // 3. Guardar en caché si se encontró
  if (info) {
    guardarEnCache(info);
    toast.success('Producto encontrado en base de datos', {
      icon: '✅',
      duration: 2000,
    });
  } else {
    toast.info('Producto no encontrado, completa manualmente', {
      icon: '✏️',
      duration: 3000,
    });
  }
  
  return info;
}

/**
 * Categorizar producto automáticamente basado en palabras clave
 */
export function categorizarAutomaticamente(nombre: string, categoria?: string): string {
  const nombreLower = nombre.toLowerCase();
  const categoriaLower = categoria?.toLowerCase() || '';
  
  // Alimentos y Bebidas
  if (nombreLower.includes('coca') || nombreLower.includes('pepsi') || nombreLower.includes('jugo') || 
      nombreLower.includes('agua') || categoriaLower.includes('beverage') || categoriaLower.includes('drink')) {
    return 'Bebidas';
  }
  
  if (nombreLower.includes('pan') || nombreLower.includes('galleta') || nombreLower.includes('cereal') ||
      categoriaLower.includes('food') || categoriaLower.includes('snack')) {
    return 'Alimentos';
  }
  
  // Limpieza y Aseo
  if (nombreLower.includes('detergente') || nombreLower.includes('jabón') || nombreLower.includes('limpiador') ||
      nombreLower.includes('cloro') || categoriaLower.includes('cleaning')) {
    return 'Aseo y Limpieza';
  }
  
  // Cuidado Personal
  if (nombreLower.includes('shampoo') || nombreLower.includes('crema') || nombreLower.includes('desodorante') ||
      nombreLower.includes('pasta dental') || categoriaLower.includes('personal care')) {
    return 'Cuidado Personal';
  }
  
  // Ropa y Textiles
  if (nombreLower.includes('camisa') || nombreLower.includes('pantalón') || nombreLower.includes('blusa') ||
      nombreLower.includes('vestido') || categoriaLower.includes('clothing') || categoriaLower.includes('apparel')) {
    return 'Ropa';
  }
  
  // Electrónicos
  if (nombreLower.includes('cable') || nombreLower.includes('cargador') || nombreLower.includes('audífonos') ||
      categoriaLower.includes('electronic')) {
    return 'Electrónicos';
  }
  
  return 'General';
}

/**
 * Inferir talla desde el nombre del producto
 */
export function inferirTalla(nombre: string): string | undefined {
  const nombreUpper = nombre.toUpperCase();
  
  // Tallas numéricas
  const tallasNumericas = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  for (const talla of tallasNumericas) {
    if (nombreUpper.includes(` ${talla} `) || nombreUpper.includes(`-${talla}-`) || 
        nombreUpper.endsWith(` ${talla}`) || nombreUpper.includes(`TALLA ${talla}`)) {
      return talla;
    }
  }
  
  // Tallas numéricas (28, 30, 32, etc.)
  const matchNumerico = nombre.match(/\b(2[8-9]|3[0-9]|4[0-6])\b/);
  if (matchNumerico && (nombreUpper.includes('JEAN') || nombreUpper.includes('PANTALÓN'))) {
    return matchNumerico[1];
  }
  
  return undefined;
}

/**
 * Inferir color desde el nombre del producto
 */
export function inferirColor(nombre: string): string | undefined {
  const nombreLower = nombre.toLowerCase();
  
  const colores = [
    'negro', 'blanco', 'rojo', 'azul', 'verde', 'amarillo', 'naranja', 'morado', 'rosa', 'gris',
    'beige', 'café', 'marino', 'celeste', 'turquesa', 'vino', 'mostaza',
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'gray',
  ];
  
  for (const color of colores) {
    if (nombreLower.includes(color)) {
      return color.charAt(0).toUpperCase() + color.slice(1);
    }
  }
  
  return undefined;
}
