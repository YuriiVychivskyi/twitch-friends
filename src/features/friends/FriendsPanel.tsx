import { useEffect, useState, type FormEvent } from 'react';

import {
  addLocalFriend,
  getLocalFriends,
  removeLocalFriend,
  type LocalFriend,
} from '@/features/friends/localFriends';

export function FriendsPanel() {
  const [error, setError] = useState('');
  const [friends, setFriends] = useState<LocalFriend[]>([]);
  const [login, setLogin] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void getLocalFriends()
      .then((storedFriends) => {
        if (active) {
          setFriends(storedFriends);
        }
      })
      .catch(() => {
        if (active) {
          setError('Could not load friends.');
        }
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const addFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      await addLocalFriend(login);
      setFriends(await getLocalFriends());
      setLogin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add friend.');
    }
  };

  const removeFriend = async (friendLogin: string) => {
    setError('');

    try {
      await removeLocalFriend(friendLogin);
      setFriends((currentFriends) =>
        currentFriends.filter((friend) => friend.login !== friendLogin),
      );
    } catch {
      setError('Could not remove friend.');
    }
  };

  return (
    <section className="friends-panel" aria-labelledby="friends-title">
      <h2 className="friends-panel__title" id="friends-title">
        Friends
      </h2>

      <form className="friend-form" onSubmit={(event) => void addFriend(event)}>
        <input
          className="friend-form__input"
          aria-label="Twitch login"
          maxLength={25}
          placeholder="Twitch login"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
        />
        <button className="friend-form__button" disabled={!ready || !login.trim()} type="submit">
          Add
        </button>
      </form>

      {error ? (
        <p className="popup__error" role="status">
          {error}
        </p>
      ) : null}

      {friends.length > 0 ? (
        <ul className="friend-list status-list">
          {friends.map((friend) => (
            <li className="status-row" key={friend.login}>
              <div>
                <span className="friend-list__login">{friend.login}</span>
                <span className="friend-list__status">Unavailable</span>
              </div>
              <button
                className="friend-list__remove"
                aria-label={`Remove ${friend.login}`}
                type="button"
                onClick={() => void removeFriend(friend.login)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="friends-panel__empty">No friends added</p>
      )}
    </section>
  );
}
