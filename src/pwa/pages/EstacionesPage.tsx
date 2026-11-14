/**
 * Estaciones en el celular o la tablet: misma pantalla que la caja usa a
 * pantalla completa (src/app/components/estaciones/PantallaEstaciones.tsx).
 */
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { PantallaEstaciones } from '../../app/components/estaciones/PantallaEstaciones';

export default function EstacionesPage() {
  const { empleado } = usePwaAuth();
  if (!empleado) return null;
  const esAdmin = ['admin', 'super_usuario'].includes(empleado.rol);
  return (
    <PantallaEstaciones
      clienteId={empleado.cliente_id}
      esAdmin={esAdmin}
      tienda={esAdmin ? undefined : (empleado.tienda_id ?? null)}
    />
  );
}
