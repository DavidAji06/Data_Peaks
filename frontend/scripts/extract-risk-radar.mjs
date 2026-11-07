#!/usr/bin/env node
// Extracts real ACAPS Risk Radar data into mock JSON for the frontend.
//   node scripts/extract-risk-radar.mjs
// Reads  ../../data/risk-radar-export.csv  (read-only)
// Writes mock/curated.json: curated similar risks and ranked risks in the backend API's shapes
// Deterministic: no Date.now(), no randomness. Target types: lib/types.ts.

import fs from 'node:fs';

const CSV_URL = new URL('../../data/risk-radar-export.csv', import.meta.url);
const OUT_DIR = new URL('../mock/', import.meta.url);

/** Constant "today" for the placeholder review-age score (never Date.now()). */
const REFERENCE_DATE = '2026-11-06';

// Risks selected on top of the 28 active ones.
const SIMILAR_IDS = ['R0248', 'R0998', 'R1002']; // similar-risk cards for R1043, in this order
// Two extra resolved risks for practice "replay" questions (Sudan, Libya are in the allowed country list):
//   R0002 Sudan, Materialised, High x 4, documented in "Hazard materialisation".
//   R0995 Libya, Not materialised, Low x 3, outcome stated by its latest UPDATE (24/11/2025).
const REPLAY_EXTRAS = [
  { id: 'R0002', status: 'Materialised' },
  { id: 'R0995', status: 'Not materialised' },
];
const UPDATES_FOR = new Set(['R1043', 'R1066', 'R1055']);
const SIMILARITY_PLACEHOLDERS = { R0248: 0.81, R0998: 0.74, R1002: 0.69 };
const SIGNAL_STRENGTH = { R1043: 0.82, R1066: 0.55 };
const DEFAULT_SIGNAL_STRENGTH = 0.2;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f.length || row.length) {
    row.push(f);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return { header, records: data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const round2 = (x) => Math.round(x * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy, dd.mm.yyyy or "d Month yyyy" at the start of s -> "YYYY-MM-DD" | null. */
function parseDate(s) {
  const t = String(s).trim();
  let d, m, y;
  let mm = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/);
  if (mm) {
    [d, m, y] = [+mm[1], +mm[2], +mm[3]];
  } else {
    mm = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})/);
    if (!mm || !MONTHS[mm[2].toLowerCase()]) return null;
    [d, m, y] = [+mm[1], MONTHS[mm[2].toLowerCase()], +mm[3]];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const BANDS = { 'very low': 'very_low', low: 'low', medium: 'medium', high: 'high', 'very high': 'very_high' };
function band(s) {
  const b = BANDS[collapse(s).toLowerCase()];
  if (!b) throw new Error(`Unknown probability "${s}"`);
  return b;
}

// Markdown links "[label](url)"; the url may hold one level of balanced parentheses and, in
// triggers, ends with an escaped "\)" (the backslash is dropped).
const LINK_SRC = String.raw`\[[^\]]*\]\((?:[^\s()]|\([^\s()]*\))+\)`;
function parseLinks(text) {
  const out = [];
  const re = /\[([^\]]*)\]\(((?:[^\s()]|\([^\s()]*\))+)\)/g;
  for (const m of String(text).matchAll(re)) {
    out.push({ label: collapse(m[1]), url: m[2].replace(/\\+$/, '') });
  }
  return out;
}

/** Sentences cut after ". " followed by an uppercase letter or digit (input is whitespace-collapsed). */
function sentences(text) {
  const t = collapse(text);
  const out = [];
  let start = 0;
  for (const m of t.matchAll(/\.\s+(?=[\p{Lu}\d])/gu)) {
    out.push(t.slice(start, m.index + 1));
    start = m.index + m[0].length;
  }
  if (start < t.length) out.push(t.slice(start));
  return out;
}

/** First 1-2 sentences, max 300 chars: two if they fit, else one, else a hard cut with an ellipsis. */
function firstSentences(text, max = 300) {
  const s = sentences(text);
  if (!s.length) return '';
  const two = s.slice(0, 2).join(' ');
  if (two.length <= max) return two;
  if (s[0].length <= max) return s[0];
  return s[0].slice(0, max - 1) + '…';
}

