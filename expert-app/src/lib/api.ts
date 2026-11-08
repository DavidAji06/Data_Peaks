/**
 * Typed client for the Data Peaks FastAPI expert endpoints (backend/app/main.py).
 * Probabilities are 0–1 on the wire; the UI converts to 0–100 for display.
 *
 * Base URL: VITE_API_URL, or "/api" which the Vite dev server proxies to http://localhost:8000.
 * The expert link token is a credential: it is kept in localStorage ("dp-expert-token") and never rendered.
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
  question: { id: string; text: string; resolution_criteria: string; deadline: string; status: QuestionStatus; delphi_round?: number };
  risk: { id: string; title: string; country: string; risk_level: string | null };
  trigger_update: ApiAlert | null;
  similar_risks: ApiSimilarRisk[];
  answered: boolean;
  revised: boolean;
  /** The expert's own answers, probabilities 0–1 (older backends omit this). */
  own?: { first: number | null; latest: number | null; first_reason: string };
  own_response?: {
    round_1?: { probability: number; reason: string } | null;
    round_2?: { probability: number; reason: string } | null;
  } | null;
}

/** GET /q/{token}/questions: every question the expert was invited to, open ones first. */
export interface ApiQuestionSummary {
  question_id: string;
  text: string;
  deadline: string;
  status: QuestionStatus;
  delphi_round?: number;
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

/** A country panel the expert is on (member) or asked to join. Moderators decide requests. */
export type PanelStatus = "member" | "pending" | "declined" | "removed";
export interface ApiPanel {
  country: string;
  status: PanelStatus;
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

let joinToken: string | null | undefined; // Kept once read, so a re-run effect still sees it

/** Reads ?join= (an activation link from the invitation email) and removes it from the address bar. */
export function takeJoinToken(): string | null {
  if (typeof window === "undefined") return null;
  if (joinToken !== undefined) return joinToken;
  try {
    const url = new URL(window.location.href);
    joinToken = url.searchParams.get("join");
    if (joinToken) {
      url.searchParams.delete("join");
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    joinToken = null;
  }
  return joinToken;
}

/** After activation (or giving up), the app opens normally. */
export function clearJoinToken() {
  joinToken = null;
}

let memoryToken: string | null = null; // Used when storage is blocked (private browsing)

/** After activation or an emailed sign-in link, the expert's personal link token is this device's sign-in. */
export function setToken(token: string) {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: signed in for this page only */
  }
}

/**
 * The signed-in expert's token, or null (show the sign-in screen). Reads ?token= (from an email
 * link) once, saves it on this device and removes it from the address bar.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    if (fromUrl) {
      setToken(fromUrl);
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url.toString());
      return fromUrl;
    }
  } catch {
    /* bad URL: fall through to the saved token */
  }
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

/** Sign out: forget the token and everything this device kept for the expert. */
export function clearToken() {
  memoryToken = null;
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const s = store();
      s.removeItem(TOKEN_KEY);
      for (const key of Object.keys(s)) if (key.startsWith("dp-")) s.removeItem(key);
    } catch {
      /* storage unavailable */
    }
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
  /** Emails a sign-in link if the address belongs to an expert. Same answer either way; 429 = too many tries. */
  requestLoginLink: (email: string) =>
    request<{ status: string; detail: string }>("/auth/login-link", { method: "POST", body: JSON.stringify({ email }) }),
  /** 404 = unknown link, 409 = already used. */
  getJoin: (joinToken: string) => request<{ country: string }>(`/join/${encodeURIComponent(joinToken)}`),
  join: (joinToken: string, body: { anonymity_level: AnonymityLevel; language: string }) =>
    request<{ status: string; pseudonym: string; token: string; app_link: string; link_emailed?: boolean }>(`/join/${encodeURIComponent(joinToken)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
  getPanels: (token: string) => request<ApiPanel[]>(`${q(token)}/panels`),
  requestPanel: (token: string, country: string) =>
    request<ApiPanel[]>(`${q(token)}/panels`, { method: "POST", body: JSON.stringify({ country }) }),
  withdrawPanel: (token: string, country: string) =>
    request<ApiPanel[]>(`${q(token)}/panels/${encodeURIComponent(country)}`, { method: "DELETE" }),
  updateSettings: (token: string, body: Partial<ApiSettings>) =>
    request<ApiSettings>(`${q(token)}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
};
