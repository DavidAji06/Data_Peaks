/**
 * In-memory demo database built from frontend/mock/*.json. Server-only, and imported by lib/api.ts only.
 *
 * Every file is checked when this module loads (also during `next build`), so a broken mock file fails
 * the build with a precise message instead of breaking a screen. Changes made during the demo (answers,
 * decisions, approvals) live in server memory until the server restarts.
 */
import 'server-only';

import alertsFile from '@/mock/alerts.json';
import decisionsFile from '@/mock/decisions.json';
import expertsFile from '@/mock/experts.json';
import invitationsFile from '@/mock/invitations.json';
import questionsFile from '@/mock/questions.json';
import rankedFile from '@/mock/ranked_risks.json';
import responsesFile from '@/mock/responses.json';
import risksFile from '@/mock/risks.json';
import similarFile from '@/mock/similar_risks.json';
import summariesFile from '@/mock/summaries.json';
import trackRecordsFile from '@/mock/track_records.json';
import triggersFile from '@/mock/triggers.json';
import { BANDS } from '@/lib/probability';
import type {
  Alert,
  Expert,
  ExpertResponse,
  Invitation,
  ModeratorSummary,
  Question,
  RankedRisk,
  Risk,
  SimilarRisk,
  TrackRecord,
  Trigger,
  UpdateDecision,
} from '@/lib/types';

export interface SimilarRiskLink extends SimilarRisk {
  forRiskId: string;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function check(ok: unknown, file: string, message: string): asserts ok {
  if (!ok) throw new Error(`mock/${file}: ${message}`);
}

const isOneOf = (value: unknown, allowed: readonly string[]): boolean =>
  typeof value === 'string' && allowed.includes(value);
const isIsoDate = (value: unknown): boolean =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
const isPercent = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
const isUnit = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1;

function unique(file: string, label: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const v of values) {
    check(!seen.has(v), file, `duplicate ${label} "${v}"`);
    seen.add(v);
  }
}

/** Deep copy, so demo changes never touch the imported JSON modules. */
const itemsOf = <T>(file: { items: unknown[] }): T[] => structuredClone(file.items) as T[];

export const MAX_REASON_LENGTH = 160;

// ---------------------------------------------------------------------------
// Load and check
// ---------------------------------------------------------------------------

const risks = itemsOf<Risk>(risksFile);
unique('risks.json', 'risk id', risks.map((r) => r.id));
for (const r of risks) {
  check(isOneOf(r.probability, BANDS), 'risks.json', `${r.id}: probability "${r.probability}"`);
  check([1, 2, 3, 4, 5].includes(r.impact), 'risks.json', `${r.id}: impact ${r.impact}`);
  check(isOneOf(r.riskLevel, ['low', 'medium', 'high']), 'risks.json', `${r.id}: riskLevel "${r.riskLevel}"`);
  check(isOneOf(r.status, ['active', 'materialised', 'not_materialised']), 'risks.json', `${r.id}: status "${r.status}"`);
  check(r.lastReviewed === null || isIsoDate(r.lastReviewed), 'risks.json', `${r.id}: lastReviewed "${r.lastReviewed}"`);
}
const riskById = new Map(risks.map((r) => [r.id, r]));

const triggers = itemsOf<Trigger>(triggersFile);
unique('triggers.json', 'trigger id', triggers.map((t) => t.id));
for (const t of triggers) {
  check(riskById.has(t.riskId), 'triggers.json', `${t.id}: unknown risk ${t.riskId}`);
  check(t.completionRate === undefined || isPercent(t.completionRate), 'triggers.json', `${t.id}: completionRate ${t.completionRate}`);
}
const triggerById = new Map(triggers.map((t) => [t.id, t]));
for (const r of risks) for (const id of r.triggerIds) check(triggerById.has(id), 'risks.json', `${r.id}: unknown trigger ${id}`);