function rationaleSummary(text) {
  const first = sentences(text)[0] ?? '';
  return first.length > 320 ? first.slice(0, 319) + '…' : first;
}

// ---------------------------------------------------------------------------
// Rationale updates
// ---------------------------------------------------------------------------

const SOURCE_TAIL = new RegExp(String.raw`\(\s*${LINK_SRC}(?:\s*[,;]?\s*${LINK_SRC})*\s*\)\s*(\.?)\s*$`);

function parseUpdates(riskId, text) {
  const headers = [...String(text).matchAll(/^UPDATE\b[^\n]*$/gm)];
  const entries = headers.map((h, i) => {
    const date = parseDate(h[0].replace(/^UPDATE\s*/, ''));
    if (!date) throw new Error(`${riskId}: unparseable UPDATE header "${h[0]}"`);
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    let body = collapse(text.slice(h.index + h[0].length, end));
    let sources = [];
    const tail = body.match(SOURCE_TAIL);
    if (tail) {
      sources = parseLinks(tail[0]);
      body = body.slice(0, tail.index).trim();
      if (tail[1] && body && !/[.!?…]$/.test(body)) body += '.';
    }
    return { date, text: body, sources };
  });
  return entries.map((e, i) => [e, i]).sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : a[1] - b[1])).map(([e]) => e);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

const TRIGGER_LABELS = [
  'Title',
  'Description',
  'Sources',
  'Completion rate',
  'Completion rate history',
  'Quantitative objective to meet 100%',
  'Trend',
  'Trend history',
  'Date entered',
  'Last update',
];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\%]/g, '\\$&');

