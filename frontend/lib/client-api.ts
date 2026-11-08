/**
 * Browser-side moderator actions: approve/reject alerts, resolve questions, invites, panel decisions.
 *
 * Calls the same backend the page was loaded from (`source` from the server): the real API
 * (CORS allows http://localhost:3000), or the offline demo backend at /api/demo when the page
 * fell back to demo data. If the API drops mid-session we do NOT switch to demo data: the call
 * fails with a NetworkError and the screen keeps the input and offers a retry.
 * No mock data is imported here, so nothing private is bundled for the browser.
 */
import { toDecisionResult, toResolveResult, toThemes } from './adapters';
import { ApiError, NetworkError } from './api-error';
import type {
  ApiDecisionIn,
  ApiDecisionOut,
  ApiPanelInviteIn,
  ApiPanelInviteOut,
  ApiResolveOut,
  ApiRiskDecisionIn,
  ApiSummariseOut,
  DataSource,
  DecisionResult,
  ResolveResult,
  Themes,
} from './types';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export const baseFor = (source: DataSource): string => (source === 'api' ? API_URL : '/api/demo');

/** Moderator actions never call the API directly: /api/mod adds the server-only moderator key. */
const moderatorBaseFor = (source: DataSource): string => (source === 'api' ? '/api/mod' : '/api/demo');

async function request<T>(
  source: DataSource,
  method: 'GET' | 'POST' | 'PATCH',
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

/** Ask the backend for an AI summary of the reasons (moderator only). Empty themes = the ML code isn't connected. */
export async function summariseQuestion(source: DataSource, questionId: string): Promise<{ reasonCount: number; themes: Themes }> {
  const r = await request<ApiSummariseOut>(source, 'POST', `/moderator/questions/${enc(questionId)}/summarise`, undefined, moderatorBaseFor(source));
  return { reasonCount: r.reason_count, themes: toThemes(r.themes) };
}

export interface InviteResult {
  joinLink: string;
  emailSent: boolean;
  emailError: string | null;
}
const toInviteResult = (r: ApiPanelInviteOut): InviteResult => ({
  joinLink: r.join_link,
  emailSent: r.email_sent ?? false,
  emailError: r.email_error ?? null,
});

/** Moderator: invite someone to the panel. The backend emails the activation link when SMTP is set up. */
export async function createPanelInvite(source: DataSource, body: ApiPanelInviteIn): Promise<InviteResult> {
  return toInviteResult(await request<ApiPanelInviteOut>(source, 'POST', '/moderator/panel-invites', body, moderatorBaseFor(source)));
}

/** Moderator: approve or decline a panel request, or remove a member. */
export async function decidePanelMembership(
  source: DataSource,
  membershipId: number,
  action: 'approve' | 'decline' | 'remove',
): Promise<{ status: string; invitedToOpenQuestions: number }> {
  const r = await request<{ status: string; invited_to_open_questions: number }>(
    source,
    'POST',
    `/moderator/panel-memberships/${membershipId}/decision`,
    { action },
    moderatorBaseFor(source),
  );
  return { status: r.status, invitedToOpenQuestions: r.invited_to_open_questions };
}

/** Moderator: email an open invite again. */
export async function resendPanelInvite(source: DataSource, token: string): Promise<InviteResult> {
  return toInviteResult(
    await request<ApiPanelInviteOut>(source, 'POST', `/moderator/panel-invites/${enc(token)}/resend`, undefined, moderatorBaseFor(source)),
  );
}

/** Moderator: submit a risk decision (keep, raise, lower, update_trigger, add_trigger). */
export async function submitRiskDecision(source: DataSource, riskId: string, decision: ApiRiskDecisionIn): Promise<{ status: 'recorded' }> {
  return request<{ status: 'recorded' }>(source, 'POST', `/risks/${enc(riskId)}/decide`, decision, moderatorBaseFor(source));
}
