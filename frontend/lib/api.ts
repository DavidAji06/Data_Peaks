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
import { connection } from 'next/server';

import curatedFile from '@/mock/curated.json';
import {
  isPlaceholderRanked,
  toAlert,
  toPublicOutcome,
  toLeaderboard,
  toPanelInvites,
  toPanels,
  toQuestionDetail,
  toQuestionListItem,
  toRankedRisk,
  toRiskDetail,
} from './adapters';
import { ApiError, NetworkError } from './api-error';
import { mockRequest } from './server/mock-backend';
import type {
  Alert,
  AlertStatus,
  ApiAlert,
  ApiContexts,
  ApiPublicQuestion,
  ApiLeaderboard,
  ApiPanelInvites,
  ApiPanels,
  ApiQuestionDetail,
  ApiQuestionListItem,
  ApiRankedRisk,
  ApiRisk,
  ApiSimilarRisk,
  Leaderboard,
  PanelInvites,
  Panels,
  Loaded,
  MapContext,
  PublicOutcome,
  QuestionDetail,
  QuestionListItem,
  RankedRisks,
  RiskDetail,
} from './types';

export { ApiError, NetworkError };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
/** Server-side calls may use a different address than the browser (e.g. the API's container name). */
const SERVER_API_URL = (process.env.API_INTERNAL_URL || API_URL).replace(/\/$/, '');
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
    res = await fetch(`${SERVER_API_URL}${path}`, {
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
  // Live, per-request data (fetched with no-store): render it at request time. Without this,
  // cacheComponents tries to prerender the page and stops at the clock read in AbortSignal.timeout.
  await connection();
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

export function getPanels(): Promise<Loaded<Panels>> {
  return load(async (call) => toPanels(await call<ApiPanels>('GET', '/moderator/panels')), 'moderator');
}

export function getPanelInvites(): Promise<Loaded<PanelInvites>> {
  return load(async (call) => toPanelInvites(await call<ApiPanelInvites>('GET', '/moderator/panel-invites')), 'moderator');
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
      ? (() => {
          if (curated.ranked_risks.length === 0) {
            console.warn('[Ground Truth] No curated ranked risks found; showing empty list');
          }
          return { items: curated.ranked_risks.map(toRankedRisk), areDemo: true };
        })()
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

// ---------------------------------------------------------------------------
// Public: GET /public/contexts (no token). The countries on the expert app's globe, for the moderator map.
// ---------------------------------------------------------------------------

/** Impact from the ACAPS risk level when the API has no impact rating (same rule as the expert app). */
function impactFromLevel(level: string | null | undefined): number | null {
  const l = (level ?? '').toLowerCase();
  if (l.includes('very high') || l.includes('critical')) return 5;
  if (l.includes('high')) return 4;
  if (l.includes('medium') || l.includes('moderate')) return 3;
  if (l.includes('low')) return 2;
  return null;
}

export function getMapContexts(): Promise<Loaded<{ rankedAt: string | null; contexts: MapContext[] }>> {
  return load(async (call) => {
    const res = await call<ApiContexts>('GET', '/public/contexts');
    return {
      rankedAt: res.ranked_at,
      contexts: res.contexts.map((c) => {
        const risks = c.risks.map((r) => ({ id: r.id, title: r.title, riskLevel: r.risk_level, priority: r.priority_score, impact: r.impact ?? null }));
        return {
          iso: c.iso3,
          name: c.country,
          lat: c.lat,
          lng: c.lng,
          impactScore: c.impact_score ?? risks.find((r) => r.impact != null)?.impact ?? impactFromLevel(risks[0]?.riskLevel),
          risks,
        };
      }),
    };
  });
}