const experts = itemsOf<Expert>(expertsFile);
unique('experts.json', 'expert id', experts.map((e) => e.id));
unique('experts.json', 'pseudonym', experts.map((e) => e.pseudonymId));
for (const e of experts) {
  check(e.synthetic === true, 'experts.json', `${e.pseudonymId}: every expert must be synthetic`);
  check(!e.displayName || e.displayName.includes('(synthetic)'), 'experts.json', `${e.pseudonymId}: display names must be marked "(synthetic)"`);
  check(isOneOf(e.anonymity, ['known_to_acaps', 'pseudonymous', 'anonymous']), 'experts.json', `${e.pseudonymId}: anonymity "${e.anonymity}"`);
  check(isOneOf(e.locale, ['en', 'fr']), 'experts.json', `${e.pseudonymId}: locale "${e.locale}"`);
  check(Number.isInteger(e.maxPromptsPerWeek) && e.maxPromptsPerWeek >= 1, 'experts.json', `${e.pseudonymId}: maxPromptsPerWeek`);
}
const expertByPseudonym = new Map(experts.map((e) => [e.pseudonymId, e]));

const questions = itemsOf<Question>(questionsFile);
unique('questions.json', 'question id', questions.map((q) => q.id));
for (const q of questions) {
  check(riskById.has(q.riskId), 'questions.json', `${q.id}: unknown risk ${q.riskId}`);
  check(!q.triggerId || triggerById.has(q.triggerId), 'questions.json', `${q.id}: unknown trigger ${q.triggerId}`);
  check(isOneOf(q.status, ['open', 'closed', 'resolved']), 'questions.json', `${q.id}: status "${q.status}"`);
  check(isOneOf(q.acapsProbability, BANDS), 'questions.json', `${q.id}: acapsProbability "${q.acapsProbability}"`);
  check(isIsoDate(q.deadline), 'questions.json', `${q.id}: deadline "${q.deadline}"`);
  check(q.status !== 'resolved' || typeof q.outcome === 'boolean', 'questions.json', `${q.id}: a resolved question needs an outcome`);
}
const questionById = new Map(questions.map((q) => [q.id, q]));

const invitations = itemsOf<Invitation>(invitationsFile);
unique('invitations.json', 'token', invitations.map((i) => i.token));
for (const i of invitations) {
  check(questionById.has(i.questionId), 'invitations.json', `${i.token}: unknown question ${i.questionId}`);
  check(expertByPseudonym.has(i.pseudonymId), 'invitations.json', `${i.token}: unknown expert ${i.pseudonymId}`);
}

const responses = itemsOf<ExpertResponse>(responsesFile);
unique('responses.json', 'response id', responses.map((r) => r.id));
const firstAnswers = new Set<string>();
for (const r of [...responses].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
  const key = `${r.questionId}|${r.pseudonymId}`;
  check(questionById.has(r.questionId), 'responses.json', `${r.id}: unknown question ${r.questionId}`);
  check(expertByPseudonym.has(r.pseudonymId), 'responses.json', `${r.id}: unknown expert ${r.pseudonymId}`);
  check(isPercent(r.probability), 'responses.json', `${r.id}: probability must be a whole number 0–100`);
  check(r.reason.length <= MAX_REASON_LENGTH, 'responses.json', `${r.id}: reason is ${r.reason.length} chars (max ${MAX_REASON_LENGTH})`);
  check(isOneOf(r.kind, ['initial', 'revision']), 'responses.json', `${r.id}: kind "${r.kind}"`);
  check(!r.theme || isOneOf(r.theme, ['agree', 'disagree', 'new_info']), 'responses.json', `${r.id}: theme "${r.theme}"`);
  check(isIsoDate(r.submittedAt), 'responses.json', `${r.id}: submittedAt`);
  if (r.kind === 'initial') {
    check(!firstAnswers.has(key), 'responses.json', `${r.id}: second first answer for ${key}`);
    firstAnswers.add(key);
  } else {
    check(firstAnswers.has(key), 'responses.json', `${r.id}: revision before a first answer for ${key}`);
  }
}

