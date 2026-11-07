/**
 * Server-side data layer: the ONLY place Server Components get data from.
 *
 * - Real mode (NEXT_PUBLIC_USE_MOCK=false): fetch(`${NEXT_PUBLIC_API_URL}…`, { cache: 'no-store' }).
 * - Demo fallback (NEXT_PUBLIC_DEMO_FALLBACK=true): if the API can't be reached, the WHOLE loader runs again on
 *   the offline demo backend (lib/server/mock-backend.ts), so one screen never mixes real and demo data.
 *   Results carry `source: 'demo'` and screens show a "Demo data (offline)" badge.
 * - Placeholders: while the API returns contract samples for similar risks (R0000) and the ranking (one item),
 *   curated real ACAPS data from mock/curated.json is shown instead, flagged so screens label it as demo data.
 *
 * Client components use lib/client-api.ts for actions (submit, group view, revise, approve, resolve).
 * Expert tokens are credentials: pass them to fetch only; never render or log them.
 */
import 'server-only';

import curatedFile from '@/mock/curated.json';
import {
  isPlaceholderRanked,
  isPlaceholderSimilar,
  toAlert,
  toExpertQuestion,
  toExpertSettings,
  toPublicOutcome,
  toLeaderboard,
  toQuestionDetail,
  toQuestionListItem,
  toRankedRisk,
  toRiskDetail,
  toTrackRecord,
} from './adapters';
import { ApiError, NetworkError } from './api-error';
import { mockRequest } from './server/mock-backend';
import type {
  Alert,
  AlertStatus,
  ApiAlert,
  ApiExpertQuestion,
  ApiExpertSettings,
  ApiJoinInfo,
  ApiPublicQuestion,
  ApiLeaderboard,
  ApiQuestionDetail,
  ApiQuestionListItem,
  ApiRankedRisk,
  ApiRisk,
  ApiSimilarRisk,
  ApiTrackRecord,
  ExpertQuestion,
  ExpertSettings,
  Leaderboard,
  Loaded,
  PublicOutcome,
  QuestionDetail,
  QuestionListItem,
  RankedRisks,
  RiskDetail,
  TrackRecord,
} from './types';

export { ApiError, NetworkError };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
/** Mock unless explicitly 'false' (and an API URL is set): the default stays demo-safe. */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false' || API_URL === '';
export const DEMO_FALLBACK = process.env.NEXT_PUBLIC_DEMO_FALLBACK === 'true';
const TIMEOUT_MS = 5000;

const curated = curatedFile as unknown as {
  similar_risks: Record<string, ApiSimilarRisk[]>;
  ranked_risks: ApiRankedRisk[];
};

type Call = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

/** Server-only. Sent ONLY on moderator requests, never on expert or public ones. */
const MODERATOR_KEY = process.env.MODERATOR_KEY ?? '';

export type Audience = 'expert' | 'moderator';

const realCallFor = (audience: Audience): Call => async <T>(method: 'GET' | 'POST', path: string, body?: unknown) => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (audience === 'moderator' && MODERATOR_KEY) headers['x-moderator-key'] = MODERATOR_KEY;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      cache: 'no-store', // expert- and moderator-specific data: never cache
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as T;
};

const mockCall: Call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = mockRequest(method, path, body);
  if (res.status >= 400) throw ApiError.fromBody(res.status, res.body);
  return res.body as T;
};

/** Runs one screen's loader on the real API, or wholly on the demo backend (never a mix). */
async function load<T>(loader: (call: Call) => Promise<T>, audience: Audience = 'expert'): Promise<Loaded<T>> {
  if (USE_MOCK) return { data: await loader(mockCall), source: 'demo' };
  try {
    return { data: await loader(realCallFor(audience)), source: 'api' };
  } catch (e) {
    if (e instanceof NetworkError && DEMO_FALLBACK) return { data: await loader(mockCall), source: 'demo' };
    throw e;
  }
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Expert (secret link)
// ---------------------------------------------------------------------------

export function getExpertQuestion(token: string): Promise<Loaded<ExpertQuestion>> {
  return load(async (call) => {
    const raw = await call<ApiExpertQuestion>('GET', `/q/${enc(token)}`);
    const similar = isPlaceholderSimilar(raw.similar_risks)
      ? { items: curated.similar_risks[raw.risk.id] ?? [], areDemo: true }
      : { items: raw.similar_risks, areDemo: false };
    // Only the anonymity level is used from the settings; the pseudonym and topics stay on the server.
    let level: ExpertQuestion['anonymityLevel'] = null;
    try {
      level = (await call<ApiExpertSettings>('GET', `/q/${enc(token)}/settings`)).anonymity_level;
    } catch (e) {
      // 404/405: a backend without the settings endpoint yet. Show the generic "who sees" line.
      if (!(e instanceof ApiError && (e.status === 404 || e.status === 405))) throw e;
    }
    return toExpertQuestion(raw, similar, level);
  });
}

export function getTrackRecord(token: string): Promise<Loaded<TrackRecord>> {
  return load(async (call) => toTrackRecord(await call<ApiTrackRecord>('GET', `/q/${enc(token)}/track-record`)));
}

export interface SettingsPage {
  /** null = this backend has no settings endpoint yet */
  settings: ExpertSettings | null;
  questionId: string;
}

/** Privacy settings, reached through the expert's question link. 404 on the link itself = invalid link. */
export function getSettingsPage(token: string): Promise<Loaded<SettingsPage>> {
  return load(async (call) => {
    const q = await call<ApiExpertQuestion>('GET', `/q/${enc(token)}`);
    let settings: ExpertSettings | null = null;
    try {
      settings = toExpertSettings(await call<ApiExpertSettings>('GET', `/q/${enc(token)}/settings`));
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 404 || e.status === 405))) throw e;
    }
    return { settings, questionId: q.question.id };
  });
}

