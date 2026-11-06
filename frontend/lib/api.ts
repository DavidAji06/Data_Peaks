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
  toLeaderboard,
  toQuestionDetail,
  toQuestionListItem,
  toRankedRisk,
  toRiskDetail,
  toTrackRecord,
} from './adapters';
import { toPublicOutcome } from './anonymity';
import { ApiError, NetworkError } from './api-error';
import { mockRequest } from './server/mock-backend';
import type {
  Alert,
  AlertStatus,
  ApiAlert,
  ApiExpertQuestion,
  ApiLeaderboard,
  ApiQuestionDetail,
  ApiQuestionListItem,
  ApiRankedRisk,
  ApiRisk,
  ApiSimilarRisk,
  ApiTrackRecord,
  ExpertQuestion,
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

const realCall: Call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown) => {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      cache: 'no-store', // expert- and moderator-specific data: never cache
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
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
async function load<T>(loader: (call: Call) => Promise<T>): Promise<Loaded<T>> {
  if (USE_MOCK) return { data: await loader(mockCall), source: 'demo' };
  try {
    return { data: await loader(realCall), source: 'api' };
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
    return toExpertQuestion(raw, similar);
  });
}

export function getTrackRecord(token: string): Promise<Loaded<TrackRecord>> {
  return load(async (call) => toTrackRecord(await call<ApiTrackRecord>('GET', `/q/${enc(token)}/track-record`)));
}

// ---------------------------------------------------------------------------
// Moderator (no auth in the backend yet: see HANDOFF.md)
// ---------------------------------------------------------------------------

export function getAlerts(status: AlertStatus): Promise<Loaded<Alert[]>> {
  return load(async (call) => (await call<ApiAlert[]>('GET', `/alerts?status=${status}`)).map(toAlert));
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
  });
}

export function getModeratorQuestions(): Promise<Loaded<QuestionListItem[]>> {
  return load(async (call) => (await call<ApiQuestionListItem[]>('GET', '/moderator/questions')).map(toQuestionListItem));
}

export function getQuestionDetail(id: string): Promise<Loaded<QuestionDetail>> {
  return load(async (call) => toQuestionDetail(await call<ApiQuestionDetail>('GET', `/moderator/questions/${enc(id)}`)));
}

export function getLeaderboard(): Promise<Loaded<Leaderboard>> {
  return load(async (call) => toLeaderboard(await call<ApiLeaderboard>('GET', '/moderator/leaderboard')));
}

export function getRisk(id: string): Promise<Loaded<RiskDetail>> {
  return load(async (call) => toRiskDetail(await call<ApiRisk>('GET', `/risks/${enc(id)}`)));
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
  });
}

export function getRankedRisks(): Promise<Loaded<RankedRisks>> {
  return load(async (call) => {
    const raw = await call<ApiRankedRisk[]>('GET', '/risks/ranked');
    return isPlaceholderRanked(raw)
      ? { items: curated.ranked_risks.map(toRankedRisk), areDemo: true }
      : { items: raw.map(toRankedRisk), areDemo: false };
  });
}

// ---------------------------------------------------------------------------
// Public: built on the server from the moderator view; only aggregates leave this function.
// ---------------------------------------------------------------------------

export function getPublicOutcome(questionId: string): Promise<Loaded<PublicOutcome>> {
  return load(async (call) =>
    toPublicOutcome(toQuestionDetail(await call<ApiQuestionDetail>('GET', `/moderator/questions/${enc(questionId)}`))),
  );
}
