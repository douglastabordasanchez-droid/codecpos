export interface TipoNegocio {
  id: string;
  nombre: string;
  /** Nombre del icono de lucide-react que representa este tipo de negocio */
  icono: string;
  categorias: string[];
  atributosEspeciales: string[];
  iva?: {
    sugerencia: 'exento' | 'normal' | 'reducido';
    productos_exentos?: string[];
  };
}

export const TIPOS_NEGOCIO: Record<string, TipoNegocio> = {
  minimercado: {
    id: 'minimercado',
    nombre: 'Minimercado / Tienda de Barrio',
    icono: 'Store',
    categorias: [
      'Abarrotes',
      'Lácteos',
      'Carnes y Pescados',
      'Frutas y Verduras',
      'Panadería',
      'Bebidas',
      'Aseo Hogar',
      'Aseo Personal',
      'Snacks y Dulces',
      'Enlatados',
      'Granos y Cereales',
      'Condimentos',
      'Huevos',
      'Embutidos',
    ],
    atributosEspeciales: ['peso', 'fechaVencimiento', 'lote'],
    iva: {
      sugerencia: 'exento',
      productos_exentos: ['pan', 'leche', 'huevos', 'carne', 'frutas', 'verduras'],
    },
  },

  ropa: {
    id: 'ropa',
    nombre: 'Tienda de Ropa',
    icono: 'Shirt',
    categorias: [
      'Camisas',
      'Pantalones',
      'Vestidos',
      'Faldas',
      'Ropa Interior',
      'Ropa Deportiva',
      'Zapatos',
      'Accesorios',
      'Ropa de Bebé',
      'Ropa de Niños',
      'Ropa de Hombre',
      'Ropa de Mujer',
      'Chaquetas',
      'Trajes de Baño',
    ],
    atributosEspeciales: ['talla', 'color', 'material', 'marca'],
    iva: {
      sugerencia: 'normal',
    },
  },

  drogueria: {
    id: 'drogueria',
    nombre: 'Droguería / Farmacia',
    icono: 'Pill',
    categorias: [
      'Antibióticos',
      'Analgésicos',
      'Antiinflamatorios',
      'Vitaminas y Suplementos',
      'Medicamentos de Venta Libre',
      'Cuidado Personal',
      'Insumos Médicos',
      'Productos Naturales',
      'Cuidado del Bebé',
      'Primeros Auxilios',
      'Antiácidos',
      'Antigripales',
      'Medicamentos Genéricos',
      'Dermocosméticos',
    ],
    atributosEspeciales: ['fechaVencimiento', 'lote', 'registroInvima', 'principioActivo'],
    iva: {
      sugerencia: 'exento',
      productos_exentos: ['medicamentos', 'antibióticos', 'vitaminas'],
    },
  },

  ferreteria: {
    id: 'ferreteria',
    nombre: 'Ferretería',
    icono: 'Hammer',
    categorias: [
      'Herramientas Manuales',
      'Herramientas Eléctricas',
      'Plomería',
      'Eléctricos',
      'Pinturas y Acabados',
      'Materiales de Construcción',
      'Tornillería',
      'Candados y Cerrajería',
      'Jardinería',
      'Adhesivos y Selladores',
      'Tuberías y Accesorios',
      'Iluminación',
      'Cables y Conectores',
      'Seguridad Industrial',
    ],
    atributosEspeciales: ['marca', 'garantia', 'medida', 'material'],
    iva: {
      sugerencia: 'normal',
    },
  },

  papeleria: {
    id: 'papeleria',
    nombre: 'Papelería',
    icono: 'Pencil',
    categorias: [
      'Cuadernos y Libretas',
      'Útiles Escolares',
      'Papelería Corporativa',
      'Archivadores y Carpetas',
      'Artículos de Oficina',
      'Tintas y Toners',
      'Arte y Manualidades',
      'Impresión',
      'Mochilas y Bolsos',
      'Calculadoras',
      'Marcadores y Resaltadores',
      'Pegamentos y Cintas',
      'Tijeras y Cortapapeles',
      'Tecnología',
    ],
    atributosEspeciales: ['marca', 'tamaño', 'color'],
    iva: {
      sugerencia: 'normal',
    },
  },

  panaderia: {
    id: 'panaderia',
    nombre: 'Panadería / Pastelería',
    icono: 'ChefHat',
    categorias: [
      'Pan Artesanal',
      'Pan Dulce',
      'Tortas y Pasteles',
      'Galletas',
      'Postres',
      'Productos Salados',
      'Pan Integral',
      'Pan Sin Gluten',
      'Croissants y Hojaldres',
      'Empanadas',
      'Cupcakes',
      'Pan de Masa Madre',
      'Brownies y Ponqués',
      'Productos Congelados',
    ],
    atributosEspeciales: ['fechaVencimiento', 'fechaElaboracion', 'ingredientes'],
    iva: {
      sugerencia: 'exento',
    },
  },

  carniceria: {
    id: 'carniceria',
    nombre: 'Carnicería',
    icono: 'Scissors',
    categorias: [
      'Res',
      'Cerdo',
      'Pollo',
      'Pescado',
      'Embutidos',
      'Vísceras',
      'Carnes Premium',
      'Cortes Especiales',
      'Carnes Maduradas',
      'Productos del Mar',
      'Cordero',
      'Carnes Procesadas',
      'Productos Congelados',
      'Orgánicos',
    ],
    atributosEspeciales: ['peso', 'fechaVencimiento', 'corte', 'origen'],
    iva: {
      sugerencia: 'exento',
    },
  },

  restaurante: {
    id: 'restaurante',
    nombre: 'Restaurante / Comidas Rápidas',
    icono: 'UtensilsCrossed',
    categorias: [
      'Entradas',
      'Platos Fuertes',
      'Sopas y Caldos',
      'Ensaladas',
      'Hamburguesas',
      'Pizzas',
      'Bebidas',
      'Postres',
      'Combos',
      'Comida Rápida',
      'Comida Típica',
      'Vegetariano',
      'Infantil',
      'Extras',
    ],
    atributosEspeciales: ['ingredientes', 'porcion', 'tiempoPreparacion'],
    iva: {
      sugerencia: 'normal',
    },
  },

  licores: {
    id: 'licores',
    nombre: 'Licorería',
    icono: 'Wine',
    categorias: [
      'Cervezas',
      'Vinos',
      'Whisky',
      'Aguardiente',
      'Ron',
      'Vodka',
      'Tequila',
      'Licores',
      'Cócteles',
      'Bebidas sin Alcohol',
      'Vinos Importados',
      'Licores Artesanales',
      'Champagne y Espumosos',
      'Snacks',
    ],
    atributosEspeciales: ['graduacionAlcoholica', 'origen', 'añejamiento', 'marca'],
    iva: {
      sugerencia: 'normal',
    },
  },

  tecnologia: {
    id: 'tecnologia',
    nombre: 'Tienda de Tecnología',
    icono: 'Laptop',
    categorias: [
      'Celulares y Tablets',
      'Computadores',
      'Accesorios',
      'Audio y Video',
      'Gaming',
      'Smart Home',
      'Wearables',
      'Cámaras',
      'Almacenamiento',
      'Redes y Conectividad',
      'Componentes',
      'Periféricos',
      'Software',
      'Impresoras y Escáneres',
    ],
    atributosEspeciales: ['marca', 'modelo', 'garantia', 'serial'],
    iva: {
      sugerencia: 'normal',
    },
  },

  belleza: {
    id: 'belleza',
    nombre: 'Productos de Belleza',
    icono: 'Sparkles',
    categorias: [
      'Maquillaje',
      'Cuidado de la Piel',
      'Cuidado del Cabello',
      'Perfumes',
      'Uñas',
      'Cuidado Facial',
      'Cuidado Corporal',
      'Higiene Personal',
      'Tratamientos Capilares',
      'Accesorios de Belleza',
      'Productos Naturales',
      'Productos para Hombre',
      'Productos para Bebés',
      'Dermocosméticos',
    ],
    atributosEspeciales: ['marca', 'tono', 'fechaVencimiento', 'registroInvima'],
    iva: {
      sugerencia: 'normal',
    },
  },

  veterinaria: {
    id: 'veterinaria',
    nombre: 'Veterinaria / Mascotas',
    icono: 'PawPrint',
    categorias: [
      'Alimentos para Perros',
      'Alimentos para Gatos',
      'Medicamentos Veterinarios',
      'Accesorios para Mascotas',
      'Juguetes',
      'Higiene y Cuidado',
      'Suplementos',
      'Snacks y Premios',
      'Camas y Transportadoras',
      'Collares y Correas',
      'Otros Animales',
      'Antipulgas y Garrapatas',
      'Areneros',
      'Peceras y Acuarios',
    ],
    atributosEspeciales: ['fechaVencimiento', 'especieAnimal', 'edadRecomendada'],
    iva: {
      sugerencia: 'normal',
    },
  },

  jugueteria: {
    id: 'jugueteria',
    nombre: 'Juguetería',
    icono: 'Star',
    categorias: [
      'Juguetes para Bebés',
      'Muñecas y Figuras de Acción',
      'Juegos de Mesa',
      'Juguetes Educativos',
      'Construcción y Bloques',
      'Vehículos y Control Remoto',
      'Peluches',
      'Juegos al Aire Libre',
      'Arte y Manualidades',
      'Electrónicos',
      'Disfraces',
      'Coleccionables',
      'Rompecabezas',
      'Instrumentos Musicales',
    ],
    atributosEspeciales: ['edadRecomendada', 'marca', 'material'],
    iva: {
      sugerencia: 'normal',
    },
  },

  deportes: {
    id: 'deportes',
    nombre: 'Artículos Deportivos',
    icono: 'Trophy',
    categorias: [
      'Fútbol',
      'Basketball',
      'Tenis',
      'Gimnasio y Fitness',
      'Ciclismo',
      'Natación',
      'Running',
      'Artes Marciales',
      'Camping y Outdoor',
      'Yoga y Pilates',
      'Patinaje',
      'Deportes Extremos',
      'Suplementos Deportivos',
      'Ropa Deportiva',
    ],
    atributosEspeciales: ['marca', 'talla', 'material', 'deporte'],
    iva: {
      sugerencia: 'normal',
    },
  },

  libreria: {
    id: 'libreria',
    nombre: 'Librería',
    icono: 'BookOpen',
    categorias: [
      'Ficción',
      'No Ficción',
      'Infantil y Juvenil',
      'Educación',
      'Autoayuda',
      'Novelas',
      'Cómics y Manga',
      'Ciencia y Tecnología',
      'Historia',
      'Arte y Fotografía',
      'Religión y Espiritualidad',
      'Cocina',
      'Bestsellers',
      'Libros Usados',
    ],
    atributosEspeciales: ['autor', 'editorial', 'isbn', 'idioma'],
    iva: {
      sugerencia: 'exento',
    },
  },
};

