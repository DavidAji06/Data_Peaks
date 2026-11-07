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
  status: string;
}

export interface ApiSimilarRisk {
  risk_id: string;
  title: string;
  country: string;
  similarity?: number;
  outcome: string;
  what_happened: string;
}

export interface ApiExpertQuestion {
  question: { id: string; text: string; resolution_criteria: string; deadline: string; status: QuestionStatus };
  risk: { id: string; title: string; country: string; risk_level: string | null };
  trigger_update: ApiAlert | null;
  similar_risks: ApiSimilarRisk[];
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

export interface ApiScore {
  question_id: string;
  question_text: string;
  probability: number;
  outcome: 0 | 1;
  brier: number;
}

export interface ApiTrackRecord {
  resolved: number;
  mean_brier: number | null;
  beats_baseline: boolean | null;
  baseline_brier: number;
  history: ApiScore[];
}

export interface ApiSettings {
  pseudonym: string;
  anonymity_level: AnonymityLevel;
  country: string;
  topics: string[];
  language: string;
  max_open_questions: number;
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
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const q = (token: string) => `/q/${encodeURIComponent(token)}`;

export const api = {
  getQuestion: (token: string) => request<ApiExpertQuestion>(q(token)),
  submitAnswer: (token: string, probability: number, reason: string) =>
    request<{ status: string }>(`${q(token)}/responses`, {
      method: "POST",
      body: JSON.stringify({ probability, reason }),
    }),
  submitRevision: (token: string, probability: number, reason: string) =>
    request<{ status: string }>(`${q(token)}/revision`, {
      method: "POST",
      body: JSON.stringify({ probability, reason }),
    }),
  getGroup: (token: string) => request<ApiGroupView>(`${q(token)}/group`),
  getTrackRecord: (token: string) => request<ApiTrackRecord>(`${q(token)}/track-record`),
  getSettings: (token: string) => request<ApiSettings>(`${q(token)}/settings`),
  updateSettings: (token: string, body: Partial<Omit<ApiSettings, "pseudonym">>) =>
    request<ApiSettings>(`${q(token)}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
};
