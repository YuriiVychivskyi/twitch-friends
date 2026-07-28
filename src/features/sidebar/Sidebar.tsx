import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  getLocalFriends,
  LOCAL_FRIENDS_KEY,
  parseLocalFriends,
  type LocalFriend,
} from '@/features/friends/localFriends';
import {
  FRIEND_PRESENCE_KEY,
  getFriendPresence,
  parseFriendPresence,
  type FriendPresence,
} from '@/features/presence/friendPresence';

export function Sidebar() {
  const [friends, setFriends] = useState<LocalFriend[]>([]);
  const [presence, setPresence] = useState<FriendPresence[]>([]);

  useEffect(() => {
    let active = true;

    void getLocalFriends()
      .then((storedFriends) => {
        if (active) {
          setFriends(storedFriends);
        }
      })
      .catch(() => undefined);
    void getFriendPresence()
      .then((storedPresence) => {
        if (active) {
          setPresence(storedPresence);
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

      if (areaName === 'local' && changes[FRIEND_PRESENCE_KEY]) {
        setPresence(parseFriendPresence(changes[FRIEND_PRESENCE_KEY].newValue));
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    const interval = window.setInterval(() => {
      setPresence((currentPresence) =>
        currentPresence.filter((item) => item.expiresAt > Date.now()),
      );
    }, 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);

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
          {friends.map((friend) => {
            const friendPresence = presence.find((item) => item.login === friend.login);

            return (
              <li
                className={`friend${friendPresence ? '' : ' friend--offline'}`}
                key={friend.login}
              >
                {friend.avatarUrl ? (
                  <img className="friend__avatar" alt="" src={friend.avatarUrl} />
                ) : (
                  <span className="friend__avatar" aria-hidden="true">
                    {friend.login.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="friend__details">
                  <span className="friend__login">{friend.displayName}</span>
                  {friendPresence ? (
                    <a
                      className="friend__status"
                      href={friendPresence.channel.url}
                      rel="noreferrer"
                      target="_blank"
                      title={`Watch ${friendPresence.channel.login}`}
                    >
                      {friendPresence.channel.login}
                    </a>
                  ) : (
                    <span className="friend__status">Offline</span>
                  )}
                </span>
                {friendPresence ? (
                  <span className="friend__online-dot" aria-label="Online" title="Online" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="friends-section__empty">No friends added</p>
      )}
    </section>
  );
}
