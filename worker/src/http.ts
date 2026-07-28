import { ApiError, isApiError } from './errors';
import type { Env } from './types';

type OriginEnvironment = Pick<Env, 'ALLOWED_EXTENSION_ORIGINS'>;

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    headers: {
      ...jsonHeaders,
      ...headers,
    },
    status,
  });
}

export function errorResponse(cause: unknown) {
  const error = isApiError(cause)
    ? cause
    : new ApiError(500, 'internal', 'Backend request failed.');

  return json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  );
}

export function getAllowedOrigins(env: OriginEnvironment) {
  return new Set(
    env.ALLOWED_EXTENSION_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function getAllowedRequestOrigin(request: Request, env: OriginEnvironment) {
  const allowedOrigins = getAllowedOrigins(env);
  const origin = request.headers.get('Origin')?.trim() ?? '';

  if (origin && origin !== 'null') {
    return allowedOrigins.has(origin) ? origin : null;
  }

  const extensionOrigin = request.headers.get('X-Twitch-Friends-Origin')?.trim() ?? '';

  return allowedOrigins.has(extensionOrigin) ? extensionOrigin : null;
}

export function requireAllowedOrigin(request: Request, env: OriginEnvironment) {
  const origin = getAllowedRequestOrigin(request, env);

  if (!origin) {
    throw new ApiError(403, 'permission-denied', 'Extension origin is not allowed.');
  }

  return origin;
}

export function withCors(response: Response, origin: string) {
  const headers = new Headers(response.headers);

  headers.set('Access-Control-Allow-Credentials', 'false');
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Twitch-Friends-Origin',
  );
  headers.set('Access-Control-Allow-Methods', 'DELETE, GET, OPTIONS, POST, PUT');
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Vary', 'Origin');

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function readJson(request: Request) {
  const maximumBytes = 4_096;
  const contentLengthHeader = request.headers.get('Content-Length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);

  if (
    contentLength !== null &&
    (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maximumBytes)
  ) {
    throw new ApiError(413, 'payload-too-large', 'Request body is too large.');
  }

  if (!request.body) {
    throw new ApiError(400, 'invalid-argument', 'Request body must be valid JSON.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const result = (await reader.read()) as ReadableStreamReadResult<Uint8Array>;

      if (result.done) {
        break;
      }

      const value = result.value;

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new ApiError(413, 'payload-too-large', 'Request body is too large.');
      }

      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch (cause) {
    if (cause instanceof ApiError) {
      throw cause;
    }

    throw new ApiError(400, 'invalid-argument', 'Request body must be valid JSON.');
  }
}
