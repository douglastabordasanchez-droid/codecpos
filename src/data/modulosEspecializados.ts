/**
 * Módulos especializados (la "forma" del negocio) y qué tipo de negocio usa
 * cada uno. Al elegir el tipo en "Configurar mi negocio" se muestra su módulo
 * en todo el sistema y se ocultan los demás especializados (migración 0108).
 * Lo comparten la web, el celular y Electron.
 */
export interface ModuloEspecializado {
  id: string;
  nombre: string;
  descripcion: string;
}

export const MODULOS_ESPECIALIZADOS: ModuloEspecializado[] = [
  { id: 'panaderia_onces', nombre: 'Alimentos y Bebidas', descripcion: 'Mesas, comandas, cocina y pedidos del salón' },
  { id: 'veterinaria_mascotas', nombre: 'Veterinaria y Mascotas', descripcion: 'Granel con báscula, estética y farmacia' },
  { id: 'taller_reparaciones', nombre: 'Taller', descripcion: 'Órdenes de reparación y servicio técnico' },
  { id: 'artes_graficas', nombre: 'Artes Gráficas', descripcion: 'Catálogo por escalas y facturas dinámicas' },
  { id: 'papeleria_pinateria', nombre: 'Papelería y Piñatería', descripcion: 'Globos, dulcería, juguetería y fiestas' },
];

/** Módulo especializado que corresponde a cada tipo de negocio (si tiene). */
export const MODULO_POR_TIPO: Record<string, string | null> = {
  restaurante: 'panaderia_onces',
  panaderia: 'panaderia_onces',
  veterinaria: 'veterinaria_mascotas',
  tecnologia: 'taller_reparaciones',
  papeleria: 'papeleria_pinateria',
  jugueteria: 'papeleria_pinateria',
};

/** Al elegir un tipo: todos los especializados quedan ocultos menos el de ese tipo. */
export function ocultosParaTipo(tipoNegocio: string, ocultosActuales: string[] = []): string[] {
  const propio = MODULO_POR_TIPO[tipoNegocio] || null;
  const noEspecializados = ocultosActuales.filter((m) => !MODULOS_ESPECIALIZADOS.some((e) => e.id === m));
  return [...noEspecializados, ...MODULOS_ESPECIALIZADOS.map((e) => e.id).filter((id) => id !== propio)];
}
