import { getBackendUrl } from '@/config/backendEnvironment';
import { getFirebaseIdToken } from '@/infrastructure/firebase/firebaseAuth';

type BackendErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export class BackendError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requestBackend<T>(
  path: string,
  init: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  } = {},
) {
  const token = await getFirebaseIdToken();
  const response = await fetch(`${getBackendUrl()}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    method: init.method ?? 'GET',
    signal: AbortSignal.timeout(15_000),
  });
  let value: unknown;

  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new BackendError('invalid-response', response.status, 'Backend returned invalid data.');
  }

  if (!response.ok) {
    const body = value as BackendErrorBody;
    const code = typeof body.error?.code === 'string' ? body.error.code : 'request-failed';
    const message =
      typeof body.error?.message === 'string' ? body.error.message : 'Backend request failed.';

    throw new BackendError(code, response.status, message);
  }

  return value as T;
}
