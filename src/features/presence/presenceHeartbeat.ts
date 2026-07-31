export const presencePublishMinimumInterval = 25_000;

export function isPresenceHeartbeatDue(lastPublishedAt: number, now = Date.now()) {
  return now - lastPublishedAt >= presencePublishMinimumInterval;
}
