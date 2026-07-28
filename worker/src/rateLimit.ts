import { ApiError } from './errors';

const dailyLimit = 5_000;
const hourMilliseconds = 60 * 60 * 1_000;

async function consumeLimit(database: D1Database, key: string, limit: number, resetsAt: number) {
  const now = Date.now();
  const result = await database
    .prepare(
      `INSERT INTO rate_limits (key, count, resets_at)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN resets_at <= ? THEN 1 ELSE count + 1 END,
         resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
       WHERE resets_at <= ? OR count < ?
       RETURNING count`,
    )
    .bind(key, resetsAt, now, now, now, limit)
    .first<{ count: number }>();

  if (!result) {
    throw new ApiError(429, 'resource-exhausted', 'Request limit reached.');
  }
}

async function consumeDailyLimit(database: D1Database) {
  const day = new Date().toISOString().slice(0, 10);
  const result = await database
    .prepare(
      `INSERT INTO daily_usage (day, count, disabled)
       VALUES (?, 1, 0)
       ON CONFLICT(day) DO UPDATE SET count = count + 1
       WHERE disabled = 0 AND count < ?
       RETURNING count`,
    )
    .bind(day, dailyLimit)
    .first<{ count: number }>();

  if (!result) {
    throw new ApiError(429, 'resource-exhausted', 'Daily service limit reached.');
  }
}

export async function enforceRequestLimits(
  database: D1Database,
  operation: string,
  uid: string,
  ip: string,
  userLimit: number,
  ipLimit: number,
) {
  const resetsAt = Date.now() + hourMilliseconds;

  await consumeLimit(database, `${operation}:uid:${uid}`, userLimit, resetsAt);
  await consumeLimit(database, `${operation}:ip:${ip}`, ipLimit, resetsAt);
  await consumeDailyLimit(database);
}

export async function enforcePublicCallbackLimit(database: D1Database, ip: string) {
  await consumeLimit(database, `oauth-callback:ip:${ip}`, 60, Date.now() + hourMilliseconds);
}
