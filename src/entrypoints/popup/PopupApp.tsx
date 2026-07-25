import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  isRuntimeStatus,
  RUNTIME_STATUS_REQUEST,
  type RuntimeHealth,
  type RuntimeStatus,
} from '@/runtime/runtimeStatus';

type StatusItem = {
  health: RuntimeHealth;
  label: string;
  readyText: string;
};

function healthText(item: StatusItem) {
  if (item.health === 'ready') {
    return item.readyText;
  }

  if (item.health === 'unavailable') {
    return 'Unavailable';
  }

  return 'Checking';
}

export function PopupApp() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const response: unknown = await browser.runtime.sendMessage({
          type: RUNTIME_STATUS_REQUEST,
        });

        if (active && isRuntimeStatus(response)) {
          setStatus(response);
        }
      } catch {
        if (active) {
          setStatus({
            environment: 'unknown',
            firebaseAuth: 'unavailable',
            localIdentity: 'unavailable',
            privateKeys: 'unavailable',
          });
        }
      }
    };

    void loadStatus();

    const interval = window.setInterval(() => {
      void loadStatus();
    }, 1_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const items: StatusItem[] = [
    {
      health: status?.localIdentity ?? 'pending',
      label: 'Local identity',
      readyText: 'Ready',
    },
    {
      health: status?.privateKeys ?? 'pending',
      label: 'Private keys',
      readyText: 'Protected',
    },
    {
      health: status?.firebaseAuth ?? 'pending',
      label: 'Firebase Auth',
      readyText: 'Connected',
    },
  ];

  return (
    <main className="popup">
      <header className="popup__header">
        <p className="popup__eyebrow">Security status</p>
        <h1 className="popup__title">Twitch Friends</h1>
      </header>

      <section className="status-list" aria-label="Security status">
        {items.map((item) => (
          <div className="status-row" key={item.label}>
            <span className="status-row__label">{item.label}</span>
            <span className="status-row__value" data-health={item.health}>
              <span className="status-row__indicator" aria-hidden="true" />
              {healthText(item)}
            </span>
          </div>
        ))}

        <div className="status-row">
          <span className="status-row__label">Environment</span>
          <span className="status-row__environment">
            {status?.environment === 'emulator'
              ? 'Local emulator'
              : status?.environment === 'production'
                ? 'Production'
                : 'Unknown'}
          </span>
        </div>
      </section>

      <p className="popup__privacy">Viewing history is not collected or stored.</p>
    </main>
  );
}
