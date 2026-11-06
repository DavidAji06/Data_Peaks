/**
 * The ONLY place screens get data from (frontend/CLAUDE.md §3.3).
 *
 * - Mock mode (default): reads frontend/mock through lib/server/mock-store.ts.
 * - Real mode (NEXT_PUBLIC_USE_MOCK=false): calls David's FastAPI at NEXT_PUBLIC_API_URL. The alert
 *   endpoints are wired through lib/adapters.ts; the rest throw "not wired yet" with the endpoint we need.
 *
 * Every function returns data already filtered for its viewer by lib/anonymity.ts.
 * Server-only: call it from Server Components and Server Actions. Client components get data as props
 * or as a Server Action's return value. That is how other experts' answers stay off the device until
 * this expert has answered (blind-answer lock).
 *
 * Env (both optional; .env files are gitignored, so nothing relies on them existing):
 * - NEXT_PUBLIC_USE_MOCK: 'false' switches to the real API; unset or anything else = mock.
 * - NEXT_PUBLIC_API_URL: base URL of the real API, e.g. http://localhost:8000
 */
import 'server-only';

import { alertFromWire } from './adapters';
import { audiencePreview, toSelfView, toViewerShape, type QuestionData } from './anonymity';
import type { WireAlert } from './contracts';
import { GroupLockedError, ValidationError } from './errors';
import { calibration, meanBrier, toWholePercent, type ResolvedForecast } from './probability';
import { db, invitationsFor, MAX_REASON_LENGTH, responsesFor, similarFor } from './server/mock-store';
import type {
  Alert,
  AnonymityLevel,
  AudiencePreview,
  DecisionKind,
  Expert,
  ExpertQuestionView,
  ExpertResponse,
  GroupView,
  Locale,
  ModeratorQuestionView,
  ModeratorSummary,
  MyProfileView,
  PublicOutcome,
  Question,
  RankedRisk,
  Risk,
  SelfView,
  TrackRecord,
  Trigger,
  UpdateDecision,
} from './types';

export { GroupLockedError, ValidationError, MAX_REASON_LENGTH };

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** The expert link used in the pitch. In the demo, /me shows this expert. */
export const DEMO_TOKEN = 'demo-token';

// ---------------------------------------------------------------------------
// Real API plumbing
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set (needed when NEXT_PUBLIC_USE_MOCK=false).');
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  const res = await fetch(`${API_URL.replace(/\/$/, '')}${path}`, { ...init, headers });
  if (!res.ok) throw new HttpError(res.status, `${init?.method ?? 'GET'} ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

/** Endpoints the team plan doesn't define yet. Each message names what we need from the backend. */
function notWiredYet(endpoint: string): never {
  throw new Error(`Real API not wired yet: ${endpoint}. TODO: agree it with David, then map it here.`);
}

// ---------------------------------------------------------------------------
// Input checks (the server re-checks everything, whatever the UI did)
// ---------------------------------------------------------------------------

function checkProbability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError('Probability must be between 0 and 100.', 'probability');
  }
  return toWholePercent(value);
}

/** One line, at most MAX_REASON_LENGTH characters. */
function checkReason(value: unknown, required: boolean): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (required && text === '') throw new ValidationError('A short reason is required.', 'reason');
  if (text.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`The reason is longer than ${MAX_REASON_LENGTH} characters.`, 'reason');
  }
  return text;
}

function checkText(value: unknown, field: string, max: number, required = true): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && text === '') throw new ValidationError(`${field} is required.`, field);
  if (text.length > max) throw new ValidationError(`${field} is longer than ${max} characters.`, field);
  return text;
}

function checkIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} must be a date (YYYY-MM-DD).`, field);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function invite(token: string): { expert: Expert; question: Question } | null {
  const inv = db.invitations.get(token);
  const expert = inv && db.experts.get(inv.pseudonymId);
  const question = inv && db.questions.get(inv.questionId);
  return expert && question ? { expert, question } : null;
}

const withSimilar = (q: Question): Question =>
  q.similarRisks.length > 0 ? q : { ...q, similarRisks: similarFor(q.riskId) };