const alerts = itemsOf<Alert>(alertsFile);
unique('alerts.json', 'alert id', alerts.map((a) => a.id));
for (const a of alerts) {
  check(a.synthetic === true, 'alerts.json', `${a.id}: demo alerts must be marked synthetic`);
  check(riskById.has(a.riskId), 'alerts.json', `${a.id}: unknown risk ${a.riskId}`);
  check(triggerById.get(a.triggerId)?.riskId === a.riskId, 'alerts.json', `${a.id}: trigger ${a.triggerId} is not a trigger of ${a.riskId}`);
  check(isOneOf(a.strength, ['weak', 'moderate', 'strong']), 'alerts.json', `${a.id}: strength "${a.strength}"`);
  check(isOneOf(a.direction, ['up', 'down']), 'alerts.json', `${a.id}: direction "${a.direction}"`);
  check(isOneOf(a.status, ['pending', 'approved', 'rejected']), 'alerts.json', `${a.id}: status "${a.status}"`);
  check(isUnit(a.strengthScore) && (a.confidence === undefined || isUnit(a.confidence)), 'alerts.json', `${a.id}: scores must be 0–1`);
  check(!a.questionId || questionById.has(a.questionId), 'alerts.json', `${a.id}: unknown question ${a.questionId}`);
}

const similar = itemsOf<SimilarRiskLink>(similarFile);
for (const s of similar) {
  check(riskById.has(s.forRiskId), 'similar_risks.json', `unknown risk ${s.forRiskId}`);
  check(isOneOf(s.outcome, ['materialised', 'not_materialised']), 'similar_risks.json', `${s.riskId}: outcome "${s.outcome}"`);
  check(isUnit(s.similarity), 'similar_risks.json', `${s.riskId}: similarity must be 0–1`);
}

const ranked = itemsOf<RankedRisk>(rankedFile);
for (const r of ranked) {
  check(riskById.has(r.riskId), 'ranked_risks.json', `unknown risk ${r.riskId}`);
  check(isUnit(r.score) && Object.values(r.breakdown).every(isUnit), 'ranked_risks.json', `${r.riskId}: scores must be 0–1`);
}

const summaries = itemsOf<ModeratorSummary>(summariesFile);
for (const s of summaries) check(questionById.has(s.questionId), 'summaries.json', `unknown question ${s.questionId}`);

const decisions = itemsOf<UpdateDecision>(decisionsFile);

const trackRecords = itemsOf<Pick<TrackRecord, 'pseudonymId' | 'contributions'>>(trackRecordsFile);
for (const t of trackRecords) check(expertByPseudonym.has(t.pseudonymId), 'track_records.json', `unknown expert ${t.pseudonymId}`);

// ---------------------------------------------------------------------------
// The store (mutable for the demo)
// ---------------------------------------------------------------------------

export const db = {
  risks: riskById,
  triggers: triggerById,
  questions: questionById,
  experts: expertByPseudonym,
  invitations: new Map(invitations.map((i) => [i.token, i])),
  responses,
  alerts: new Map(alerts.map((a) => [a.id, a])),
  ranked: [...ranked].sort((a, b) => b.score - a.score),
  similar,
  summaries: new Map(summaries.map((s) => [s.questionId, s])),
  decisions,
  contributions: new Map(trackRecords.map((t) => [t.pseudonymId, t.contributions])),
};

export const similarFor = (riskId: string): SimilarRisk[] =>
  db.similar
    .filter((s) => s.forRiskId === riskId)
    .map((s) => ({
      riskId: s.riskId,
      title: s.title,
      country: s.country,
      similarity: s.similarity,
      ...(s.acapsProbability ? { acapsProbability: s.acapsProbability } : {}),
      outcome: s.outcome,
      outcomeSummary: s.outcomeSummary,
    }));

export const invitationsFor = (questionId: string): Invitation[] =>
  [...db.invitations.values()].filter((i) => i.questionId === questionId);

export const responsesFor = (questionId: string): ExpertResponse[] =>
  db.responses.filter((r) => r.questionId === questionId);