/** Which backend a page with no data of its own should send actions to (GET /health). */
export function getSource(): Promise<Loaded<null>> {
  return load(async (call) => {
    await call<{ status: string }>('GET', '/health');
    return null;
  });
}

// ---------------------------------------------------------------------------
// Joining the panel (sign-up link from a moderator invite; no key). 404 unknown, 409 already used.
// ---------------------------------------------------------------------------

export function getJoinInfo(token: string): Promise<Loaded<{ country: string }>> {
  return load(async (call) => ({ country: (await call<ApiJoinInfo>('GET', `/join/${enc(token)}`)).country }));
}

// ---------------------------------------------------------------------------
// Moderator (no auth in the backend yet: see HANDOFF.md)
// ---------------------------------------------------------------------------

export function getAlerts(status: AlertStatus): Promise<Loaded<Alert[]>> {
  return load(async (call) => (await call<ApiAlert[]>('GET', `/alerts?status=${status}`)).map(toAlert), 'moderator');
}

export interface AlertDetail {
  alert: Alert;
  risk: RiskDetail | null;
}

/** There is no GET /alerts/{id}: look through each status list. */
export function getAlertDetail(id: string): Promise<Loaded<AlertDetail | null>> {
  return load(async (call) => {
    for (const status of ['pending', 'approved', 'rejected'] as const) {
      const hit = (await call<ApiAlert[]>('GET', `/alerts?status=${status}`)).find((a) => a.id === id);
      if (!hit) continue;
      let risk: RiskDetail | null = null;
      try {
        risk = toRiskDetail(await call<ApiRisk>('GET', `/risks/${enc(hit.risk_id)}`));
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      return { alert: toAlert(hit), risk };
    }
    return null;
  }, 'moderator');
}

export function getModeratorQuestions(): Promise<Loaded<QuestionListItem[]>> {
  return load(async (call) => (await call<ApiQuestionListItem[]>('GET', '/moderator/questions')).map(toQuestionListItem), 'moderator');
}

export function getQuestionDetail(id: string): Promise<Loaded<QuestionDetail>> {
  return load(async (call) => toQuestionDetail(await call<ApiQuestionDetail>('GET', `/moderator/questions/${enc(id)}`)), 'moderator');
}

export function getLeaderboard(): Promise<Loaded<Leaderboard>> {
  return load(async (call) => toLeaderboard(await call<ApiLeaderboard>('GET', '/moderator/leaderboard')), 'moderator');
}

export function getRisk(id: string): Promise<Loaded<RiskDetail>> {
  return load(async (call) => toRiskDetail(await call<ApiRisk>('GET', `/risks/${enc(id)}`)), 'moderator');
}

export interface RiskOverview {
  risk: RiskDetail;
  questions: QuestionListItem[];
}

/** One risk plus the expert questions asked about it, from the same source. */
export function getRiskOverview(id: string): Promise<Loaded<RiskOverview>> {
  return load(async (call) => {
    const risk = toRiskDetail(await call<ApiRisk>('GET', `/risks/${enc(id)}`));
    const questions = (await call<ApiQuestionListItem[]>('GET', '/moderator/questions'))
      .map(toQuestionListItem)
      .filter((q) => q.riskId === risk.id);
    return { risk, questions };
  }, 'moderator');
}

export function getRankedRisks(): Promise<Loaded<RankedRisks>> {
  return load(async (call) => {
    const raw = await call<ApiRankedRisk[]>('GET', '/risks/ranked');
    return isPlaceholderRanked(raw)
      ? { items: curated.ranked_risks.map(toRankedRisk), areDemo: true }
      : { items: raw.map(toRankedRisk), areDemo: false };
  }, 'moderator');
}

// ---------------------------------------------------------------------------
// Public: GET /public/questions (no moderator key). Resolved questions only, aggregates only.
// ---------------------------------------------------------------------------

export function getPublicOutcomes(): Promise<Loaded<PublicOutcome[]>> {
  return load(async (call) => (await call<ApiPublicQuestion[]>('GET', '/public/questions')).map(toPublicOutcome));
}

/** null = not published (unknown, or not resolved yet). */
export function getPublicOutcome(questionId: string): Promise<Loaded<PublicOutcome | null>> {
  return load(async (call) => {
    const all = (await call<ApiPublicQuestion[]>('GET', '/public/questions')).map(toPublicOutcome);
    return all.find((q) => q.questionId === questionId) ?? null;
  });
}
