import { describe, expect, it } from 'vitest';
import { beginTenantSwitch, enterSyncCycle } from './tenantTransition';

describe('transición de tenant y sincronización', () => {
  it('espera a que termine el ciclo en curso antes de cambiar de negocio', async () => {
    const liberarCiclo = enterSyncCycle();
    expect(liberarCiclo).not.toBeNull();

    let liberarCambio: (() => void) | undefined;
    const cambio = beginTenantSwitch().then((liberar) => { liberarCambio = liberar; });
    expect(enterSyncCycle()).toBeNull();

    await Promise.resolve();
    expect(liberarCambio).toBeUndefined();

    liberarCiclo?.();
    await cambio;
    expect(enterSyncCycle()).toBeNull();

    liberarCambio?.();
    const siguienteCiclo = enterSyncCycle();
    expect(siguienteCiclo).not.toBeNull();
    siguienteCiclo?.();
  });

  it('serializa cambios de negocio simultáneos', async () => {
    const liberarPrimero = await beginTenantSwitch();
    let segundoAdquirido = false;
    const segundoCambio = beginTenantSwitch().then((liberar) => {
      segundoAdquirido = true;
      return liberar;
    });

    await Promise.resolve();
    expect(segundoAdquirido).toBe(false);
    expect(enterSyncCycle()).toBeNull();

    liberarPrimero();
    const liberarSegundo = await segundoCambio;
    expect(enterSyncCycle()).toBeNull();
    liberarSegundo();

    const ciclo = enterSyncCycle();
    expect(ciclo).not.toBeNull();
    ciclo?.();
  });
});
