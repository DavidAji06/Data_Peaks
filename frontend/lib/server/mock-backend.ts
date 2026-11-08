/**
 * Offline demo backend: a TypeScript copy of David's FastAPI endpoints, running on mock/db.json
 * (a snapshot of the backend's seed; refresh with `npm run mocks:snapshot`).
 *
 * Same paths, JSON shapes, status codes and rules as backend/app/main.py and routers/moderator.py,
 * as of backend commit d4d949d (multi-country routing; no group
 * figures below 5 answers; public questions; AI summary). Used only when the real API is unreachable and NEXT_PUBLIC_DEMO_FALLBACK=true,
 * or when NEXT_PUBLIC_USE_MOCK is on. State lives in server memory until the dev server restarts.
 * Server-only: this data must never be bundled for the browser.
 */
import 'server-only';

import { randomBytes } from 'node:crypto';

import dbFile from '@/mock/db.json';
import { BASELINE_BRIER, brier, median, roundLikePython } from '@/lib/probability';
import type {
  ApiAlert,
  ApiDecisionOut,
  ApiExpertQuestion,
  ApiExpertSettings,
  ApiPublicQuestion,
  ApiSummariseOut,
  ApiThemes,
  ApiGroupView,
  ApiLeaderboard,
  ApiModeratorResponse,
  ApiQuestionDetail,
  ApiQuestionListItem,
  ApiRankedRisk,
  ApiResolveOut,
  ApiRisk,
  ApiRoundSummary,
  ApiSimilarRisk,
  ApiTrackRecord,
  AnonymityLevel,
  Outcome,
  QuestionStatus,
} from '@/lib/types';

interface ExpertRow {
  id: string;
  pseudonym: string;
  anonymity_level: AnonymityLevel;
  country: string;
  topics: string;
  language?: string; // backend default "en"
  max_open_questions?: number; // backend default 3
  email?: string | null; // synthetic only; never returned
}
interface PanelInviteRow {
  token: string;
  email: string;
  country: string;
  used: boolean;
}
interface QuestionRow {
  id: string;
  risk_id: string;
  alert_id: string | null;
  text: string;
  resolution_criteria: string;
  deadline: string;
  status: QuestionStatus;
  outcome: Outcome | null;
  themes?: string | null; // AI summary as JSON (backend Question.themes)
}
interface InviteRow {
  token: string;
  question_id: string;
  expert_id: string;
}
interface ResponseRow {
  id: number;
  question_id: string;
  expert_id: string;
  probability: number;
  reason: string;
  round: number;
  created_at: string;
}
interface AlertRow {
  id: string;
  risk_id: string;
  trigger_id: string | null;
  report_title: string;
  report_source: string | null;
  report_url: string | null;
  published_at: string | null;
  direction: string | null;
  strength: number | null;
  evidence: string | null;
  status: 'pending' | 'approved' | 'rejected';
}
interface MockDb {
  experts: ExpertRow[];
  questions: QuestionRow[];
  invites: InviteRow[];
  responses: ResponseRow[];
  alerts: AlertRow[];
  risks: ApiRisk[];
  contract_samples: { similar_risk: ApiSimilarRisk; ranked_risk: ApiRankedRisk };
}

/**
 * Demo state lives on globalThis: Next bundles route handlers (/api/demo) and server components
 * separately, so a plain module-level variable would give each its own copy, and an action taken
 * through /api/demo would not show up when the page reloads. One process, one demo state.
 */
const store = globalThis as typeof globalThis & {
  __groundTruthDemo?: { db: MockDb; panelInvites: PanelInviteRow[] };
};
store.__groundTruthDemo ??= { db: structuredClone(dbFile) as unknown as MockDb, panelInvites: [] };
const db = store.__groundTruthDemo.db;
/** Panel invites made in this session (the seed has none). */
const panelInvites = store.__groundTruthDemo.panelInvites;
const FRONTEND_URL = 'http://localhost:3000';
const newToken = () => randomBytes(16).toString('base64url'); // like secrets.token_urlsafe(16)

export interface MockResult {
  status: number;
  body: unknown;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : 'Validation error');
  }
}

const fail = (status: number, detail: string): never => {
  throw new HttpError(status, detail);
};
/** A FastAPI-style 422. field '' = a model-level check (Pydantic prefixes those with "Value error, "). */
const invalid = (field: string, msg: string, type = 'value_error'): never => {
  throw new HttpError(422, [
    field ? { type, loc: ['body', field], msg } : { type: 'value_error', loc: ['body'], msg: `Value error, ${msg}` },
  ]);
};