function parseTriggers(record) {
  const text = record['Triggers'];
  const out = [];
  const starts = [...text.matchAll(/^Trigger ID:/gm)].map((m) => m.index);
  starts.forEach((s, i) => {
    const block = text.slice(s, i + 1 < starts.length ? starts[i + 1] : text.length);
    const idm = block.match(/^Trigger ID:\s*(R\d+)\s*-\s*(T\d+)/);
    if (!idm) throw new Error(`${record['Risk ID']}: bad trigger id line "${block.split('\n')[0]}"`);
    if (idm[1] !== record['Risk ID']) throw new Error(`Trigger ${idm[2]} belongs to ${idm[1]} but sits under ${record['Risk ID']}`);

    // Find labels sequentially so stray "Yes:" style lines inside a value are never mistaken for labels.
    const found = [];
    let pos = block.indexOf('\n');
    for (const label of TRIGGER_LABELS) {
      const re = new RegExp(`^${escapeRe(label)}:`, 'm');
      const m = re.exec(block.slice(pos));
      if (m) {
        const start = pos + m.index;
        found.push({ label, start, valueStart: start + m[0].length });
        pos = start + m[0].length;
      }
    }
    const val = {};
    found.forEach((f, j) => {
      val[f.label] = block.slice(f.valueStart, j + 1 < found.length ? found[j + 1].start : block.length);
    });

    const t = { id: idm[2], riskId: record['Risk ID'], title: collapse(val['Title']), description: collapse((val['Description'] ?? '').replace(/^[\s:]+/, '')) };

    const rate = (val['Completion rate'] ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
    if (rate) t.completionRate = Math.round(parseFloat(rate[1]));

    const hist = [...(val['Completion rate history'] ?? '').matchAll(/^\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s*:\s*(\d+(?:\.\d+)?)\s*%/gm)];
    if (hist.length) {
      t.completionHistory = hist.map((h) => {
        const date = parseDate(h[1]);
        if (!date) throw new Error(`${t.id}: bad history date ${h[1]}`);
        return { date, rate: Math.round(parseFloat(h[2])) };
      });
    }

    let crit = collapse(val['Quantitative objective to meet 100%'] ?? '');
    crit = crit.replace(/^yes\s*[.,:\-–—]\s*/i, "").trim(); // "Yes." "Yes," "Yes:" "Yes -" in any case
    if (crit && !/^No\b/i.test(crit)) t.resolutionCriterion = crit;

    const sources = parseLinks(val['Sources'] ?? '');
    if (sources.length) t.sources = sources;

    const entered = parseDate(collapse(val['Date entered'] ?? ''));
    if (entered) t.dateEntered = entered;
    const updated = parseDate(collapse(val['Last update'] ?? ''));
    if (updated) t.lastUpdate = updated;

    out.push(t);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const { records } = parseCSV(fs.readFileSync(CSV_URL, 'utf8').replace(/^﻿/, ''));
const byId = new Map(records.map((r) => [r['Risk ID'].trim(), r]));
const STATUS = { active: 'active', materialised: 'materialised', 'not materialised': 'not_materialised' };
const statusOf = (r) => STATUS[collapse(r['Status']).toLowerCase()];

const activeRecords = records.filter((r) => statusOf(r) === 'active');
const selected = [
  ...activeRecords,
  ...SIMILAR_IDS.map((id) => byId.get(id)),
  ...REPLAY_EXTRAS.map((x) => {
    const r = byId.get(x.id);
    if (!r || collapse(r['Status']) !== x.status) throw new Error(`${x.id} is not "${x.status}" in the export`);
    return r;
  }),
];
if (selected.some((r) => !r)) throw new Error('A selected risk id is missing from the export');

const triggersByRisk = new Map();
const risks = [];
const triggers = [];

for (const r of selected) {
  const id = r['Risk ID'].trim();
  const status = statusOf(r);
  const trigs = parseTriggers(r);
  triggersByRisk.set(id, trigs);
  triggers.push(...trigs);

  const allUpdates = parseUpdates(id, r['Rationale update']);
  let lastReviewed = null;
  if (allUpdates.length) lastReviewed = allUpdates[0].date;
  else {
    const dates = trigs.map((t) => t.lastUpdate).filter(Boolean).sort();
    if (dates.length) lastReviewed = dates[dates.length - 1];
  }

  const impact = parseInt(r['Impact'], 10);
  if (!(impact >= 1 && impact <= 5)) throw new Error(`${id}: bad impact "${r['Impact']}"`);

  const risk = {
    id,
    title: collapse(r['Risk Title']),
    country: collapse(r['Country']),
    iso: collapse(r['ISO']),
    type: collapse(r['Risk Type']),
    probability: band(r['Probability']),
    impact,
    riskLevel: collapse(r['Risk Level']).toLowerCase(),
  };
  const trend = collapse(r['Risk trend']).toLowerCase();
  if (['improved', 'stable', 'deteriorated'].includes(trend)) risk.trend = trend;
  risk.status = status;
  risk.expectedExposure = r['Expected exposure'];
  risk.priorityNeeds = r['Expected priority needs'].split(',').map((s) => s.trim()).filter(Boolean);
  risk.rationaleSummary = rationaleSummary(r['Rationale']);
  risk.lastReviewed = lastReviewed;
  risk.triggerIds = trigs.map((t) => t.id);
  if (UPDATES_FOR.has(id)) risk.updates = allUpdates;

  if (status !== 'active') {
    const outcome = {};
    const what = { hazard: 'hazard', impact: 'impact', 'hazard and impact': 'hazard_and_impact' }[collapse(r['What materialised?']).toLowerCase()];
    if (what) outcome.what = what;
    const hazardText = collapse(r['Hazard materialisation']);
    const impactText = collapse(r['Impact materialisation description']);
    if (hazardText) outcome.hazardText = hazardText;
    if (impactText) outcome.impactText = impactText;
    if (!hazardText && allUpdates.length) outcome.closingNote = firstSentences(allUpdates[0].text);
    risk.outcome = outcome;
  }
  risks.push(risk);
}

const riskById = new Map(risks.map((r) => [r.id, r]));

// Similar risks for R1043
const similar = SIMILAR_IDS.map((id) => {
  const r = riskById.get(id);
  const rec = byId.get(id);
  let outcomeSummary;
  const hazard = collapse(rec['Hazard materialisation']);
  if (hazard) outcomeSummary = firstSentences(hazard);
  else outcomeSummary = firstSentences(parseUpdates(id, rec['Rationale update'])[0].text);
  return {
    forRiskId: 'R1043',
    riskId: id,
    title: r.title,
    country: r.country,
    similarity: SIMILARITY_PLACEHOLDERS[id],
    acapsProbability: r.probability,
    outcome: r.status,
    outcomeSummary,
  };
});

// Ranked risks (placeholder formula)
const MID = { very_low: 0.05, low: 0.2, medium: 0.5, high: 0.78, very_high: 0.95 };
const dayMs = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / dayMs);
const ranked = risks
  .filter((r) => r.status === 'active')
  .map((r) => {
    const mid = MID[r.probability];
    const impact = round2(r.impact / 5);
    const uncertainty = round2(1 - Math.abs(mid - 0.5) * 2);
    const reviewAge = r.lastReviewed === null ? 1 : round2(Math.min(1, daysBetween(r.lastReviewed, REFERENCE_DATE) / 90));
    const signalStrength = SIGNAL_STRENGTH[r.id] ?? DEFAULT_SIGNAL_STRENGTH;
    const score = round2(0.4 * signalStrength + 0.2 * uncertainty + 0.25 * impact + 0.15 * reviewAge);
    return {
      riskId: r.id,
      title: r.title,
      country: r.country,
      iso: r.iso,
      score,
      breakdown: { signalStrength, uncertainty, impact, reviewAge },
      modelProbability: mid,
      acapsProbability: r.probability,
      riskLevel: r.riskLevel,
      lastReviewed: r.lastReviewed,
    };
  })
  .sort((a, b) => b.score - a.score);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

// Output: mock/curated.json in the backend API's own shapes (snake_case, as in contracts/similar_risk.json and
// contracts/ranked_risk.json), so it goes through the same adapter as real API data. The frontend swaps these in
// while the backend still returns the contract placeholder samples for /similar and /risks/ranked.
const LABEL = { 'very_low': 'Very Low', low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very High' };
const OUTCOME = { materialised: 'Materialised', not_materialised: 'Not materialised' };
const curated = {
  _meta: {
    source: 'ACAPS Risk Radar export (data/risk-radar-export.csv), used under ACAPS terms of use',
    generatedBy: 'scripts/extract-risk-radar.mjs',
    synthetic: 'partly',
    note:
      `Real risk IDs, titles, ratings and outcome text. similarity, priority_score, score_breakdown and p_materialise are placeholders until the ML pipeline lands. ` +
      `Ranked placeholder formula: mid = {very_low:0.05, low:0.2, medium:0.5, high:0.78, very_high:0.95}[probability]; impact = Impact/5; uncertainty = round2(1 - abs(mid - 0.5) * 2); ` +
      `review_age = round2(min(1, days(last review to ${REFERENCE_DATE}) / 90)); signal_strength = 0.82 for R1043, 0.55 for R1066, else 0.2; ` +
      `priority_score = round2(0.4*signal + 0.2*uncertainty + 0.25*impact + 0.15*review_age); p_materialise = mid. ` +
      `risk_level, acaps_probability and last_reviewed are curated extras the API's ranked items don't have yet.`,
  },
  similar_risks: {
    R1043: similar.map((s) => ({
      risk_id: s.riskId,
      title: s.title,
      country: s.country,
      similarity: s.similarity,
      outcome: OUTCOME[s.outcome],
      what_happened: s.outcomeSummary,
      acaps_probability: LABEL[s.acapsProbability],
    })),
  },
  ranked_risks: ranked.map((r) => ({
    risk_id: r.riskId,
    title: r.title,
    country: r.country,
    p_materialise: r.modelProbability,
    priority_score: r.score,
    score_breakdown: {
      signal_strength: r.breakdown.signalStrength,
      uncertainty: r.breakdown.uncertainty,
      impact: r.breakdown.impact,
      review_age: r.breakdown.reviewAge,
    },
    risk_level: r.riskLevel.charAt(0).toUpperCase() + r.riskLevel.slice(1),
    acaps_probability: LABEL[r.acapsProbability],
    last_reviewed: r.lastReviewed,
  })),
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(new URL('curated.json', OUT_DIR), JSON.stringify(curated, null, 2) + '\n');
console.log(`curated.json: similar ${curated.similar_risks.R1043.length} (for R1043), ranked ${curated.ranked_risks.length} (from ${risks.length} risks, ${triggers.length} triggers)`);
