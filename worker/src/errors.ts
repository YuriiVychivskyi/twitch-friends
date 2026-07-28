export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