const r2 = (x: number) => roundLikePython(x, 2); // Python's round(x, 2)
const r4 = (x: number) => roundLikePython(x, 4);
const MIN_GROUP_SIZE = 5;
const MAX_PANEL_SIZE = 10;
const MIN_RESOLVED_FOR_RANKING = 3;

/** Python's date.today() (local date) as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const getInvite = (token: string) => db.invites.find((i) => i.token === token) ?? fail(404, 'Link not found');
const getQuestion = (id: string) => db.questions.find((q) => q.id === id);
const getRisk = (id: string) => db.risks.find((r) => r.id === id);
const getResponse = (questionId: string, expertId: string, round: number) =>
  db.responses.find((r) => r.question_id === questionId && r.expert_id === expertId && r.round === round);
const requireOpen = (q: QuestionRow) => {
  if (q.status !== 'open') fail(400, 'Question is closed');
};

const alertToApi = (a: AlertRow): ApiAlert => ({
  id: a.id,
  risk_id: a.risk_id,
  trigger_id: a.trigger_id,
  report: { title: a.report_title, source: a.report_source, url: a.report_url, published_at: a.published_at },
  direction: a.direction,
  strength: a.strength,
  evidence: a.evidence,
  status: a.status,
});

/** Latest answer per expert (revision if any), in the order answers were stored. */
function latestAnswers(questionId: string): Map<string, ResponseRow> {
  const latest = new Map<string, ResponseRow>();
  for (const r of db.responses.filter((x) => x.question_id === questionId)) {
    const current = latest.get(r.expert_id);
    if (!current || r.round > current.round) latest.set(r.expert_id, r);
  }
  return latest;
}

function answersByExpert(questionId: string): Map<string, Map<number, ResponseRow>> {
  const out = new Map<string, Map<number, ResponseRow>>();
  for (const r of db.responses.filter((x) => x.question_id === questionId)) {
    if (!out.has(r.expert_id)) out.set(r.expert_id, new Map());
    out.get(r.expert_id)!.set(r.round, r);
  }
  return out;
}

const latestOf = (rounds: Map<number, ResponseRow>) => rounds.get(Math.max(...rounds.keys()))!;

function summarise(values: number[]): ApiRoundSummary | null {
  if (values.length === 0) return null;
  return { count: values.length, median: r2(median(values)), min: Math.min(...values), max: Math.max(...values) };
}

/** One resolved answer with its Brier score (mock-internal; the expert API no longer returns it). */
interface ApiScore { question_id: string; question_text: string; probability: number; outcome: Outcome; brier: number }

function expertScores(expertId: string): ApiScore[] {
  const latest = new Map<string, ResponseRow>();
  for (const r of db.responses.filter((x) => x.expert_id === expertId)) {
    const q = getQuestion(r.question_id);
    if (q?.status !== 'resolved') continue;
    const current = latest.get(q.id);
    if (!current || r.round > current.round) latest.set(q.id, r);
  }
  return [...latest.values()]
    .map((r) => ({ r, q: getQuestion(r.question_id)! }))
    .sort((a, b) => a.q.id.localeCompare(b.q.id))
    .map(({ r, q }) => ({
      question_id: q.id,
      question_text: q.text,
      probability: r.probability,
      outcome: q.outcome as Outcome,
      brier: brier(r.probability, q.outcome as Outcome),
    }));
}

function summariseScores(scores: ApiScore[]) {
  if (scores.length === 0) return { resolved: 0, mean_brier: null, beats_baseline: null };
  const mean = r4(scores.reduce((s, x) => s + x.brier, 0) / scores.length);
  return { resolved: scores.length, mean_brier: mean, beats_baseline: mean < BASELINE_BRIER };
}

// ---------------------------------------------------------------------------
// Body checks (FastAPI validates the body before the handler runs, so 422 comes first)
// ---------------------------------------------------------------------------

function checkAnswer(body: unknown): { probability: number; reason: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.probability !== 'number' || !Number.isFinite(b.probability)) invalid('probability', 'Input should be a valid number', 'float_parsing');
  const p = b.probability as number;
  if (p < 0) invalid('probability', 'Input should be greater than or equal to 0', 'greater_than_equal');
  if (p > 1) invalid('probability', 'Input should be less than or equal to 1', 'less_than_equal');
  if (typeof b.reason !== 'string') invalid('reason', 'Input should be a valid string', 'string_type');
  const reason = b.reason as string;
  if (reason.length < 1) invalid('reason', 'String should have at least 1 character', 'string_too_short');
  if (reason.length > 280) invalid('reason', 'String should have at most 280 characters', 'string_too_long');
  return { probability: p, reason };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** GET /q/{token}/settings, as in backend commit 3220fc0 (language and limit use its defaults). */
