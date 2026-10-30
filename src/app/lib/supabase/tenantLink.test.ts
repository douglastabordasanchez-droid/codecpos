import { beforeEach, describe, expect, it } from 'vitest';
import { getLinkedClienteId, isLinked } from './tenantLink';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
});

describe('vínculo de tenant', () => {
  it('solo expone el tenant vinculado cuando coincide con la base local activa', () => {
    localStorage.setItem('codecpos_supabase_cliente_id', 'papotas');
    localStorage.setItem('codecpos_supabase_sync_email', 'sync@papotas');
    localStorage.setItem('codecpos_supabase_sync_password', 'secret');
    localStorage.setItem('codecpos_datos_activos_cliente_id', 'papotas');

    expect(getLinkedClienteId()).toBe('papotas');
    expect(isLinked()).toBe(true);
  });

  it('bloquea la sincronización si el vínculo pertenece a otro negocio', () => {
    localStorage.setItem('codecpos_supabase_cliente_id', 'megacan');
    localStorage.setItem('codecpos_supabase_sync_email', 'sync@megacan');
    localStorage.setItem('codecpos_supabase_sync_password', 'secret');
    localStorage.setItem('codecpos_datos_activos_cliente_id', 'papotas');

    expect(getLinkedClienteId()).toBeNull();
    expect(isLinked()).toBe(false);
  });
});
