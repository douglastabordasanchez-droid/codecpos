/**
 * Íconos de sucursal (Multi-Tienda) — reemplaza los emojis sueltos (🏪🏬🏦...)
 * por íconos Lucide, mismo patrón ya usado en tipos-negocio.ts para el tipo
 * de negocio. `Tienda.emoji` (multitiendaService.ts) sigue siendo un string
 * simple por compatibilidad de esquema/almacenamiento — a partir de ahora
 * guarda una CLAVE de ícono (ej. "store") en vez de un carácter emoji, pero
 * `IconoTienda` sigue reconociendo los emojis viejos ya guardados en
 * instalaciones existentes, para no romper sucursales creadas antes de este
 * cambio.
 */
import type { LucideIcon } from 'lucide-react';
import { Store, Building2, Landmark, ShoppingCart, Building, Factory, Home, Star } from 'lucide-react';

export const ICONOS_TIENDA_PRESET: { key: string; Icon: LucideIcon }[] = [
  { key: 'store', Icon: Store },
  { key: 'building2', Icon: Building2 },
  { key: 'landmark', Icon: Landmark },
  { key: 'cart', Icon: ShoppingCart },
  { key: 'building', Icon: Building },
  { key: 'factory', Icon: Factory },
  { key: 'home', Icon: Home },
  { key: 'star', Icon: Star },
];

const MAPA_ICONOS: Record<string, LucideIcon> = Object.fromEntries(
  ICONOS_TIENDA_PRESET.map(({ key, Icon }) => [key, Icon])
);

// Sucursales creadas antes de este cambio guardaron un emoji literal — se
// mapean al ícono más parecido para que sigan viéndose bien sin migración.
const MAPA_EMOJIS_LEGADO: Record<string, LucideIcon> = {
  '🏪': Store,
  '🏬': Building2,
  '🏦': Landmark,
  '🛒': ShoppingCart,
  '🏢': Building,
  '🏭': Factory,
  '🏠': Home,
  '🌟': Star,
};

export function iconoParaTienda(valor: string | undefined | null): LucideIcon {
  if (!valor) return Store;
  return MAPA_ICONOS[valor] || MAPA_EMOJIS_LEGADO[valor] || Store;
}

export function IconoTienda({ tienda, className }: { tienda: { emoji?: string | null }; className?: string }) {
  const Icon = iconoParaTienda(tienda?.emoji);
  return <Icon className={className || 'w-5 h-5'} />;
}