function expertSettings(token: string): ApiExpertSettings {
  const invite = getInvite(token);
  const e = db.experts.find((x) => x.id === invite.expert_id)!;
  return {
    pseudonym: e.pseudonym,
    anonymity_level: e.anonymity_level,
    country: e.country,
    topics: e.topics.split(',').filter(Boolean),
    language: e.language ?? 'en',
    max_open_questions: e.max_open_questions ?? 3,
  };
}

const LEVELS = ['known_to_acaps', 'pseudonymous', 'anonymous'] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Pydantic-style checks for the sign-up and settings bodies. `partial` = PATCH (missing fields allowed). */
function checkProfile(body: unknown, partial: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined && b[k] !== null;
  if (!partial || has('anonymity_level')) {
    if (!LEVELS.includes(b.anonymity_level as (typeof LEVELS)[number]))
      invalid('anonymity_level', "Input should be 'known_to_acaps', 'pseudonymous' or 'anonymous'", 'literal_error');
  }
  if (!partial || has('country')) {
    if (typeof b.country !== 'string') invalid('country', 'Input should be a valid string', 'string_type');
    const c = b.country as string;
    if (c.length < 2) invalid('country', 'String should have at least 2 characters', 'string_too_short');
    if (c.length > 80) invalid('country', 'String should have at most 80 characters', 'string_too_long');
  }
  if (has('topics')) {
    if (!Array.isArray(b.topics) || b.topics.some((t) => typeof t !== 'string')) invalid('topics', 'Input should be a valid list', 'list_type');
    if ((b.topics as string[]).length > 10) invalid('topics', 'List should have at most 10 items after validation', 'too_long');
  }
  if (has('max_open_questions')) {
    const n = b.max_open_questions;
    if (typeof n !== 'number' || !Number.isInteger(n)) invalid('max_open_questions', 'Input should be a valid integer', 'int_type');
    if ((n as number) < 1) invalid('max_open_questions', 'Input should be greater than or equal to 1', 'greater_than_equal');
    if ((n as number) > 5) invalid('max_open_questions', 'Input should be less than or equal to 5', 'less_than_equal');
  }
  return b as {
    anonymity_level?: AnonymityLevel;
    country?: string;
    topics?: string[];
    language?: string;
    max_open_questions?: number;
  };
}

/** clean_topics: trimmed, lower-case, no duplicates, comma-separated. */
const cleanTopics = (topics: string[]) => [...new Set(topics.map((t) => t.trim().toLowerCase()).filter(Boolean))].join(',');

/** PATCH /q/{token}/settings: only the fields sent change. */
function updateSettings(token: string, body: unknown): ApiExpertSettings {
  const u = checkProfile(body, true);
  const invite = getInvite(token);
  const e = db.experts.find((x) => x.id === invite.expert_id)!;
  if (u.anonymity_level) e.anonymity_level = u.anonymity_level;
  if (u.country) e.country = u.country;
  if (u.topics) e.topics = cleanTopics(u.topics);
  if (u.max_open_questions) e.max_open_questions = u.max_open_questions;
  return expertSettings(token);
}

/** POST /moderator/panel-invites */
function createPanelInvite(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.email !== 'string') invalid('email', 'Input should be a valid string', 'string_type');
  if (!EMAIL.test(b.email as string)) invalid('email', "String should match pattern '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'", 'string_pattern_mismatch');
  if ((b.email as string).length > 254) invalid('email', 'String should have at most 254 characters', 'string_too_long');
  if (typeof b.country !== 'string') invalid('country', 'Input should be a valid string', 'string_type');
  if ((b.country as string).length < 2) invalid('country', 'String should have at least 2 characters', 'string_too_short');
  if ((b.country as string).length > 80) invalid('country', 'String should have at most 80 characters', 'string_too_long');
  const invite = { token: newToken(), email: b.email as string, country: b.country as string, used: false };
  panelInvites.push(invite);
  return { status: 'invited', email_sent: false, email_error: 'Demo data: no email is sent', join_link: `${FRONTEND_URL}/join/${invite.token}` };
}

/** GET /moderator/panels (demo: every expert is a member of their own country, no requests) */
function listPanels() {
  const byCountry = new Map<string, { country: string; members: unknown[]; pending: number }>();
  let anon = 0;
  for (const e of db.experts) {
    const entry = byCountry.get(e.country) ?? { country: e.country, members: [], pending: 0 };
    const label = e.anonymity_level === 'anonymous' ? `Anonymous expert ${++anon}` : e.pseudonym;
    entry.members.push({ membership_id: entry.members.length + 1, since: null, label, anonymity_level: e.anonymity_level, synthetic: true });
    byCountry.set(e.country, entry);
  }
  return { target: { min: 5, max: 10 }, panels: [...byCountry.values()], requests: [] };
}

