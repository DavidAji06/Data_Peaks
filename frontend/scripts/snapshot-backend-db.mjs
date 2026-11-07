/**
 * Copies the backend's seeded demo database into frontend/mock/db.json (read-only access),
 * so the frontend's offline demo fallback serves the same data as the real API.
 *
 * Run after `python -m app.seed` whenever David changes the seed:  npm run mocks:snapshot
 * Rows keep the backend's own column names (snake_case). Random invite tokens for the practice
 * questions are replaced with placeholders; only the fixed demo-expert-* links are kept.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB = new URL('../../backend/data_peaks.db', import.meta.url);
const CONTRACTS = new URL('../../contracts/', import.meta.url);
const OUT = new URL('../mock/db.json', import.meta.url);

const db = new DatabaseSync(DB.pathname, { readOnly: true });
const all = (sql) => db.prepare(sql).all().map((row) => ({ ...row }));

const questions = all('select id, risk_id, alert_id, text, resolution_criteria, deadline, status, outcome from questions order by id');
const invites = all('select token, question_id, expert_id from invites order by question_id, expert_id').map((i) =>
  i.token.startsWith('demo-') ? i : { ...i, token: `practice-${i.question_id}-${i.expert_id}` },
);
const responses = all('select id, question_id, expert_id, probability, reason, round, created_at from responses order by id');
const alerts = all('select id, risk_id, trigger_id, report_title, report_source, report_url, published_at, direction, strength, evidence, status from alerts order by id');
const experts = all('select id, pseudonym, anonymity_level, country, topics from experts order by id');

// Risks the demo can reach: question risks, alert risks, active risks and the curated similar risks.
const wanted = new Set([...questions.map((q) => q.risk_id), ...alerts.map((a) => a.risk_id), 'R0248', 'R0998', 'R1002', 'R1066', 'R1055']);
const risks = all('select * from risks order by id').filter((r) => wanted.has(r.id) || r.status === 'Active');

const sample = (name) => JSON.parse(fs.readFileSync(new URL(`${name}.json`, CONTRACTS), 'utf8'));

const body = {
  _meta: {
    source: "Snapshot of the backend's seeded demo database (backend/data_peaks.db after `python -m app.seed`)",
    generatedBy: 'scripts/snapshot-backend-db.mjs',
    synthetic: 'partly',
    note: 'Risks are real ACAPS data. Experts, answers, alerts and Q001 are the backend seed\'s synthetic demo data. Practice-question tokens are placeholders. contract_samples are the placeholder items the API returns for /similar and /risks/ranked until the ML pipeline lands.',
  },
  experts,
  questions,
  invites,
  responses,
  alerts,
  risks,
  contract_samples: { similar_risk: sample('similar_risk'), ranked_risk: sample('ranked_risk') },
};
fs.writeFileSync(OUT, JSON.stringify(body, null, 2) + '\n');
console.log(
  `db.json: ${experts.length} experts, ${questions.length} questions, ${invites.length} invites, ${responses.length} responses, ${alerts.length} alerts, ${risks.length} risks`,
);
