import { describe, expect, it } from 'vitest';

import { isRuntimeStatus } from '@/runtime/runtimeStatus';

describe('runtime status', () => {
  it('accepts only sanitized runtime states', () => {
    expect(
      isRuntimeStatus({
        environment: 'emulator',
        firebaseAuth: 'ready',
        localIdentity: 'ready',
        privateKeys: 'ready',
      }),
    ).toBe(true);
    expect(
      isRuntimeStatus({
        environment: 'emulator',
        firebaseAuth: 'ready',
        localIdentity: 'ready',
        privateKeys: 'ready',
        uid: 'private',
      }),
    ).toBe(false);
  });
});