/** GET /moderator/panel-invites (demo: no email is ever sent) */
function listPanelInvites() {
  return {
    email_configured: false,
    invites: [...panelInvites].reverse().map((i) => ({
      token: i.used ? null : i.token,
      email: i.email,
      country: i.country,
      status: i.used ? 'joined' : 'pending',
      email_sent: false,
      invited_at: new Date().toISOString(),
      joined_at: null,
      expert: null,
      anonymous: false,
    })),
  };
}

function getOpenPanelInvite(token: string): PanelInviteRow {
  const invite = panelInvites.find((i) => i.token === token) ?? fail(404, 'Invite not found');
  if (invite.used) fail(409, 'Invite already used');
  return invite;
}

/** POST /join/{token}: creates the expert with a fresh pseudonym and marks the invite used. */
function joinPanel(token: string, body: unknown): { status: 'joined'; pseudonym: string } {
  const b = checkProfile(body, false);
  const invite = getOpenPanelInvite(token);
  let pseudonym: string;
  do pseudonym = `Analyst ${randomBytes(2).toString('hex').toUpperCase()}`;
  while (db.experts.some((e) => e.pseudonym === pseudonym));
  db.experts.push({
    id: `expert-${randomBytes(4).toString('hex')}`,
    pseudonym,
    anonymity_level: b.anonymity_level!,
    country: b.country!,
    topics: cleanTopics(b.topics ?? []),
    language: b.language ?? 'en',
    max_open_questions: b.max_open_questions ?? 3,
    email: invite.email,
  });
  invite.used = true;
  return { status: 'joined', pseudonym };
}

function expertQuestion(token: string): ApiExpertQuestion {
  const invite = getInvite(token);
  const q = getQuestion(invite.question_id)!;
  const risk = getRisk(q.risk_id)!;
  const alert = q.alert_id ? db.alerts.find((a) => a.id === q.alert_id) : undefined;
  const r1 = getResponse(q.id, invite.expert_id, 1);
  const r2 = getResponse(q.id, invite.expert_id, 2);
  return {
    question: { id: q.id, text: q.text, resolution_criteria: q.resolution_criteria, deadline: q.deadline, status: q.status },
    risk: { id: risk.id, title: risk.title, country: risk.country, risk_level: risk.risk_level },
    trigger_update: alert ? alertToApi(alert) : null,
    similar_risks: [db.contract_samples.similar_risk], // the API's placeholder until ML is ready
    answered: Boolean(r1),
    revised: Boolean(r2),
    own_response: {
      round_1: r1 ? { probability: r1.probability, reason: r1.reason } : null,
      round_2: r2 ? { probability: r2.probability, reason: r2.reason } : null,
    },
  };
}

function addResponse(questionId: string, expertId: string, answer: { probability: number; reason: string }, round: number) {
  const id = Math.max(0, ...db.responses.map((r) => r.id)) + 1;
  db.responses.push({ id, question_id: questionId, expert_id: expertId, ...answer, round, created_at: new Date().toISOString() });
}

function submitAnswer(token: string, body: unknown) {
  const answer = checkAnswer(body);
  const invite = getInvite(token);
  requireOpen(getQuestion(invite.question_id)!);
  if (getResponse(invite.question_id, invite.expert_id, 1)) fail(409, 'Already answered');
  addResponse(invite.question_id, invite.expert_id, answer, 1);
  return { status: 'received' };
}

function submitRevision(token: string, body: unknown) {
  const answer = checkAnswer(body);
  const invite = getInvite(token);
  requireOpen(getQuestion(invite.question_id)!);
  if (!getResponse(invite.question_id, invite.expert_id, 1)) fail(403, 'Submit your first answer before revising');
  if (getResponse(invite.question_id, invite.expert_id, 2)) fail(409, 'Already revised');
  addResponse(invite.question_id, invite.expert_id, answer, 2);
  return { status: 'revised' };
}

const emptyThemes = (): ApiThemes => ({ agreement: [], disagreement: [], new_information: [] });

/** Like ml_outputs.stored_themes: the saved AI summary, or empty. */
function storedThemes(q: QuestionRow | undefined): ApiThemes {
  if (!q?.themes) return emptyThemes();
  try {
    return JSON.parse(q.themes) as ApiThemes;
  } catch {
    return emptyThemes();
  }
}

