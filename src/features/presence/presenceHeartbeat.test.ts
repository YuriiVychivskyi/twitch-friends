import { describe, expect, it } from 'vitest';

import {
  isPresenceHeartbeatDue,
  presencePublishMinimumInterval,
} from '@/features/presence/presenceHeartbeat';

describe('presence heartbeat', () => {
  it('restores presence after a service worker restart', () => {
    expect(isPresenceHeartbeatDue(0, presencePublishMinimumInterval)).toBe(true);
  });

  it('waits until the minimum publish interval', () => {
    const lastPublishedAt = 10_000;

    expect(
      isPresenceHeartbeatDue(lastPublishedAt, lastPublishedAt + presencePublishMinimumInterval - 1),
    ).toBe(false);
    expect(
      isPresenceHeartbeatDue(lastPublishedAt, lastPublishedAt + presencePublishMinimumInterval),
    ).toBe(true);
  });
});
