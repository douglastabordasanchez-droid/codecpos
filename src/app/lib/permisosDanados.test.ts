import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const memoria = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => { memoria.set(k, v); },
    removeItem: (k: string) => { memoria.delete(k); },
    clear: () => memoria.clear(),
  };
  (globalThis as any).window = (globalThis as any).window ?? { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
});
vi.mock('./indexedDB', () => ({ dbManager: { setConfig: async () => {}, getConfig: async () => null } }));

import { guardarPermisosUsuario, obtenerPermisosUsuario } from './permissions';

const CLAVE = 'codec_pos_permisos_usuarios';

describe('permisos guardados dañados', () => {
  beforeEach(() => localStorage.clear());

  it('un {} restaurado no rompe el login', () => {
    localStorage.setItem(CLAVE, '{}');
    const permisos = obtenerPermisosUsuario('super_1790276633549');
    expect(permisos.userId).toBe('super_1790276633549');
    expect(permisos.modulosHabilitados.length).toBeGreaterThan(0);
  });

  it('un JSON roto tampoco', () => {
    localStorage.setItem(CLAVE, '{no es json');
    expect(() => obtenerPermisosUsuario('x')).not.toThrow();
  });

  it('guardar sobre un valor dañado lo deja como lista', () => {
    localStorage.setItem(CLAVE, '{}');
    guardarPermisosUsuario({ userId: 'u1', modulosHabilitados: [] });
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    expect(Array.isArray(guardado)).toBe(true);
    expect(guardado[0].userId).toBe('u1');
  });
});