function groupView(token: string): ApiGroupView {
  const invite = getInvite(token);
  if (!getResponse(invite.question_id, invite.expert_id, 1)) fail(403, 'Submit your answer before seeing the group view');
  const probabilities = [...latestAnswers(invite.question_id).values()].map((r) => r.probability);
  if (probabilities.length < MIN_GROUP_SIZE) {
    const themes = emptyThemes();
    return { question_id: invite.question_id, response_count: probabilities.length, median: null, min: null, max: null, themes };
  }
  return {
    question_id: invite.question_id,
    response_count: probabilities.length,
    median: r2(median(probabilities)),
    min: Math.min(...probabilities),
    max: Math.max(...probabilities),
    themes: storedThemes(getQuestion(invite.question_id)),
  };
}

function trackRecord(token: string): ApiTrackRecord {
  const invite = getInvite(token);
  const scores = expertScores(invite.expert_id);
  const answered = new Set(db.responses.filter((r) => r.expert_id === invite.expert_id).map((r) => r.question_id)).size;
  return {
    answered,
    resolved: scores.length,
    history: scores.map((x) => ({ question_id: x.question_id, question_text: x.question_text, outcome: x.outcome })),
  };
}

function listAlerts(status: string): ApiAlert[] {
  return db.alerts.filter((a) => a.status === status).map(alertToApi);
}

function openInviteCount(expertId: string): number {
  return db.invites.filter((i) => i.expert_id === expertId && getQuestion(i.question_id)?.status === 'open').length;
}

/** Experts from any of the risk's countries, fewest open questions first (with the multi-country fix). */
function routeQuestion(questionId: string, country: string): InviteRow[] {
  const countries = new Set(country.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean));
  const candidates = db.experts
    .filter((e) => countries.has(e.country.toLowerCase()))
    .map((e) => ({ e, count: openInviteCount(e.id) }))
    .filter((c) => c.count < (c.e.max_open_questions ?? 3))
    .sort((a, b) => a.count - b.count)
    .slice(0, MAX_PANEL_SIZE);
  const invites = candidates.map(({ e }) => ({
    token: crypto.randomUUID().replace(/-/g, ''),
    question_id: questionId,
    expert_id: e.id,
  }));
  db.invites.push(...invites);
  return invites;
}

function decideAlert(alertId: string, body: unknown): ApiDecisionOut {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.status !== 'approved' && b.status !== 'rejected') invalid('status', "Input should be 'approved' or 'rejected'");
  if (b.status === 'approved') {
    if (!(b.question_text && b.resolution_criteria && b.deadline)) {
      invalid('', 'Approving needs question_text, resolution_criteria and deadline');
    }
    const deadline = String(b.deadline);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline))) invalid('deadline', 'Input should be a valid date');
    if (deadline <= today()) invalid('', 'Deadline must be in the future');
  }
  const alert = db.alerts.find((a) => a.id === alertId) ?? fail(404, 'Alert not found');
  if (alert.status !== 'pending') fail(409, 'Alert already decided');

  if (b.status === 'rejected') {
    alert.status = 'rejected';
    return { alert_id: alertId, status: 'rejected' };
  }
  const risk = getRisk(alert.risk_id)!;
  const count = db.questions.filter((q) => q.id.startsWith('Q')).length;
  const question: QuestionRow = {
    id: `Q${String(count + 1).padStart(3, '0')}`,
    risk_id: risk.id,
    alert_id: alert.id,
    text: String(b.question_text),
    resolution_criteria: String(b.resolution_criteria),
    deadline: String(b.deadline),
    status: 'open',
    outcome: null,
  };
  db.questions.push(question);
  const invites = routeQuestion(question.id, risk.country);
  alert.status = 'approved';
  return { alert_id: alertId, status: 'approved', question_id: question.id, experts_invited: invites.length };
}

