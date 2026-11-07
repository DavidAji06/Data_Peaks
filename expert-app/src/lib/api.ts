/**
 * Typed client for the Data Peaks FastAPI expert endpoints (backend/app/main.py).
 * Probabilities are 0–1 on the wire; the UI converts to 0–100 for display.
 *
 * Base URL: VITE_API_URL, or "/api" which the Vite dev server proxies to http://localhost:8000.
 * The expert link token is a credential: it is kept in memory/sessionStorage and never rendered.
 */

export type AnonymityLevel = "known_to_acaps" | "pseudonymous" | "anonymous";
export type QuestionStatus = "open" | "closed" | "resolved";

export interface ApiAlert {
  id: string;
  risk_id: string;
  trigger_id: string | null;
  report: { title: string; source: string | null; url: string | null; published_at: string | null };
  direction: string | null;
  strength: number | null;
  evidence: string | null;
  /** LLM scores of the ACAPS access event (1–5); null on older alerts. */
  impact_score?: number | null;
  intensity_score?: number | null;
  exposure_score?: number | null;
  country?: string | null;
  /** Heuristic place-name match with the risk text. Never means a trigger fired. */
  region_match?: boolean | null;
  matched_place?: string | null;
  status: string;
}

export interface ApiSimilarRisk {
  risk_id: string;
  title: string;
  country: string;
  similarity?: number;
  outcome: string;
  what_happened: string;
  /** Full ACAPS text, untruncated. */
  what_happened_full?: string;
  /** Source links recorded by ACAPS for what happened. */
  sources?: string[];
  /** How the past risk evolved, from the Risk Radar (empty strings when not recorded). */
  evolution?: {
    trend: string;
    what_materialised: string;
    hazard_materialisation: string;
    impact_materialisation: string;
    rationale_update: string;
  };
}

export interface ApiExpertQuestion {
  question: { id: string; text: string; resolution_criteria: string; deadline: string; status: QuestionStatus };
  risk: { id: string; title: string; country: string; risk_level: string | null };
  trigger_update: ApiAlert | null;
  similar_risks: ApiSimilarRisk[];
  answered: boolean;
  revised: boolean;
  /** The expert's own answers, probabilities 0–1 (older backends omit this). */
  own?: { first: number | null; latest: number | null; first_reason: string };
}

/** GET /q/{token}/questions: every question the expert was invited to, open ones first. */
export interface ApiQuestionSummary {
  question_id: string;
  text: string;
  deadline: string;
  status: QuestionStatus;
  risk: { id: string; title: string; country: string };
  answered: boolean;
  revised: boolean;
}

export interface ApiThemes {
  agreement: string[];
  disagreement: string[];
  new_information: string[];
}

export interface ApiGroupView {
  question_id: string;
  response_count: number;
  median: number | null;
  min: number | null;
  max: number | null;
  themes: ApiThemes;
}

/** A resolved question the expert answered. No scores: those are for ACAPS moderators only. */
export interface ApiPastQuestion {
  question_id: string;
  question_text: string;
  outcome: 0 | 1;
}

export interface ApiTrackRecord {
  answered: number;
  resolved: number;
  history: ApiPastQuestion[];
}

export interface ApiSettings {
  pseudonym: string;
  anonymity_level: AnonymityLevel;
  country: string;
  topics: string[];
  language: string;
  max_open_questions: number;
  /** Countries followed on the Home map (English names). Questions are routed by these. */
  followed: string[];
}

export interface ApiContext {
  iso3: string;
  country: string;
  lat: number;
  lng: number;
  risks: { id: string; title: string; risk_level: string | null; priority_score: number | null }[];
  has_question: boolean;
}

export interface ApiContexts {
  ranked_at: string | null;
  contexts: ApiContext[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) || "/api").replace(/\/$/, "");
const TOKEN_KEY = "dp-expert-token";
const DEFAULT_TOKEN = (import.meta.env["VITE_EXPERT_TOKEN"] as string | undefined) || "demo-expert-a";

/** Reads ?token= once, removes it from the address bar, and keeps it for this tab only. */
export function getToken(): string {
  if (typeof window === "undefined") return DEFAULT_TOKEN;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    if (fromUrl) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl);
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url.toString());
      return fromUrl;
    }
    return sessionStorage.getItem(TOKEN_KEY) || DEFAULT_TOKEN;
  } catch {
    return DEFAULT_TOKEN;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      // FastAPI validation errors: [{ msg: "Value error, Nickname must be 3 to 30 characters", ... }]
      else if (Array.isArray(body?.detail) && typeof body.detail[0]?.msg === "string")
        detail = body.detail[0].msg.replace(/^Value error, /, "");
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const q = (token: string) => `/q/${encodeURIComponent(token)}`;
/** Every question call names its question, so an answer never lands on one that arrived meanwhile. */
const qid = (questionId: string) => `?question_id=${encodeURIComponent(questionId)}`;

export const api = {
  getContexts: (token: string | null) =>
    request<ApiContexts>(`/public/contexts${token ? `?token=${encodeURIComponent(token)}` : ""}`),
  getQuestions: (token: string) => request<ApiQuestionSummary[]>(`${q(token)}/questions`),
  getQuestion: (token: string, questionId: string) => request<ApiExpertQuestion>(`${q(token)}${qid(questionId)}`),
  submitAnswer: (token: string, questionId: string, probability: number, reason: string) =>
    request<{ status: string }>(`${q(token)}/responses${qid(questionId)}`, {
      method: "POST",
      body: JSON.stringify({ probability, reason }),
    }),
  submitRevision: (token: string, questionId: string, probability: number, reason: string) =>
    request<{ status: string }>(`${q(token)}/revision${qid(questionId)}`, {
      method: "POST",
      body: JSON.stringify({ probability, reason }),
    }),
  getGroup: (token: string, questionId: string) => request<ApiGroupView>(`${q(token)}/group${qid(questionId)}`),
  getTrackRecord: (token: string) => request<ApiTrackRecord>(`${q(token)}/track-record`),
  getSettings: (token: string) => request<ApiSettings>(`${q(token)}/settings`),
  updateSettings: (token: string, body: Partial<ApiSettings>) =>
    request<ApiSettings>(`${q(token)}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
};
