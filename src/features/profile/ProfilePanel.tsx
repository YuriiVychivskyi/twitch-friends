import { useEffect, useState } from 'react';

import { getMyTwitchProfile } from '@/features/profile/myTwitchProfile';
import { type TwitchUserProfile } from '@/features/friends/twitchUserLookup';
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

  return (
    <section className="profile-panel" aria-labelledby="profile-title">
      <div className="profile-panel__heading">
        <h2 className="profile-panel__title" id="profile-title">
          My Twitch profile
        </h2>
        {profile ? <img className="profile-panel__avatar" alt="" src={profile.avatarUrl} /> : null}
      </div>

      <button
        className="profile-panel__connect"
        disabled={!ready}
        type="button"
        onClick={() => void connectProfile()}
      >
        {profile ? 'Reconnect Twitch' : 'Connect Twitch'}
      </button>

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
