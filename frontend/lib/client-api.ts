/**
 * Browser-side actions: submit, group view, revise, approve/reject alerts, resolve questions.
 *
 * Calls the same backend the page was loaded from (`source` from the server): the real API
 * (CORS allows http://localhost:3000), or the offline demo backend at /api/demo when the page
 * fell back to demo data. If the API drops mid-session we do NOT switch to demo data: the call
 * fails with a NetworkError and the screen keeps the input and offers a retry.
 * No mock data is imported here, so nothing private is bundled for the browser.
 */
import { toDecisionResult, toGroupView, toResolveResult } from './adapters';
import { ApiError, NetworkError } from './api-error';
import type {
  ApiAnswerIn,
  ApiDecisionIn,
  ApiDecisionOut,
  ApiExpertQuestion,
  ApiGroupView,
  ApiResolveOut,
  DataSource,
  DecisionResult,
  GroupView,
  ResolveResult,
} from './types';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export const baseFor = (source: DataSource): string => (source === 'api' ? API_URL : '/api/demo');

/** Moderator actions never call the API directly: /api/mod adds the server-only moderator key. */
const moderatorBaseFor = (source: DataSource): string => (source === 'api' ? '/api/mod' : '/api/demo');

async function request<T>(
  source: DataSource,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  base: string = baseFor(source),
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      cache: 'no-store',
      ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 502 && base === '/api/mod') throw new NetworkError(); // /api/mod couldn't reach the API
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

/** First answer. probability 0–1, reason 1–280 characters. 409 = already answered. */
export const submitAnswer = (source: DataSource, token: string, answer: ApiAnswerIn) =>
  request<{ status: 'received' }>(source, 'POST', `/q/${enc(token)}/responses`, answer);

/** Revision. 403 = no first answer yet, 409 = already revised. */
export const submitRevision = (source: DataSource, token: string, answer: ApiAnswerIn) =>
  request<{ status: 'revised' }>(source, 'POST', `/q/${enc(token)}/revision`, answer);

/** Group view, fetched only after a successful submit. 403 → 'locked' (a state, not an error). */
export async function fetchGroupView(source: DataSource, token: string): Promise<GroupView | 'locked'> {
  try {
    return toGroupView(await request<ApiGroupView>(source, 'GET', `/q/${enc(token)}/group`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return 'locked';
    throw e;
  }
}

/** Re-reads the server flags after a 409, to land on the right step. */
export async function fetchProgress(source: DataSource, token: string): Promise<{ answered: boolean; revised: boolean }> {
  const q = await request<ApiExpertQuestion>(source, 'GET', `/q/${enc(token)}`);
  return { answered: q.answered, revised: q.revised };
}

/** Approve (all question fields, future deadline) or reject. 409 = already decided, 422 = invalid. */
export async function decideAlert(source: DataSource, alertId: string, decision: ApiDecisionIn): Promise<DecisionResult> {
  return toDecisionResult(await request<ApiDecisionOut>(source, 'POST', `/alerts/${enc(alertId)}/decision`, decision, moderatorBaseFor(source)));
}

/** 409 = already resolved. */
export async function resolveQuestion(source: DataSource, questionId: string, outcome: 0 | 1): Promise<ResolveResult> {
  return toResolveResult(
    await request<ApiResolveOut>(source, 'POST', `/moderator/questions/${enc(questionId)}/resolve`, { outcome }, moderatorBaseFor(source)),
  );
}
