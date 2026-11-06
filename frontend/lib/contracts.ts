/**
 * Backend wire format, mirroring the samples in contracts/*.json at the repo root (owned by David).
 * snake_case, probabilities as 0–1 floats, capitalised labels ("High", "Active", "Materialised").
 *
 * lib/adapters.ts converts these to the domain types in lib/types.ts; screens never see this format.
 * After the samples change, run `npm run check:contracts`: it type-checks every sample against
 * these interfaces and the adapters.
 */

export interface WireRisk {
  id: string;
  title: string;
  country: string;
  iso: string;
  risk_type: string;
  probability: string; // "Very Low" | "Low" | "Medium" | "High" | "Very High"
  impact: number; // 1–5
  risk_level: string; // "Low" | "Medium" | "High"
  status: string; // "Active" | "Materialised" | "Not materialised"
  expected_exposure: string;
  last_reviewed: string; // ISO date
}

export interface WireTrigger {
  id: string; // "T0001"
  risk_id: string;
  title: string;
  description: string;
}

export interface WireAlert {
  id: string;
  risk_id: string;
  trigger_id: string;
  report: { title: string; source: string; url: string; published_at: string };
  direction: string; // "escalating" (others not in the samples yet)
  strength: number; // 0–1
  evidence: string; // why the report matches the trigger
  status: string; // "pending" | "approved" | "rejected"
}

export interface WireQuestion {
  id: string;
  risk_id: string;
  alert_id: string;
  text: string;
  resolution_criteria: string;
  deadline: string; // ISO date
  status: string; // "open" | "closed" | "resolved"
}

export interface WireResponse {
  id: string;
  question_id: string;
  pseudonym_id: string;
  probability: number; // 0–1
  reason: string;
  round: number; // 1 = first answer, 2+ = revision
}

export interface WireGroupView {
  question_id: string;
  response_count: number;
  median: number; // 0–1
  min: number; // 0–1 (not shown to peers: see lib/anonymity.ts)
  max: number; // 0–1
  themes: { agreement: string[]; disagreement: string[]; new_information: string[] };
}

export interface WireRankedRisk {
  risk_id: string;
  title: string;
  country: string;
  p_materialise: number; // 0–1
  priority_score: number; // 0–1
  score_breakdown: { signal_strength: number; uncertainty: number; impact: number; review_age: number };
}

export interface WireSimilarRisk {
  risk_id: string;
  title: string;
  country: string;
  similarity: number; // 0–1
  outcome: string; // "Materialised" | "Not materialised"
  what_happened: string;
}

/** Body we send for POST /questions/{id}/responses and /revision. Proposed: confirm with David. */
export interface WireResponseIn {
  question_id: string;
  pseudonym_id: string;
  probability: number; // 0–1
  reason: string;
  round: 1 | 2;
}
