# Impact scoring for ACAPS Humanitarian Access Events — handoff note

Status as of 2026-11-07, branch `data-ranking`. Owner: Vlad (data & ranking).

## Goal

Give each of the 14,847 ACAPS Humanitarian Access Events Risk Radar–style scores:
**exposure (1–5)**, **intensity (1–5)** and **impact** (ACAPS chart lookup), using the
methodology in `references/` (ACAPS *Introduction to Risk Analysis Methodology*, May 2019,
pp. 9–10).

## Current state (use this)

**Every event is scored directly by the LLM; prompt v6 (= v5 + killing rule) is frozen.**
File: `data/processed/access_events_scored_v6.csv` (columns: scores, `explicit_pin`,
`scope_type`, `brief_reasoning`, `impact_score`, `impact_label`, `source`). `source = llm_v6`
for the 3,833 events that mention deaths/killings (re-scored with v6), `llm_v5` for the other
11,014 (v6 only changes killing rules, so their v5 label stands). v5 labels are kept in
`llm_labels_all_v5_backup.jsonl` and `access_events_scored_v5.csv`.

```
all 14,847 events ──► GreenPT deepseek-v4.1-flash, prompt v5, thinking OFF ──► I, E
3,833 mention deaths ──► same model, prompt v6 (killing rule) ───────────────► I, E (replace v5)
                                                                          │
                                       impact = ACAPS chart[exposure, intensity]
```

See **v6: killing rule** below for the rule, validation and the changes it made.

Impact distribution (old pipeline → v5): Very Low 3,667 → 4,081 · Low 8,048 → 8,775 ·
Moderate 2,185 → 1,376 · Significant 876 → 587 · Major 71 → 28. Half of the events keep
the same impact; where it changes v5 is more often lower (vague country-wide texts are no
longer inflated).

**New events (~230/month):** label them with the LLM (≈ $0.04/month). The LightGBM student
is only an offline fallback (see below); it is not needed for cost.

## How the prompt was chosen

1. **Gold set** `data/processed/gold_labels.csv` (80 events, column `rater`):
   - `tune` 40 (3 Vlad, 37 Claude) — used to iterate prompts;
   - `test` 20 (10 Vlad, 10 Claude) — held out until a prompt was frozen;
   - `test2` 10 (Claude) — fresh test after the v5 exposure fix;
   - `final10` 10 (Vlad) — newest events, one final human check of the finished pipeline.
   Claude scored blind from the text; on the 10 events both scored, Vlad vs Claude agree
   exactly 60% (I) / 60% (E), within one level 80% / 90%. That is the realistic ceiling.
   **Caveat:** most gold labels are Claude's, not Vlad's.
2. **Prompt versions** in `ml/prompts/versions/` (each run ≈ $0.007 on 40 events):

   | Version | Change | Tune: I exact / qwk | Tune: E exact / qwk |
   |---|---|---|---|
   | v1 | original | 48% / 0.74 (bias +0.38) | 57% / 0.89 |
   | v2 | strict rules | 50% / 0.63 | 80% / 0.85 (big misses) |
   | v3 | score the consequence | 68–75% / 0.83 | 55–57% / 0.87 |
   | v4 | + explicit-number rule | 65–70% / 0.80–0.83 | 60–62% / 0.87–0.90 |
   | **v5** | softer exposure rules | 62–70% / 0.77–0.82 | **68–70% / 0.89–0.90** |

   Ranges = two runs with shuffled batches; run-to-run noise ≈ ±7 points.
   v4 failed the held-out test on exposure (bias −0.55) → v5. v5 = `ml/prompts/silver_labels.md`.
   Key rules: killings ≥ 3 regardless of perpetrator; score the consequence for people, not the
   constraint type; `country_wide` alone caps exposure at 3; exposure = people needing help
   because of the event; stated numbers/percentages use the bands exactly.
