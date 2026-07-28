import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { deleteMyData, disconnectTwitch } from '@/features/profile/accountData';
import { getMyTwitchProfile, TWITCH_PROFILE_CONNECTED } from '@/features/profile/myTwitchProfile';
import { authorizeWithTwitch } from '@/features/profile/twitchAuthorization';

export function ProfilePanel() {
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<TwitchUserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void getMyTwitchProfile()
      .then((storedProfile) => {
        if (active) {
          setProfile(storedProfile);

          if (storedProfile) {
            void browser.runtime.sendMessage({
              type: TWITCH_PROFILE_CONNECTED,
            });
          }
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not load profile.');
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

  const connectProfile = async () => {
    setError('');
    setReady(false);

    try {
      await authorizeWithTwitch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save profile.');
    } finally {
      setReady(true);
    }
  };

  const disconnectProfile = async () => {
    if (!window.confirm('Disconnect Twitch and remove your friends and shared presence?')) {
      return;
    }

    setError('');
    setReady(false);

    try {
      await disconnectTwitch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect Twitch.');
      setReady(true);
    }
  };

  const deleteAccountData = async () => {
    if (
      !window.confirm(
        'Delete all Twitch Friends data from this device and backend? This cannot be undone.',
      )
    ) {
      return;
    }

    setError('');
    setReady(false);

    try {
      await deleteMyData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete your data.');
      setReady(true);
    }
  };

  return (
    <section className="profile-panel" aria-labelledby="profile-title">
      <div className="profile-panel__heading">
        <h2 className="profile-panel__title" id="profile-title">
          My Twitch profile
        </h2>
        {profile ? <img className="profile-panel__avatar" alt="" src={profile.avatarUrl} /> : null}
      </div>

      <div className="profile-panel__actions">
        <button
          className="profile-panel__button profile-panel__button--primary"
          disabled={!ready}
          type="button"
          onClick={() => void connectProfile()}
        >
          {profile ? 'Reconnect Twitch' : 'Connect Twitch'}
        </button>

        {profile ? (
          <button
            className="profile-panel__button"
            disabled={!ready}
            type="button"
            onClick={() => void disconnectProfile()}
          >
            Disconnect Twitch
          </button>
        ) : null}

        <button
          className="profile-panel__delete"
          disabled={!ready}
          type="button"
          onClick={() => void deleteAccountData()}
        >
          Delete my data
        </button>
      </div>

      {profile ? (
        <p className="profile-panel__status">Registered as {profile.displayName}</p>
      ) : null}

      {error ? (
        <p className="popup__error" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
