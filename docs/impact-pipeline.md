# Impact scoring for ACAPS Humanitarian Access Events — handoff note

Status as of 2026-11-06, branch `data-ranking`. Owner: Vlad (data & ranking).

## Goal

Give each of the 14,847 ACAPS Humanitarian Access Events Risk Radar–style scores:
**exposure (1–5)**, **intensity (1–5)** and **impact** (ACAPS chart lookup), using the
methodology in `references/` (ACAPS *Introduction to Risk Analysis Methodology*, May 2019,
pp. 9–10).

## Current approach (knowledge distillation)

```
events ──► stratified sample (1,000) ──► LLM "teacher" labels (silver labels)
                                              │
                                              ▼
           TF-IDF + LightGBM "student" (one model for intensity, one for exposure)
                                              │
all events ◄── student predicts ──► confidence rule fails? ──► LLM fallback
                                              │
                                              ▼
                     impact = ACAPS chart[exposure, intensity]   (deterministic)
```

- **Teacher:** GreenPT `deepseek-v4.1-flash`, temperature 0, 25 events per call, prompt in
  `ml/prompts/silver_labels.md` (rubrics for intensity and exposure, JSON output with
  `brief_reasoning` before the scores). `glm-5.3` returned HTTP 503 at the time.
- **Sample:** stratified by (subindicator, country_wide), min 10 per stratum, rest
  proportional (68 strata).
- **Student features.** Intensity: TF-IDF(1–2 grams, 3000) + one-hot indicator/subindicator
  + INFORM Risk Vulnerability & Lack of Coping Capacity (JRC API, mid-2026 release).
  Exposure: regex people-numbers, country population (World Bank), country_wide,
  number of adm1 regions, one-hot targeted groups, TF-IDF.
- **Confidence rule:** accept if max proba ≥ 0.55, or top-two scores adjacent and summing
  to ≥ 0.85; otherwise send to the LLM.

## Files and commands

| File | Role |
|---|---|
| `ml/pipeline/fetch_acaps.py` | Download the events from the ACAPS API (`ACAPS_TOKEN` in `.env`) |
| `ml/pipeline/greenpt.py` | GreenPT client (key `GREENPT_KEY` or `GREENPT_API_KEY`, model `GREENPT_MODEL`); caches replies, logs token usage |
| `ml/pipeline/silver_labels.py` | Sampling, prompt building, schema validation, batched labelling (resumable) |
| `ml/pipeline/country_context.py` | INFORM Risk VU/CC + World Bank population (cached in `data/raw/`) |
| `ml/pipeline/student.py` | Features, LightGBM models, 80/20 evaluation, confidence rule |
| `ml/pipeline/score_events.py` | Score all events, optional LLM fallback, chart lookup |
| `ml/pipeline/impact.py` | ACAPS chart and exposure bands |
| `ml/tests/test_impact_pipeline.py` | Offline tests (no API) |

```bash
python -m ml.pipeline.fetch_acaps                       # raw events (not committed, 25 MB)
GREENPT_MODEL=deepseek-v4.1-flash python -m ml.pipeline.silver_labels --n 1000
python -m ml.pipeline.student
GREENPT_MODEL=deepseek-v4.1-flash python -m ml.pipeline.score_events --llm-fallback --max-llm-calls 100
python -m pytest ml/tests
```

Outputs in `data/processed/`: `silver_sample.csv`, `silver_labels.jsonl`,
`llm_fallback_labels.jsonl`, `student_report.json`, `access_events_scored.csv`
(columns: scores, probabilities, `source` = llm_silver / llm_fallback / student,
`brief_reasoning`, impact).

## Results so far

- Labels: 1,000 silver + 1,979 fallback = 2,979 events scored by the LLM; 11,868 by the student.
- Cost: ~120 GreenPT calls ≈ **$0.50** (≈ $0.004 per 25-event call). Labelling all 14,847
  events with the LLM would cost ≈ $2.50.
- Final impact distribution: Very Low 3,667 · Low 8,048 · Moderate 2,185 ·
  Significant 876 · Major 71.

Student vs LLM on 200 held-out silver labels:

| | Exact | Within 1 | Quadratic kappa |
|---|---|---|---|
| Intensity | 60% | 98% | 0.51 |
| Exposure | 53% | 91% | 0.74 |

- The confidence rule accepts 99% of intensity predictions and accepted ones are not more
  accurate: **it does not work for intensity** (labels cluster at 2–3, so the
  adjacent-sum condition almost always passes). Routing came almost entirely from exposure.
- The student rarely predicts intensity 1 or 5 (27 and 13 silver labels only) and
  **under-rates severe events** (true level 4 → predicted 4 in only ~1/3 of validation cases).
- Regex vs LLM people count: regex finds a number in 54% of cases where the LLM found one;
  same exposure band 90% when both found one; 2% false positives.

## Manual checks

| Event | Manual | LLM (I/E) | Student (I/E) | Note |
|---|---|---|---|---|
| 1000 Trinidad & Tobago (US State Dept, police killings, impunity) | intensity 4–5 (Vlad) | 2 / 2 | (trained on it) | LLM weighted "impunity" (rubric level 2) over "unlawful killings"; 3 seems fairer |
| 10000 Burkina Faso (rape, burned villages, looted health centres) | intensity 3–4 (Vlad) | 4 / 4 | 3 / 2 | Student confidently wrong (93%), never routed to the LLM |

Ten random student-scored events, three raters (Claude's blind scores, LLM, student):
intensity agreed within one level for every pair; exact 6/10 (Claude–LLM), 7/10
(Claude–student), 5/10 (LLM–student). Exposure exact only 3–4/10 for any pair.
Patterns: the LLM rates vague nationwide texts higher (intensity +1, exposure 4 for
"nationwide" texts with no stated harm); the student misses acute severity (Gaza shelter
shelling: 3 vs 4). Note Claude's scores are a third opinion, not ground truth.

## Open decisions / next steps

1. **Fix the prompt** before more labelling:
   - exposure = people *needing assistance because of the event*, not people living in
     the area; `country_wide` with no stated harm to people should not exceed 2–3;
   - killings by state or armed actors → intensity at least 3; rubric level-4 examples
     (systematic rape, burning villages, destroyed health/water infrastructure) → 4.
2. **Build a gold set:** 30–50 events hand-scored by Vlad and ideally a second person,
   stratified by subindicator; measure human–human agreement, then compare prompt versions
   against it (cheap: one prompt version ≈ $0.01 on 50 events).
3. **Re-label with the chosen prompt and score all events with the LLM** (≈ $2.50) so the
   current dataset has no student errors; compare student vs LLM on all events.
4. **Keep the student only for new events**, after fixing its routing (e.g. send predicted
   intensity 3 to the LLM whenever P(4) is meaningful; tune thresholds on the fallback pairs).
5. Optional sanity checks: read all "Major" events; compare country/month averages with
   known crises and the Risk Radar.
