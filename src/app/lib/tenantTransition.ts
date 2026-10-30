let tenantSwitchRequests = 0;
let activeSyncCycles = 0;
let syncCyclesDrained: (() => void)[] = [];
let previousTenantSwitch = Promise.resolve();

export async function beginTenantSwitch(): Promise<() => void> {
  tenantSwitchRequests += 1;
  const previousSwitch = previousTenantSwitch;
  let releaseQueue!: () => void;
  previousTenantSwitch = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previousSwitch;

  if (activeSyncCycles > 0) {
    await new Promise<void>((resolve) => syncCyclesDrained.push(resolve));
  }

  return () => {
    tenantSwitchRequests -= 1;
    releaseQueue();
  };
}

export function enterSyncCycle(): (() => void) | null {
  if (tenantSwitchRequests > 0) return null;

  activeSyncCycles += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeSyncCycles -= 1;
    if (activeSyncCycles === 0) {
      const waiters = syncCyclesDrained;
      syncCyclesDrained = [];
      waiters.forEach((resolve) => resolve());
    }
  };
}

export function isTenantSwitchInProgress(): boolean {
  return tenantSwitchRequests > 0;
}
