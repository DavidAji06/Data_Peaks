# Impact scoring for ACAPS Humanitarian Access Events — handoff note

Status as of 2026-11-07, branch `data-ranking`. Owner: Vlad (data & ranking).

## Goal

Give each of the 14,847 ACAPS Humanitarian Access Events Risk Radar–style scores:
**exposure (1–5)**, **intensity (1–5)** and **impact** (ACAPS chart lookup), using the
methodology in `references/` (ACAPS *Introduction to Risk Analysis Methodology*, May 2019,
pp. 9–10).

## Current state (use this)

**Every event is scored directly by the LLM with the validated v5 prompt.**
File: `data/processed/access_events_scored_v5.csv` (`source = llm_v5`; columns: scores,
`explicit_pin`, `scope_type`, `brief_reasoning`, `impact_score`, `impact_label`).

```
all 14,847 events ──► GreenPT deepseek-v4.1-flash, prompt v5, thinking OFF ──► I, E
                                                                          │
                                       impact = ACAPS chart[exposure, intensity]
```

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

## Final evaluation: Vlad's 10 newest events (F01–F10, `final10_comparison.csv`)

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

Total GreenPT spend ≈ **$3.42** (estimated from tokens at the $0.50/122-call rate; check the
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
| `ml/pipeline/relabel_all.py` | Label all events with the frozen prompt, parallel, resumable, budget-capped |
| `ml/pipeline/student_timesplit.py` | Time-split student evaluation and routing |
| `ml/pipeline/greenpt.py` | GreenPT client: cache, usage log, thinking off, budget cap |
| `ml/prompts/silver_labels.md` | Frozen v5 prompt (history in `ml/prompts/versions/`) |

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
