/**
 * CODECPOS v2.0 - Manager de Versículos Bíblicos
 * Componente que gestiona la visualización de versículos
 */

import { useVersiculosBiblicos } from '../../hooks/useVersiculosBiblicos';

export default function VersiculosManager() {
  // Activar el hook
  useVersiculosBiblicos();
  
  // No renderiza nada, solo ejecuta la lógica
  return null;
}
