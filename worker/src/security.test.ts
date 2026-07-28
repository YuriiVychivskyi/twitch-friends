import { describe, expect, it } from 'vitest';

import { readJson } from './http';
import { enforcePublicCallbackLimit, enforceRequestLimits } from './rateLimit';
import { cleanupExpiredData } from './repository';

type QueryCall = {
  query: string;
  values: unknown[];
};

function createDatabase(results: Array<Record<string, unknown> | null>) {
  const calls: QueryCall[] = [];
  let resultIndex = 0;
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            first() {
              calls.push({ query, values });
              const result = results[resultIndex] ?? null;

              resultIndex += 1;
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { calls, database };
}

describe('Worker request security', () => {
  it('uses bounded rate-limit keys and applies the global budget last', async () => {
    const { calls, database } = createDatabase([{ count: 1 }, { count: 1 }, { count: 1 }]);

    await enforceRequestLimits(database, 'profile-read', 'uid-1', '203.0.113.5', 60, 120);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.values[0]).toBe('profile-read:uid:uid-1');
    expect(calls[1]?.values[0]).toBe('profile-read:ip:203.0.113.5');
    expect(calls[2]?.query).toContain('daily_usage');
  });

  it('does not consume the global budget after an installation limit is rejected', async () => {
    const { calls, database } = createDatabase([null]);

    await expect(
      enforceRequestLimits(database, 'profile-read', 'uid-1', '203.0.113.5', 60, 120),
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      status: 429,
    });
    expect(calls).toHaveLength(1);
  });

  it('limits public OAuth callbacks without consuming the service-wide budget', async () => {
    const { calls, database } = createDatabase([{ count: 1 }]);

    await enforcePublicCallbackLimit(database, '203.0.113.5');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.values[0]).toBe('oauth-callback:ip:203.0.113.5');
  });

  it('cleans only expired operational rows during scheduled maintenance', async () => {
    const statements: QueryCall[] = [];
    const database = {
      batch(items: QueryCall[]) {
        statements.push(...items);
        return Promise.resolve([]);
      },
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return { query, values };
          },
        };
      },
    } as unknown as D1Database;

    await cleanupExpiredData(database, Date.UTC(2026, 6, 28));

    expect(statements.map((statement) => statement.query)).toEqual([
      'DELETE FROM oauth_states WHERE expires_at <= ?',
      'DELETE FROM oauth_starts WHERE created_at <= ?',
      'DELETE FROM rate_limits WHERE resets_at <= ?',
      'DELETE FROM daily_usage WHERE day < ?',
    ]);
  });
  it('rejects JSON bodies larger than 4 KiB without relying on Content-Length', async () => {
    const request = new Request('https://example.test/api', {
      body: JSON.stringify('a'.repeat(4_096)),
      method: 'POST',
    });

    await expect(readJson(request)).rejects.toMatchObject({
      code: 'payload-too-large',
      status: 413,
    });
  });
});
