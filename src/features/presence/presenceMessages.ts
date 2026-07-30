export const PRESENCE_FRIENDS_REFRESH = 'presence-friends:refresh';

export function isPresenceFriendsRefreshMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return Object.keys(message).length === 1 && message.type === PRESENCE_FRIENDS_REFRESH;
}
