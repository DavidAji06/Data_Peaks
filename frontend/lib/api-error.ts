/**
 * Errors from the backend (or the offline demo mock), with the HTTP status kept.
 * Safe for server and client code. Screens map `kind` to a message in lib/strings.ts:
 *   404 not_found  → "This link isn't valid"        400 closed     → "This question is closed"
 *   403 locked     → locked state, not an error     409 conflict   → "Already submitted" (then refetch)
 *   422 validation → show the validation message    network        → keep the input, offer a retry
 */
export type ApiErrorKind = 'not_found' | 'closed' | 'locked' | 'conflict' | 'validation' | 'server' | 'network';

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'closed',
  403: 'locked',
  404: 'not_found',
  409: 'conflict',
  422: 'validation',
};

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly detail: string;

  constructor(status: number, detail: string, kind?: ApiErrorKind) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind ?? KIND_BY_STATUS[status] ?? 'server';
    this.detail = detail;
  }

  /** FastAPI sends { detail: string } or, for validation errors, { detail: [{ msg, loc }, …] }. */
  static fromBody(status: number, body: unknown): ApiError {
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string') return new ApiError(status, detail);
    if (Array.isArray(detail)) {
      const messages = detail.map((d) => String((d as { msg?: unknown }).msg ?? '').replace(/^Value error, /, ''));
      return new ApiError(status, messages.filter(Boolean).join(' ') || 'Invalid input');
    }
    return new ApiError(status, `Request failed (${status})`);
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // not JSON
    }
    return ApiError.fromBody(res.status, body);
  }
}

/** The API could not be reached at all (server down, offline, timeout). */
export class NetworkError extends ApiError {
  constructor(detail = 'Could not reach the server') {
    super(0, detail, 'network');
    this.name = 'NetworkError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