const latestDecision = (questionId: string): UpdateDecision | null =>
  db.decisions.filter((d) => d.questionId === questionId).at(-1) ?? null;

function questionData(questionId: string): QuestionData | null {
  const q = db.questions.get(questionId);
  const risk = q && db.risks.get(q.riskId);
  if (!q || !risk) return null;
  return {
    question: withSimilar(q),
    risk: { id: risk.id, title: risk.title, country: risk.country },
    panel: invitationsFor(questionId).flatMap((i) => db.experts.get(i.pseudonymId) ?? []),
    responses: responsesFor(questionId),
    summary: db.summaries.get(questionId) ?? null,
    decision: latestDecision(questionId),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Expert
// ---------------------------------------------------------------------------

/** All invite tokens (for generateStaticParams on /q/[token]). */
export async function listInviteTokens(): Promise<string[]> {
  if (!USE_MOCK) notWiredYet('GET /invitations (token list for prerendering)');
  return [...db.invitations.keys()];
}

/** What /q/[token] shows before answering: the question and this expert's own settings. No group data. */
export async function getQuestionByToken(token: string): Promise<ExpertQuestionView | null> {
  if (!USE_MOCK) notWiredYet('GET /invitations/{token}');
  const found = invite(token);
  if (!found) return null;
  const { expert, question } = found;
  const risk = db.risks.get(question.riskId)!;
  const trigger = question.triggerId ? db.triggers.get(question.triggerId) : undefined;
  return {
    token,
    question: withSimilar(question),
    risk: {
      id: risk.id,
      title: risk.title,
      country: risk.country,
      probability: risk.probability,
      impact: risk.impact,
      riskLevel: risk.riskLevel,
      ...(risk.trend ? { trend: risk.trend } : {}),
    },
    ...(trigger
      ? {
          trigger: {
            id: trigger.id,
            title: trigger.title,
            ...(trigger.completionRate !== undefined ? { completionRate: trigger.completionRate } : {}),
            ...(trigger.completionHistory ? { completionHistory: trigger.completionHistory } : {}),
            ...(trigger.lastUpdate ? { lastUpdate: trigger.lastUpdate } : {}),
          },
        }
      : {}),
    self: toSelfView(expert),
  };
}

/** Records this expert's first answer. Sending it again (e.g. from the offline outbox) returns the stored one. */
export async function submitResponse(token: string, input: { probability: number; reason: string }): Promise<ExpertResponse> {
  const probability = checkProbability(input.probability);
  const reason = checkReason(input.reason, true);
  // Real API: POST /questions/{id}/responses with responseToWire(...). Needs token → expert/question first.
  if (!USE_MOCK) notWiredYet('POST /questions/{id}/responses (needs the invite token resolved first)');
  const found = invite(token);
  if (!found) throw new ValidationError('This link is not valid.', 'token');
  const { expert, question } = found;
  if (question.status !== 'open') throw new ValidationError('This question is closed.', 'question');

  const existing = db.responses.find(
    (r) => r.questionId === question.id && r.pseudonymId === expert.pseudonymId && r.kind === 'initial',
  );
  if (existing) return existing;

  const response: ExpertResponse = {
    id: `resp-${crypto.randomUUID()}`,
    questionId: question.id,
    pseudonymId: expert.pseudonymId,
    probability,
    reason,
    kind: 'initial',
    submittedAt: new Date().toISOString(),
    anonymity: expert.anonymity,
  };
  db.responses.push(response);
  return response;
}

/** The group view for this expert. Throws GroupLockedError until their own first answer exists. */
export async function getGroupView(questionId: string, token: string): Promise<GroupView> {
  // Real API: GET /questions/{id}/group (locked server-side until the viewer has answered), then
  // groupViewFromWire(); a 403/423 from the API maps to GroupLockedError.
  if (!USE_MOCK) notWiredYet('GET /questions/{id}/group (needs the invite token as credential)');
  const found = invite(token);
  if (!found || found.question.id !== questionId) throw new GroupLockedError(); // an unknown link unlocks nothing
  return toViewerShape(questionData(questionId)!, 'expert', found.expert);
}

/** Stores a revision separately from the first answer. */
export async function submitRevision(token: string, input: { probability: number; reason?: string }): Promise<ExpertResponse> {
  const probability = checkProbability(input.probability);
  const reason = checkReason(input.reason ?? '', false);
  if (!USE_MOCK) notWiredYet('POST /questions/{id}/revision (needs the invite token resolved first)');
  const found = invite(token);
  if (!found) throw new ValidationError('This link is not valid.', 'token');
  const { expert, question } = found;
  if (question.status !== 'open') throw new ValidationError('This question is closed.', 'question');
  const answered = db.responses.some(
    (r) => r.questionId === question.id && r.pseudonymId === expert.pseudonymId && r.kind === 'initial',
  );
  if (!answered) throw new GroupLockedError('Submit a first answer before revising.');

  const revision: ExpertResponse = {
    id: `resp-${crypto.randomUUID()}`,
    questionId: question.id,
    pseudonymId: expert.pseudonymId,
    probability,
    reason,
    kind: 'revision',
    submittedAt: new Date().toISOString(),
    anonymity: expert.anonymity,
  };
  db.responses.push(revision);
  return revision;
}

const DECISION_EN: Record<DecisionKind, string> = {
  keep: 'kept the current rating',
  raise_probability: 'raised the probability',
  lower_probability: 'lowered the probability',
  update_trigger: 'updated a trigger',
  add_trigger: 'added a trigger',
};

/** "How your input was used": decisions ACAPS took on rounds this expert answered. Never invented. */
function contributionsFor(pseudonymId: string): TrackRecord['contributions'] {
  const answered = new Set(
    db.responses.filter((r) => r.pseudonymId === pseudonymId && r.kind === 'initial').map((r) => r.questionId),
  );
  const derived = db.decisions
    .filter((d) => d.questionId && answered.has(d.questionId))
    .map((d) => ({
      questionId: d.questionId!,
      usedFor: `ACAPS ${DECISION_EN[d.decision]}${
        d.triggerId && d.fromRate !== undefined && d.toRate !== undefined ? ` (${d.triggerId}: ${d.fromRate}% → ${d.toRate}%)` : ''
      } on ${d.decidedAt.slice(0, 10)}.`,
      decision: {
        decision: d.decision,
        decidedAt: d.decidedAt,
        ...(d.triggerId ? { triggerId: d.triggerId } : {}),
        ...(d.fromRate !== undefined ? { fromRate: d.fromRate } : {}),
        ...(d.toRate !== undefined ? { toRate: d.toRate } : {}),
      },
    }));
  return [...(db.contributions.get(pseudonymId) ?? []), ...derived].reverse();
}

/** The /me page: own settings, answer history and track record (from resolved practice questions). */
export async function getMyProfile(token: string = DEMO_TOKEN): Promise<MyProfileView | null> {
  if (!USE_MOCK) notWiredYet('GET /me (expert profile and track record)');
  const found = invite(token);
  if (!found) return null;
  const e = found.expert;

  const mine = db.responses.filter((r) => r.pseudonymId === e.pseudonymId);
  const questionIds = [...new Set(mine.map((r) => r.questionId))];
  const history = questionIds
    .map((qid) => {
      const q = db.questions.get(qid)!;
      const first = mine.find((r) => r.questionId === qid && r.kind === 'initial');
      const rev = mine.filter((r) => r.questionId === qid && r.kind === 'revision').at(-1);
      return {
        questionId: qid,
        questionText: q.text,
        riskId: q.riskId,
        replay: q.replay === true,
        status: q.status,
        ...(q.outcome !== undefined ? { outcome: q.outcome } : {}),
        ...(first ? { initial: first.probability, reason: first.reason, submittedAt: first.submittedAt } : {}),
        ...(rev ? { revision: rev.probability } : {}),
      };
    })
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

  const resolved: ResolvedForecast[] = history.flatMap((h) => {
    const p = h.revision ?? h.initial;
    return h.status === 'resolved' && h.outcome !== undefined && p !== undefined ? [{ probability: p, outcome: h.outcome }] : [];
  });

  return {
    self: {
      ...toSelfView(e),
      ...(e.displayName ? { displayName: e.displayName } : {}), // the expert always sees their own name
      profile: e.profile,
      countries: e.countries,
      topics: e.topics,
      maxPromptsPerWeek: e.maxPromptsPerWeek,
    },
    history,
    trackRecord: {
      pseudonymId: e.pseudonymId,
      resolvedCount: resolved.length,
      meanBrier: meanBrier(resolved),
      calibration: calibration(resolved),
      contributions: contributionsFor(e.pseudonymId),
    },
  };
}

/** Changing the level applies to future answers (past answers keep the stricter level; see lib/anonymity.ts). */
export async function setMyAnonymity(token: string, level: AnonymityLevel): Promise<SelfView> {
  if (!['known_to_acaps', 'pseudonymous', 'anonymous'].includes(level)) throw new ValidationError('Unknown anonymity level.', 'anonymity');
  if (!USE_MOCK) notWiredYet('PATCH /me (anonymity)');
  const found = invite(token);
  if (!found) throw new ValidationError('This link is not valid.', 'token');
  found.expert.anonymity = level;
  return toSelfView(found.expert);
}

export async function setMyLocale(token: string, locale: Locale): Promise<SelfView> {
  if (locale !== 'en' && locale !== 'fr') throw new ValidationError('Unknown language.', 'locale');
  if (!USE_MOCK) notWiredYet('PATCH /me (language)');
  const found = invite(token);
  if (!found) throw new ValidationError('This link is not valid.', 'token');
  found.expert.locale = locale;
  return toSelfView(found.expert);
}

export async function setMyContactLimit(token: string, maxPromptsPerWeek: number): Promise<number> {
  if (!Number.isInteger(maxPromptsPerWeek) || maxPromptsPerWeek < 1 || maxPromptsPerWeek > 7) {
    throw new ValidationError('Choose between 1 and 7 questions per week.', 'maxPromptsPerWeek');
  }
  if (!USE_MOCK) notWiredYet('PATCH /me (contact limit)');
  const found = invite(token);
  if (!found) throw new ValidationError('This link is not valid.', 'token');
  found.expert.maxPromptsPerWeek = maxPromptsPerWeek;
  return maxPromptsPerWeek;
}

// ---------------------------------------------------------------------------
// Moderator (ACAPS)
// ---------------------------------------------------------------------------

export interface AlertDetail {
  alert: Alert;
  risk: Risk;
  trigger?: Trigger;
  audience: AudiencePreview;
}

const STATUS_ORDER: Record<Alert['status'], number> = { pending: 0, approved: 1, rejected: 2 };
const STRENGTH_ORDER: Record<Alert['strength'], number> = { strong: 0, moderate: 1, weak: 2 };

/** Triage order: pending first, strongest first, then newest. */
export async function getAlerts(): Promise<Alert[]> {
  const alerts = USE_MOCK ? [...db.alerts.values()] : (await http<WireAlert[]>('/alerts')).map((w) => alertFromWire(w));
  return alerts.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

export async function listAlertIds(): Promise<string[]> {
  if (!USE_MOCK) notWiredYet('GET /alerts (ids for prerendering)');
  return [...db.alerts.keys()];
}

export async function getAlertDetail(id: string): Promise<AlertDetail | null> {
  if (!USE_MOCK) notWiredYet('GET /alerts/{id}');
  const alert = db.alerts.get(id);
  const risk = alert && db.risks.get(alert.riskId);
  if (!alert || !risk) return null;
  const trigger = db.triggers.get(alert.triggerId);
  return {
    alert,
    risk,
    ...(trigger ? { trigger } : {}),
    audience: audiencePreview([...db.experts.values()], risk.country),
  };
}

export interface AlertDecisionInput {
  action: 'approve' | 'reject';
  note?: string; // required when rejecting
  draft?: Alert['draftQuestion']; // the moderator's edited question, when approving
}

/** Approve (sends the question to the panel, respecting contact limits) or reject with a reason. */
export async function decideAlert(id: string, input: AlertDecisionInput): Promise<Alert> {
  if (input.action !== 'approve' && input.action !== 'reject') throw new ValidationError('Unknown action.', 'action');
  if (!USE_MOCK) {
    // Planned endpoint POST /alerts/{id}/decision. The body shape is our proposal: confirm with David.
    const wire = await http<WireAlert>(`/alerts/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decision: input.action,
        note: input.note ?? null,
        draft_question: input.draft
          ? { text: input.draft.text, resolution_criteria: input.draft.resolutionCriteria, deadline: input.draft.deadline }
          : null,
      }),
    });
    return alertFromWire(wire, input.draft);
  }

  const alert = db.alerts.get(id);
  if (!alert) throw new ValidationError('Unknown alert.', 'id');
  if (alert.status !== 'pending') return alert; // already decided: repeat clicks change nothing

  if (input.action === 'reject') {
    const rejected: Alert = { ...alert, status: 'rejected', decisionNote: checkText(input.note, 'note', 300) };
    db.alerts.set(id, rejected);
    return rejected;
  }

  const draft = input.draft
    ? {
        text: checkText(input.draft.text, 'text', 400),
        resolutionCriteria: checkText(input.draft.resolutionCriteria, 'resolutionCriteria', 1000),
        deadline: checkIsoDate(input.draft.deadline, 'deadline'),
      }
    : alert.draftQuestion;

  let questionId = alert.questionId;
  if (!questionId) {
    const risk = db.risks.get(alert.riskId)!;
    questionId = `Q-${alert.riskId}-${alert.triggerId}`;
    if (db.questions.has(questionId)) questionId = `${questionId}-${db.questions.size + 1}`;
    const reviewDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    db.questions.set(questionId, {
      id: questionId,
      riskId: alert.riskId,
      triggerId: alert.triggerId,
      ...draft,
      status: 'open',
      context: { triggerUpdate: alert.evidence.summary, evidence: [alert.evidence] },
      similarRisks: similarFor(alert.riskId),
      acapsProbability: risk.probability,
      reviewDate,
    });
  }
  // Experts reached by this question use one of their weekly prompts.
  const risk = db.risks.get(alert.riskId)!;
  const countries = risk.country.split(',').map((c) => c.trim());
  for (const e of db.experts.values()) {
    if (e.countries.some((c) => countries.includes(c)) && e.promptsThisWeek < e.maxPromptsPerWeek) e.promptsThisWeek++;
  }

  const approved: Alert = { ...alert, status: 'approved', draftQuestion: draft, questionId };
  db.alerts.set(id, approved);
  return approved;
}

export async function getRankedRisks(): Promise<RankedRisk[]> {
  if (!USE_MOCK) notWiredYet('ranked_risk.json from the risk-ranking model');
  return db.ranked;
}

export async function listRiskIds(): Promise<string[]> {
  if (!USE_MOCK) notWiredYet('GET /risks (ids for prerendering)');
  return db.ranked.map((r) => r.riskId);
}

export async function getRisk(id: string): Promise<Risk | null> {
  if (!USE_MOCK) notWiredYet('GET /risks/{id}');
  return db.risks.get(id) ?? null;
}

export async function getTriggers(riskId: string): Promise<Trigger[]> {
  if (!USE_MOCK) notWiredYet('GET /risks/{id}/triggers');
  const risk = db.risks.get(riskId);
  return risk ? risk.triggerIds.flatMap((id) => db.triggers.get(id) ?? []) : [];
}

/** Live (non-practice) questions about a risk. */
export async function getQuestionsForRisk(riskId: string): Promise<Question[]> {
  if (!USE_MOCK) notWiredYet('GET /questions?risk_id=');
  return [...db.questions.values()].filter((q) => q.riskId === riskId && !q.replay).map(withSimilar);
}

/** Every answer by pseudonym, initial vs revised distributions. Names only for experts known to ACAPS. */
export async function getModeratorView(questionId: string): Promise<ModeratorQuestionView | null> {
  if (!USE_MOCK) notWiredYet('GET /questions/{id}/responses (moderator)');
  const data = questionData(questionId);
  return data ? toViewerShape(data, 'moderator') : null;
}

export async function getSummary(questionId: string): Promise<ModeratorSummary | null> {
  if (!USE_MOCK) notWiredYet('GET /questions/{id}/summary');
  return db.summaries.get(questionId) ?? null;
}

/** The moderator edits and/or approves the AI draft. Only approved themes reach the public page. */
export async function saveSummary(questionId: string, input: { approved: boolean; draft?: string }): Promise<ModeratorSummary> {
  if (!USE_MOCK) notWiredYet('PUT /questions/{id}/summary');
  const current = db.summaries.get(questionId);
  if (!current) throw new ValidationError('No summary for this question.', 'questionId');
  const updated: ModeratorSummary = {
    ...current,
    approvedByModerator: input.approved === true,
    ...(input.draft !== undefined ? { draft: checkText(input.draft, 'draft', 2000) } : {}),
  };
  db.summaries.set(questionId, updated);
  return updated;
}

export interface DecisionInput {
  riskId: string;
  questionId?: string;
  decision: DecisionKind;
  note: string;
  triggerId?: string; // required for update_trigger
  toRate?: number; // required for update_trigger, 0–100
}

/** Records ACAPS's decision in the audit log; "update trigger" also changes the trigger's completion. */
export async function saveDecision(input: DecisionInput): Promise<UpdateDecision> {
  const kinds: DecisionKind[] = ['keep', 'raise_probability', 'lower_probability', 'update_trigger', 'add_trigger'];
  if (!kinds.includes(input.decision)) throw new ValidationError('Unknown decision.', 'decision');
  const note = checkText(input.note, 'note', 500, false);
  if (!USE_MOCK) notWiredYet('POST /risks/{id}/decisions');
  if (!db.risks.has(input.riskId)) throw new ValidationError('Unknown risk.', 'riskId');
  if (input.questionId && !db.questions.has(input.questionId)) throw new ValidationError('Unknown question.', 'questionId');

  const decidedAt = new Date().toISOString();
  let change: Pick<UpdateDecision, 'triggerId' | 'fromRate' | 'toRate'> = {};
  if (input.decision === 'update_trigger') {
    const trigger = input.triggerId ? db.triggers.get(input.triggerId) : undefined;
    if (!trigger || trigger.riskId !== input.riskId) throw new ValidationError('Choose a trigger of this risk.', 'triggerId');
    const toRate = checkProbability(input.toRate);
    change = { triggerId: trigger.id, fromRate: trigger.completionRate ?? 0, toRate };
    trigger.completionRate = toRate;
    trigger.completionHistory = [...(trigger.completionHistory ?? []), { date: today(), rate: toRate }];
    trigger.lastUpdate = today();
  }

  const decision: UpdateDecision = {
    riskId: input.riskId,
    ...(input.questionId ? { questionId: input.questionId } : {}),
    decision: input.decision,
    note,
    decidedAt,
    ...change,
  };
  db.decisions.push(decision);
  return decision;
}

/** The audit log for a risk, newest first. */
export async function getDecisions(riskId: string): Promise<UpdateDecision[]> {
  if (!USE_MOCK) notWiredYet('GET /risks/{id}/decisions');
  return db.decisions.filter((d) => d.riskId === riskId).reverse();
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function listPublicQuestionIds(): Promise<string[]> {
  if (!USE_MOCK) notWiredYet('GET /outcomes (ids for prerendering)');
  return [...db.questions.values()].filter((q) => !q.replay).map((q) => q.id);
}

/** Aggregates and moderator-approved themes only; nothing individual. */
export async function getPublicOutcome(questionId: string): Promise<PublicOutcome | null> {
  if (!USE_MOCK) notWiredYet('GET /outcomes/{questionId}');
  const q = db.questions.get(questionId);
  if (!q || q.replay) return null;
  return toViewerShape(questionData(questionId)!, 'public');
}
