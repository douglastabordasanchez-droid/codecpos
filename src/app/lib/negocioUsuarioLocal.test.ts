import { describe, expect, it } from 'vitest';
import { negocioDeUsuarioLocal } from './negocioUsuarioLocal';

const adminFabrica = { id: 'admin_1', creadoPor: 'SISTEMA' };
const duenoPapotas = { id: 'lic_papotas', creadoPor: 'LICENCIA_NUBE', clienteSupabaseId: 'papotas' };

describe('negocio de una cuenta local', () => {
  it('usa el negocio guardado en la cuenta', () => {
    expect(negocioDeUsuarioLocal(duenoPapotas, [duenoPapotas], 'codec')).toBe('papotas');
  });

  it('un cajero antiguo hereda el negocio de quien lo creó', () => {
    const cajera = { id: 'user_1', creadoPor: 'lic_papotas' };
    const ayudante = { id: 'user_2', creadoPor: 'user_1' };
    const usuarios = [duenoPapotas, cajera, ayudante];
    expect(negocioDeUsuarioLocal(ayudante, usuarios, 'codec')).toBe('papotas');
  });

  it('el Admin de fábrica va al negocio original, nunca al último abierto', () => {
    expect(negocioDeUsuarioLocal(adminFabrica, [adminFabrica], 'codec')).toBe('codec');
    const cajero = { id: 'user_3', creadoPor: 'admin_1' };
    expect(negocioDeUsuarioLocal(cajero, [adminFabrica, cajero], 'codec')).toBe('codec');
  });

  it('sin negocio original no inventa uno', () => {
    expect(negocioDeUsuarioLocal(adminFabrica, [adminFabrica], null)).toBeUndefined();
  });

  it('no se cuelga con creadores en círculo', () => {
    const a = { id: 'a', creadoPor: 'b' };
    const b = { id: 'b', creadoPor: 'a' };
    expect(negocioDeUsuarioLocal(a, [a, b], 'codec')).toBe('codec');
  });
});
