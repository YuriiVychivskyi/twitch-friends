export type RuntimeHealth = 'inactive' | 'pending' | 'ready' | 'unavailable';

export const RUNTIME_STATUS_REQUEST = 'runtime-status:get';

export type RuntimeStatus = {
  environment: 'emulator' | 'production' | 'unknown';
  firebaseAuth: RuntimeHealth;
  localIdentity: RuntimeHealth;
  privateKeys: RuntimeHealth;
};

const runtimeHealthValues = new Set<RuntimeHealth>(['inactive', 'pending', 'ready', 'unavailable']);
const environmentValues = new Set<RuntimeStatus['environment']>([
  'emulator',
  'production',
  'unknown',
]);

let runtimeStatus: RuntimeStatus = {
  environment: 'unknown',
  firebaseAuth: 'pending',
  localIdentity: 'pending',
  privateKeys: 'pending',
};

export function getRuntimeStatus(): RuntimeStatus {
  return { ...runtimeStatus };
}

export function setRuntimeStatus(status: Partial<RuntimeStatus>) {
  runtimeStatus = {
    ...runtimeStatus,
    ...status,
  };
}

export function isRuntimeStatusRequest(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return Object.keys(message).length === 1 && message.type === RUNTIME_STATUS_REQUEST;
}

export function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 4 ||
    !keys.every((key) =>
      ['environment', 'firebaseAuth', 'localIdentity', 'privateKeys'].includes(key),
    )
  ) {
    return false;
  }

  const status = value as Record<string, unknown>;

  return (
    environmentValues.has(status.environment as RuntimeStatus['environment']) &&
    runtimeHealthValues.has(status.firebaseAuth as RuntimeHealth) &&
    runtimeHealthValues.has(status.localIdentity as RuntimeHealth) &&
    runtimeHealthValues.has(status.privateKeys as RuntimeHealth)
  );
}