function listQuestions(): ApiQuestionListItem[] {
  return [...db.questions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((q) => {
      const byExpert = answersByExpert(q.id);
      const summary = summarise([...byExpert.values()].map((rounds) => latestOf(rounds).probability));
      const revisedCount = [...byExpert.values()].filter((rounds) => rounds.has(2)).length;
      const delphiRound = (q as { delphi_round?: number }).delphi_round ?? 1;
      const phase =
        q.status === 'resolved'
          ? 'Resolved'
          : q.status === 'closed'
          ? 'Delphi Completed (Final Results)'
          : delphiRound === 2 || byExpert.size >= 5 || revisedCount > 0
          ? 'Phase 2: Delphi Consensus'
          : 'Phase 1: Initial Elicitation';

      return {
        id: q.id,
        risk_id: q.risk_id,
        text: q.text,
        status: q.status,
        delphi_round: delphiRound,
        outcome: q.outcome,
        deadline: q.deadline,
        invited: db.invites.filter((i) => i.question_id === q.id).length,
        answered: byExpert.size,
        revised: revisedCount,
        phase,
        median: summary ? summary.median : null,
      };
    });
}

function moderatorLabel(expert: ExpertRow, anonymousNumber: number) {
  if (expert.anonymity_level === 'known_to_acaps') {
    return { label: expert.pseudonym, anonymity_level: 'known_to_acaps' as const, identity_known: true };
  }
  if (expert.anonymity_level === 'pseudonymous') {
    return { label: expert.pseudonym, anonymity_level: 'pseudonymous' as const, identity_known: false };
  }
  return { label: `Anonymous expert ${anonymousNumber}`, anonymity_level: 'anonymous' as const, identity_known: false };
}

function questionDetail(questionId: string): ApiQuestionDetail {
  const q = getQuestion(questionId) ?? fail(404, 'Question not found');
  const risk = getRisk(q.risk_id)!;
  const resolved = q.outcome !== null;
  const byExpert = answersByExpert(q.id);

  const first = [...byExpert.values()].flatMap((rounds) => (rounds.has(1) ? [rounds.get(1)!.probability] : []));
  const latest = [...byExpert.values()].map((rounds) => latestOf(rounds).probability);

  // Sorted by latest probability so the order doesn't reveal who answered when (stable, like Python's sorted)
  const ordered = [...byExpert.entries()].sort((a, b) => latestOf(a[1]).probability - latestOf(b[1]).probability);
  let anonymousNumber = 0;
  const responses: ApiModeratorResponse[] = ordered.map(([expertId, rounds]) => {
    const expert = db.experts.find((e) => e.id === expertId)!;
    if (expert.anonymity_level === 'anonymous') anonymousNumber += 1;
    const firstAnswer = rounds.get(1);
    const revision = rounds.get(2);
    const latestAnswer = revision ?? firstAnswer!;
    const isRevised = Boolean(revision);
    const decision = isRevised
      ? firstAnswer && Math.abs(revision!.probability - firstAnswer.probability) < 0.001
        ? 'kept'
        : 'adjusted'
      : 'pending_round_2';
    const shift = isRevised && firstAnswer ? r2(revision!.probability - firstAnswer.probability) : null;

    return {
      ...moderatorLabel(expert, anonymousNumber),
      first_probability: firstAnswer ? firstAnswer.probability : null,
      first_reason: firstAnswer ? firstAnswer.reason : null,
      latest_probability: latestAnswer.probability,
      revision_reason: revision ? revision.reason : null,
      revised: isRevised,
      brier: resolved ? brier(latestAnswer.probability, q.outcome as Outcome) : null,
      status: isRevised ? 'finalised' : 'tentative',
      decision,
      shift,
      is_tentative: !isRevised,
      is_finalised: isRevised,
      round_1: firstAnswer
        ? {
            probability: firstAnswer.probability,
            reason: firstAnswer.reason,
            status: 'tentative',
          }
        : null,
      round_2: revision
        ? {
            probability: revision.probability,
            reason: revision.reason,
            status: 'finalised',
            decision,
            shift,
          }
        : null,
    };
  });

  const firstSummary = summarise(first);
  const latestSummary = summarise(latest);
  const counts = [0, 0, 0, 0, 0];
  for (const p of latest) counts[Math.min(Math.floor(p * 5), 4)] += 1;

  const revisedCount = [...byExpert.values()].filter((rounds) => rounds.has(2)).length;
  const delphiRound = (q as { delphi_round?: number }).delphi_round ?? 1;
  const phase =
    resolved
      ? 'Resolved'
      : q.status === 'closed'
      ? 'Delphi Completed (Final Results)'
      : delphiRound === 2 || byExpert.size >= 5 || revisedCount > 0
      ? 'Phase 2: Delphi Consensus'
      : 'Phase 1: Initial Elicitation';

  const round1Spread = firstSummary ? r2(firstSummary.max - firstSummary.min) : 0;
  const latestSpread = latestSummary ? r2(latestSummary.max - latestSummary.min) : 0;
  const spreadReduction = r2(round1Spread - latestSpread);
  const convergenceRate = round1Spread > 0 ? r2(spreadReduction / round1Spread) : 0;

  const retainedCount = responses.filter((r) => r.decision === 'kept').length;
  const adjustedCount = responses.filter((r) => r.decision === 'adjusted').length;

  return {
    question: {
      id: q.id,
      text: q.text,
      resolution_criteria: q.resolution_criteria,
      deadline: q.deadline,
      status: q.status,
      delphi_round: delphiRound,
      outcome: q.outcome,
    },
    risk: { id: risk.id, title: risk.title, country: risk.country, risk_level: risk.risk_level, acaps_probability: risk.probability },
    phase,
    participation: {
      invited: db.invites.filter((i) => i.question_id === q.id).length,
      answered: byExpert.size,
      revised: revisedCount,
    },
    first_round: firstSummary,
    latest: latestSummary,
    median_shift: firstSummary && latestSummary ? r2(latestSummary.median - firstSummary.median) : null,
    consensus_metrics: {
      round_1: firstSummary ? { ...firstSummary, mean: firstSummary.median, spread: round1Spread, iqr: 0.15, std_dev: 0.1 } : null,
      round_2: latestSummary ? { ...latestSummary, mean: latestSummary.median, spread: latestSpread, iqr: 0.08, std_dev: 0.05 } : null,
      latest: latestSummary ? { ...latestSummary, mean: latestSummary.median, spread: latestSpread, iqr: 0.08, std_dev: 0.05 } : null,
      median_shift: firstSummary && latestSummary ? r2(latestSummary.median - firstSummary.median) : null,
      spread_reduction: spreadReduction,
      convergence_rate: convergenceRate,
      retained_count: retainedCount,
      adjusted_count: adjustedCount,
      consensus_status: latestSpread <= 0.15 ? 'strong_consensus' : latestSpread <= 0.3 ? 'moderate_consensus' : 'divergent',
    },
    group_median_brier: resolved && latestSummary ? brier(latestSummary.median, q.outcome as Outcome) : null,
    baseline_brier: BASELINE_BRIER,
    distribution: counts.map((count, i) => ({ range: `${i * 20}-${(i + 1) * 20}%`, count })),
    responses,
    tentative_responses: responses.filter((r) => r.is_tentative),
    finalised_responses: responses.filter((r) => r.is_finalised),
    themes: storedThemes(q),
  };
}

function advanceQuestion(questionId: string) {
  const q = getQuestion(questionId) ?? fail(404, 'Question not found');
  (q as { delphi_round?: number }).delphi_round = 2;
  return { action: 'advanced_to_round_2', delphi_round: 2, status: q.status };
}

function closeQuestion(questionId: string) {
  const q = getQuestion(questionId) ?? fail(404, 'Question not found');
  q.status = 'closed';
  return { action: 'closed_with_final_results', status: 'closed' };
}

function resolveQuestion(questionId: string, body: unknown): ApiResolveOut {
  const outcome = (body as { outcome?: unknown } | null)?.outcome;
  if (outcome !== 0 && outcome !== 1) invalid('outcome', 'Input should be 0 or 1');
  const q = getQuestion(questionId) ?? fail(404, 'Question not found');
  if (q.status === 'resolved') fail(409, 'Question already resolved');
  q.outcome = outcome as Outcome;
  q.status = 'resolved';
  const probabilities = [...latestAnswers(q.id).values()].map((r) => r.probability);
  if (probabilities.length === 0) return { question_id: q.id, outcome: q.outcome, scored: 0 };
  const scores = probabilities.map((p) => brier(p, q.outcome as Outcome));
  return {
    question_id: q.id,
    outcome: q.outcome,
    scored: scores.length,
    mean_expert_brier: r4(scores.reduce((s, x) => s + x, 0) / scores.length),
    group_median_brier: brier(median(probabilities), q.outcome),
    baseline_brier: BASELINE_BRIER,
  };
}

function leaderboard(): ApiLeaderboard {
  const rows = db.experts
    .filter((e) => e.anonymity_level !== 'anonymous') // ranking anonymous experts would link their answers
    .map((e) => ({ e, summary: summariseScores(expertScores(e.id)) }))
    .filter(({ summary }) => summary.resolved >= MIN_RESOLVED_FOR_RANKING)
    .map(({ e, summary }) => ({
      label: e.pseudonym,
      anonymity_level: e.anonymity_level,
      resolved: summary.resolved,
      mean_brier: summary.mean_brier as number,
      beats_baseline: summary.beats_baseline as boolean,
    }))
    .sort((a, b) => a.mean_brier - b.mean_brier)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  return {
    baseline_brier: BASELINE_BRIER,
    min_resolved: MIN_RESOLVED_FOR_RANKING,
    experts: rows,
    note: 'Anonymous experts are scored privately and not ranked.',
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function route(method: string, path: string, body: unknown): unknown {
  const url = new URL(path, 'http://mock');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;

  if (method === 'GET') {
    if (a === 'health' && parts.length === 1) return { status: 'ok' };
    if (a === 'alerts' && parts.length === 1) return listAlerts(url.searchParams.get('status') ?? 'pending');
    if (a === 'risks' && b === 'ranked' && parts.length === 2) return [db.contract_samples.ranked_risk];
    if (a === 'risks' && c === 'similar' && parts.length === 3) return [db.contract_samples.similar_risk];
    if (a === 'risks' && parts.length === 2) return getRisk(b) ?? fail(404, 'Risk not found');
    if (a === 'questions' && parts.length === 2) return getQuestion(b) ?? fail(404, 'Question not found');
    if (a === 'q' && parts.length === 2) return expertQuestion(b);
    if (a === 'q' && c === 'group' && parts.length === 3) return groupView(b);
    if (a === 'q' && c === 'track-record' && parts.length === 3) return trackRecord(b);
    if (a === 'q' && c === 'settings' && parts.length === 3) return expertSettings(b);
    if (a === 'moderator' && b === 'questions' && parts.length === 2) return listQuestions();
    if (a === 'moderator' && b === 'questions' && parts.length === 3) return questionDetail(c);
    if (a === 'moderator' && b === 'leaderboard' && parts.length === 2) return leaderboard();
    if (a === 'moderator' && b === 'panel-invites' && parts.length === 2) return listPanelInvites();
    if (a === 'moderator' && b === 'panels' && parts.length === 2) return listPanels();
    if (a === 'public' && b === 'questions' && parts.length === 2) return publicQuestions();
    if (a === 'join' && parts.length === 2) return { country: getOpenPanelInvite(b).country };
  }
  if (method === 'POST') {
    if (a === 'alerts' && c === 'decision' && parts.length === 3) return decideAlert(b, body);
    if (a === 'q' && c === 'responses' && parts.length === 3) return submitAnswer(b, body);
    if (a === 'q' && c === 'revision' && parts.length === 3) return submitRevision(b, body);
    if (a === 'moderator' && b === 'questions' && d === 'resolve' && parts.length === 4) return resolveQuestion(c, body);
    if (a === 'moderator' && b === 'questions' && d === 'advance' && parts.length === 4) return advanceQuestion(c);
    if (a === 'moderator' && b === 'questions' && d === 'close' && parts.length === 4) return closeQuestion(c);
    if (a === 'moderator' && b === 'questions' && d === 'summarise' && parts.length === 4) return summariseQuestion(c);
    if (a === 'moderator' && b === 'panel-invites' && parts.length === 2) return createPanelInvite(body);
    if (a === 'moderator' && b === 'panel-invites' && d === 'resend' && parts.length === 4) {
      const invite = getOpenPanelInvite(c);
      return { status: 'invited', email_sent: false, email_error: 'Demo data: no email is sent', join_link: `${FRONTEND_URL}/join/${invite.token}` };
    }
    if (a === 'join' && parts.length === 2) return joinPanel(b, body);
  }
  if (method === 'PATCH') {
    if (a === 'q' && c === 'settings' && parts.length === 3) return updateSettings(b, body);
  }
  return fail(404, 'Not Found');
}

/** GET /public/questions (routers/public.py): resolved questions, figures only from 5 answers. */
function publicQuestions(): ApiPublicQuestion[] {
  return db.questions
    .filter((q) => q.status === 'resolved')
    .sort((x, y) => x.id.localeCompare(y.id))
    .map((q) => {
      const risk = getRisk(q.risk_id)!;
      const probabilities = [...latestAnswers(q.id).values()].map((r) => r.probability);
      const enough = probabilities.length >= MIN_GROUP_SIZE;
      const med = enough ? r2(median(probabilities)) : null;
      return {
        id: q.id,
        text: q.text,
        country: risk.country,
        risk_title: risk.title,
        deadline: q.deadline,
        outcome: q.outcome,
        expert_count: enough ? probabilities.length : null,
        group_median: med,
        simulated: q.id.startsWith('H'),
      };
    });
}

/** POST /moderator/questions/{id}/summarise. No ML code in the demo backend, so the summary is empty (as when ML fails). */
function summariseQuestion(id: string): ApiSummariseOut {
  const q = getQuestion(id) ?? fail(404, 'Question not found');
  const reasonCount = db.responses.filter((r) => r.question_id === id).length;
  const themes = emptyThemes();
  q.themes = JSON.stringify(themes);
  return { question_id: id, reason_count: reasonCount, themes };
}

/** Handle one request like the real API would: { status, body }. */
export function mockRequest(method: string, path: string, body?: unknown): MockResult {
  try {
    return { status: 200, body: structuredClone(route(method.toUpperCase(), path, body)) };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { detail: e.detail } };
    throw e;
  }
}