3. **Held-out results (v5):** test2 (fresh) I 70% exact / 100% within-1, E 50% / 100%;
   test I 70% / 95%, E 60% / 95% (v5 design saw the test misses, so test2 is the clean one).
   v1 on the same events: E bias +0.4, within-1 80–90%.

## v6: killing rule (2026-11-07)

**Rule (Vlad, ACAPS Severe = "excess mortality, grave violations of human rights"):** killings
by anyone (state forces, police, armed groups, gangs, mines/IEDs), and deaths from disasters
or disease, are scored by the number of deaths:
- exactly one person killed and nothing else serious → **3** (avoids false positives);
- two or more killed, or an unspecified plural ("civilians were killed", "killings") → **≥ 4**;
- mass or widespread mortality (mass killings, thousands dead, famine) → **5**.
"Casualties"/injuries without stated deaths and death threats are not killings. Exposure
rules unchanged. Prompt: `ml/prompts/versions/v6_killings.md` = `v6_final_frozen.md` =
`ml/prompts/silver_labels.md`.

**Gold set updated first** (Vlad's OK): of 18 gold events mentioning deaths, 5 Claude labels
went 3 → 4 (G07, G22, G25, G56, G58: 4–64 deaths each, `notes` column says so). Single-death
events G01, G40, G41 stay 3. Splits unchanged.

**Tune split (40, updated gold), shuffled runs:**

| | I exact | I qwk | I bias | E exact | E qwk |
|---|---|---|---|---|---|
| v5 (3 runs) | 62 / 65 / 65% | 0.78 / 0.80 / 0.81 | −0.25 / −0.15 / −0.15 | 68 / 70 / 55% | 0.90 / 0.89 / 0.85 |
| **v6** (2 runs) | **78 / 72%** | **0.88 / 0.86** | +0.07 / −0.03 | 70 / 48% | 0.89 / 0.76 |

On the 33 non-killing events v6 changes as many labels as v5 changes between its own runs
(intensity 2–8 vs 6, exposure 4–12 vs 5–12): no drift beyond noise. The low exposure run
(48%) is batch noise: v5 on the same shuffle also drops (55%), and the misses (G09, G20, G37)
are wide-area events that v5 also scores unstably.

**Held-out, run once after freezing (`--final`):**

| | test (20): I exact / qwk | E exact / qwk | test2 (10): I exact / w1 | E exact / w1 |
|---|---|---|---|---|
| v5 | 55% / 0.52 | 60% / 0.79 | 70% / 100% | 50% / 100% |
| **v6** | **75% / 0.72** | 60% / 0.79 | 50% / 100% | 50% / 80% |

test: all 5 killing events right with v6 (v5: 2/5). test2 got worse, but only 1 of its 10
events mentions deaths (scored correctly) and the set is tiny; the changes are batch noise on
non-killing events. Reported as is.

**Re-scoring:** only events whose text matches `KILL_REGEX` in `relabel_all.py` (kill/killed/
killing(s)/dead/death(s)/fatality(ies) = 3,230 events, plus died/murder/massacre/slain/executed/
casualties/"claimed … lives" = 3,833). A full relabel was not needed (no drift on non-killing
events above). `python -m ml.pipeline.relabel_all --subset killings` (154 calls, $0.73,
0 failures, ~3 min); `--export-only` rebuilds the CSV.

| Intensity (all events) | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| v5 | 1,112 | 4,369 | 7,930 | 1,406 | 30 |
| v6 | 1,109 | 4,344 | 6,125 | **3,079** | **190** |

In the subset: 1,794 events 3 → 4, 147 events 4 → 5, 17 events 4 → 3; exposure unchanged on
78% (mean 2.05 → 2.10).

| Impact | Very Low | Low | Moderate | Significant | Major |
|---|---|---|---|---|---|
| v5 | 4,081 | 8,775 | 1,376 | 587 | 28 |
| v6 | 4,080 | 7,813 | 2,180 | 642 | 132 |

91% of events keep their impact level; in the subset 1,249 go up, 102 go down.

**Known limits of v6:** some "one death + injuries" texts still get 4 (e.g. "an NGO driver was
killed and two aid workers injured"); 167 of 221 one-death-looking texts stay 3. Some single
strikes with ~160–400 dead get 5 (rule says thousands); arguable as "mass killings".

**Student retrained on v6 labels** (time split, newest 20% = 2,953 events, gold excluded):

| Student vs LLM | Exact | Within 1 | QWK |
|---|---|---|---|
| Intensity (v5 → v6 labels) | 68% → 69% | 99% → 98% | 0.62 → **0.73** |
| Exposure (v5 → v6 labels) | 69% → 67% | 97% → 97% | 0.81 → 0.79 |

Recall of intensity 4 rose from 39% to 72% (434/603); it still never predicts 5 (37 true 5s).
Routing 20% to the LLM: 74% / 70% exact on accepted (I / E).

**Hand check (10 realistic news items, `data/processed/handcheck_v6.csv`).** Vlad scored them
blind in the scoring page (`python -m ml.pipeline.gold_labeler --handcheck`, port 8766), then
each was scored live with `python -m ml.pipeline.score_text --csv ...` (~$0.001 per item).

| vs Vlad | Intensity exact / within 1 | Exposure exact / within 1 | Same impact level |
|---|---|---|---|
| LLM v6 | 6/10 / 9/10 (bias −0.3) | 5/10 / 10/10 (bias +0.3) | 6/10 |

| Item | Vlad I/E | LLM I/E | Note |
|---|---|---|---|
| H02 2 civilians killed by IED | 3 / 1 | 4 / 1 | LLM applies the rule (2 deaths → 4); Vlad scored 3 |
| H03 village chief killed, health centre burned, 1,200 fled | 4 / 1 | 3 / 1 | "one death + other serious harm" under-scored |
| H06 400+ killed in camp attack, 400k fled | 5 / 5 | 4 / 5 | rule says thousands for 5; Vlad sees hundreds as mass killing |
| H10 WFP warehouse looted, 45k missed rations | 4 / 2 | 2 / 2 | only 2-level miss; a non-killing rule (unchanged from v5) |

Exposure misses are all one level on texts with no numbers (Vlad: "1–2 is ok" on those).
Candidates for a v7: "one death + destroyed health facility/displacement" → 4; hundreds killed
in one attack → 5; loss of food rations for tens of thousands → 3–4.

## Final evaluation (v5): Vlad's 10 newest events (F01–F10, `final10_comparison.csv`)

| vs Vlad | Intensity exact / within 1 | Exposure exact / within 1 | Same impact level |
|---|---|---|---|
| **LLM v5** | **6/10 / 10/10** (bias −0.2) | **8/10 / 9/10** (bias −0.3) | **6/10** |
| Old pipeline (mostly student) | 4/10 / 10/10 (−0.4) | 4/10 / 8/10 (−0.6) | 4/10 |
| New student (v5 labels) | 3/10 / 9/10 (−0.8) | 4/10 / 9/10 (−0.7) | 1/10 |

The LLM is within one level of Vlad on every intensity score and slightly conservative. Its
largest misses: F01 small landslide (I 1 vs 2, E 1 vs 3), F06 IED killings (I 3 vs 4).
The student systematically under-rates severe events, so it should not score the main dataset.

## Student (offline fallback only)

`python -m ml.pipeline.student_timesplit --labels data/processed/llm_labels_all.jsonl`
(needs the project `venv`: lightgbm is not in system Python). Time split: oldest 80% train
(to 2025-07-09), newest 20% test (2,955 events); every choice (model variant, routing rule,
thresholds) tuned on the newest 20% of the training period only; gold events excluded.
Report: `data/processed/student_timesplit_report.json`.

| Student vs LLM, untouched test | Exact | Within 1 | QWK |
|---|---|---|---|
| Intensity (old labels → v5 labels) | 58% → 68% | 98% → 99% | 0.47 → 0.62 |
| Exposure (old labels → v5 labels) | 54% → 69% | 89% → 97% | 0.71 → 0.81 |

Routing (per-target rule: "severe" for intensity, max-proba for exposure): routing 20% to the
LLM → 72%/72% exact on accepted; 40% → 75%/77%. Still never predicts intensity 5 and
predicts only 39% of true 4s. A GPU text-model student was considered and skipped: the LLM
is cheap enough for all new events.

## Cost and safeguards

Total GreenPT spend ≈ **$4.19** after v6 (v6 work: ~$0.03 prompt tests, $0.73 subset relabel, $0.01 hand check; before v6: $3.42) (estimated from tokens at the $0.50/122-call rate; check the
GreenPT dashboard): $0.50 earlier, ~$0.20 prompt testing, ~$2.72 full relabel (594 calls,
~15 min with 6 parallel workers, 0 failures).

**Incident (2026-11-07):** GreenPT now enables "thinking" by default; deepseek-v4 spent up to
8,000 hidden reasoning tokens per call and often returned nothing (~$0.12 wasted). Fixes in
`ml/pipeline/greenpt.py`:
- `reasoning_effort: "none"` on every call (`GREENPT_REASONING`), part of the cache key;
- raises `ThinkingNotDisabled` on the first reply that still used reasoning tokens;
- `GREENPT_BUDGET_USD` hard cap (no new uncached call once estimated spend reaches it);
- `max_tokens` 4000.

## Files and commands

| File | Role |
|---|---|
| `ml/pipeline/gold_set.py` | Build the stratified gold set (never overwrites human scores) |
| `ml/pipeline/gold_labeler.py` | Local blind scoring page, saves to `gold_labels.csv` (`python -m ml.pipeline.gold_labeler`, port 8765) |
| `ml/pipeline/gold_eval.py` | LLM labels vs gold: exact, within-1, QWK, bias, disagreements |
| `ml/pipeline/prompt_eval.py` | Run a prompt on a gold split (`--split test*` requires `--final`), `--shuffle` for noise |
| `ml/pipeline/relabel_all.py` | Label all events with the frozen prompt, parallel, resumable, budget-capped; `--subset killings`, `--export-only` |
| `ml/pipeline/student_timesplit.py` | Time-split student evaluation and routing |
| `ml/pipeline/greenpt.py` | GreenPT client: cache, usage log, thinking off, budget cap |
| `ml/prompts/silver_labels.md` | Frozen v6 prompt (history in `ml/prompts/versions/`) |
| `ml/pipeline/score_text.py` | Live scoring of one text, or `--csv` for a file (hand check: `data/processed/handcheck_v6.csv`) |

```bash
GREENPT_MODEL=deepseek-v4.1-flash python -m ml.pipeline.prompt_eval ml/prompts/silver_labels.md --dry-run
GREENPT_MODEL=deepseek-v4.1-flash GREENPT_BUDGET_USD=5 python -m ml.pipeline.relabel_all --workers 6
python -m ml.pipeline.gold_eval --labels data/processed/llm_labels_all.jsonl --split test2
```

The old pipeline (`student.py`, `score_events.py`, `access_events_scored.csv`) is kept for
reference; `score_events.py` does not yet use the v5 labels.

## Open items

1. Most gold labels are Claude's: a second human rater (or Vlad on the 20 `test` events
   scored by Claude) would make the evaluation stronger.
2. Wire `access_events_scored_v5.csv` into ranking/backend; label new events with the LLM.
3. LLM tends to be slightly conservative (bias −0.1 to −0.3): fine for ranking, note it in the pitch.
4. `pytest` is not installed, so `ml/tests` was not run after this session's changes.
