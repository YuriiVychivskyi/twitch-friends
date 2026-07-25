import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  getLocalFriends,
  LOCAL_FRIENDS_KEY,
  parseLocalFriends,
  type LocalFriend,
} from '@/features/friends/localFriends';

export function Sidebar() {
  const [friends, setFriends] = useState<LocalFriend[]>([]);

  useEffect(() => {
    let active = true;

    void getLocalFriends()
      .then((storedFriends) => {
        if (active) {
          setFriends(storedFriends);
        }
      })
      .catch(() => undefined);

    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[LOCAL_FRIENDS_KEY]) {
        setFriends(parseLocalFriends(changes[LOCAL_FRIENDS_KEY].newValue));
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      active = false;

      try {
        browser.storage.onChanged.removeListener(handleStorageChange);
      } catch {
        return;
      }
    };
  }, []);

  return (
    <section className="friends-section" role="group" aria-label="Friends">
      <h3 className="friends-section__heading">Friends</h3>
      {friends.length > 0 ? (
        <ul className="friends-list">
          {friends.map((friend) => (
            <li className="friend" key={friend.login}>
              {friend.avatarUrl ? (
                <img className="friend__avatar" alt="" src={friend.avatarUrl} />
              ) : (
                <span className="friend__avatar" aria-hidden="true">
                  {friend.login.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="friend__details">
                <span className="friend__login">{friend.displayName}</span>
                <span className="friend__status">Unavailable</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="friends-section__empty">No friends added</p>
      )}
    </section>
  );
}
