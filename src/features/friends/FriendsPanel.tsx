import { useEffect, useState, type FormEvent } from 'react';

import {
  createFriendRequest,
  getFriendState,
  removeFriendConnection,
  respondToFriendRequest,
  type FriendConnection,
  type FriendState,
} from '@/features/friends/friendConnections';
import { replaceLocalFriends } from '@/features/friends/localFriends';

const emptyState: FriendState = {
  friends: [],
  incoming: [],
  outgoing: [],
};

export function FriendsPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [friendState, setFriendState] = useState(emptyState);
  const [login, setLogin] = useState('');
  const [ready, setReady] = useState(false);

  const loadFriends = async () => {
    const nextState = await getFriendState();

    await replaceLocalFriends(nextState.friends.map((friend) => friend.profile));
    setFriendState(nextState);
  };

  useEffect(() => {
    let active = true;

    void getFriendState()
      .then(async (nextState) => {
        await replaceLocalFriends(nextState.friends.map((friend) => friend.profile));

        if (active) {
          setFriendState(nextState);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not load friends.');
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

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');

    try {
      await action();
      await loadFriends();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Friend action failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await runAction(async () => {
      await createFriendRequest(login);
      setLogin('');
    });
  };

  const respond = async (friend: FriendConnection, accept: boolean) => {
    await runAction(() => respondToFriendRequest(friend.id, accept));
  };

  const remove = async (friend: FriendConnection) => {
    await runAction(() => removeFriendConnection(friend.id));
  };

  return (
    <section className="friends-panel" aria-labelledby="friends-title">
      <div className="friends-panel__heading">
        <h2 className="friends-panel__title" id="friends-title">
          Friends
        </h2>
        <button
          className="friend-list__remove"
          disabled={!ready || busy}
          type="button"
          onClick={() => void runAction(() => Promise.resolve())}
        >
          Refresh
        </button>
      </div>

      <form className="friend-form" onSubmit={(event) => void sendRequest(event)}>
        <input
          className="friend-form__input"
          aria-label="Twitch login"
          maxLength={25}
          placeholder="Twitch login"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
        />
        <button
          className="friend-form__button"
          disabled={!ready || busy || !login.trim()}
          type="submit"
        >
          Send
        </button>
      </form>

      {error ? (
        <p className="popup__error" role="status">
          {error}
        </p>
      ) : null}

      {friendState.incoming.length > 0 ? (
        <div className="friend-group">
          <h3 className="friend-group__title">Requests</h3>
          <ul className="friend-list status-list">
            {friendState.incoming.map((friend) => (
              <li className="status-row" key={friend.id}>
                <span className="friend-list__login">{friend.profile.displayName}</span>
                <span className="friend-list__actions">
                  <button
                    className="friend-list__accept"
                    disabled={busy}
                    type="button"
                    onClick={() => void respond(friend, true)}
                  >
                    Accept
                  </button>
                  <button
                    className="friend-list__remove"
                    disabled={busy}
                    type="button"
                    onClick={() => void respond(friend, false)}
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {friendState.friends.length > 0 ? (
        <ul className="friend-list status-list">
          {friendState.friends.map((friend) => (
            <li className="status-row" key={friend.id}>
              <div>
                <span className="friend-list__login">{friend.profile.displayName}</span>
                <span className="friend-list__status">Friend</span>
              </div>
              <button
                className="friend-list__remove"
                disabled={busy}
                type="button"
                onClick={() => void remove(friend)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {friendState.outgoing.length > 0 ? (
        <div className="friend-group">
          <h3 className="friend-group__title">Sent requests</h3>
          <ul className="friend-list status-list">
            {friendState.outgoing.map((friend) => (
              <li className="status-row" key={friend.id}>
                <div>
                  <span className="friend-list__login">{friend.profile.displayName}</span>
                  <span className="friend-list__status">Pending</span>
                </div>
                <button
                  className="friend-list__remove"
                  disabled={busy}
                  type="button"
                  onClick={() => void remove(friend)}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {friendState.friends.length === 0 &&
      friendState.incoming.length === 0 &&
      friendState.outgoing.length === 0 ? (
        <p className="friends-panel__empty">No friends added</p>
      ) : null}
    </section>
  );
}