export const CATEGORIAS_MINIMERCADO = TIPOS_NEGOCIO.minimercado.categorias;

/**
 * Obtener categorías según el tipo de negocio
 */
export function obtenerCategoriasPorTipo(tipoNegocio: string): string[] {
  return TIPOS_NEGOCIO[tipoNegocio]?.categorias || CATEGORIAS_MINIMERCADO;
}

/**
 * Obtener atributos especiales según el tipo de negocio
 */
export function obtenerAtributosPorTipo(tipoNegocio: string): string[] {
  return TIPOS_NEGOCIO[tipoNegocio]?.atributosEspeciales || [];
}

/**
 * Obtener sugerencia de IVA según el tipo de negocio y categoría
 */
export function obtenerSugerenciaIVA(tipoNegocio: string, categoria?: string): boolean {
  const tipo = TIPOS_NEGOCIO[tipoNegocio];
  if (!tipo?.iva) return false;
  
  if (tipo.iva.sugerencia === 'exento') return false;
  if (tipo.iva.sugerencia === 'normal') return true;
  
  // Verificar si la categoría está en productos exentos
  if (tipo.iva.productos_exentos && categoria) {
    const categoriaLower = categoria.toLowerCase();
    return !tipo.iva.productos_exentos.some(p => categoriaLower.includes(p));
  }
  
  return false;
}
