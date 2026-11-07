"""Gold set: 60 hand-scored events used to choose the LLM prompt.

    python -m ml.pipeline.gold_set            # create data/processed/gold_labels.csv (+ reading sheet)

Design
  * Drawn from the 1,000-event silver sample, so every gold event already has a label from
    the current prompt (needed to measure the current prompt against the human scores).
  * Stratified by subindicator: one event per subindicator (33), the other 27 allocated
    proportionally to the subindicator's size in the full 14,847 events.
  * split: 40 "tune" (used while iterating on the prompt) / 20 "test" (looked at once,
    after the final prompt is chosen), stratified by indicator.
  * The sheet contains NO model scores, so the human labels are blind.
  * Never overwrites a file that already contains human scores.
"""
from __future__ import annotations

import math

import pandas as pd
from sklearn.model_selection import train_test_split

from ml.pipeline.silver_labels import PROCESSED, SAMPLE_CSV, load_events

GOLD_CSV = PROCESSED / "gold_labels.csv"
GOLD_SHEET = PROCESSED / "gold_reading_sheet.md"
N_GOLD, N_TEST, SEED = 60, 20, 2026

SHOW = ["event_id", "country", "date", "country_wide", "adm1_name", "indicator", "subindicator",
        "targeting_specific_population_groups", "source_name", "description"]
HUMAN = ["my_intensity", "my_exposure", "notes"]

RUBRIC = """\
**Intensity (1-5)** - how badly basic needs / safety are hit for the people concerned.
1 minor, not life-threatening · 2 stressed, some shortages, not life-threatening ·
3 potentially life-threatening / irreversible harm if unassisted · 4 life-threatening,
excess mortality, grave violations (killings, systematic rape, burning villages,
destroyed health/water) · 5 extreme: deaths widely caused, starvation.

**Exposure (1-5)** - people needing assistance *because of this event* (not everyone
living in the area). 1 <10k or <5% · 2 10-50k or 5-15% · 3 50-100k or 15-30% ·
4 100-250k or 30-50% · 5 >250k or >50% of the affected population.
"""


def build() -> pd.DataFrame:
    events = load_events()
    events["sub"] = events["subindicator"].fillna("").str.extract(r"(S\d+\.\d+)")[0]
    pool = events[events["event_id"].isin(pd.read_csv(SAMPLE_CSV, dtype=str)["event_id"])]
    pool = pool[pool["sub"].notna()]

    sizes = events["sub"].value_counts()
    sizes = sizes[sizes.index.isin(pool["sub"].unique())]
    extra = (sizes - 1) / (sizes - 1).sum() * (N_GOLD - len(sizes))
    alloc = 1 + extra.apply(math.floor)
    for k in (extra - extra.apply(math.floor)).sort_values(ascending=False).index[:N_GOLD - alloc.sum()]:
        alloc[k] += 1

    parts = []
    for sub, k in alloc.items():
        cand = pool[pool["sub"] == sub].sample(frac=1, random_state=SEED)
        # alternate country_wide True/False where possible so both kinds are represented
        cw, loc = cand[cand["country_wide"]], cand[~cand["country_wide"]]
        order = [r for pair in zip(loc.itertuples(), cw.itertuples()) for r in pair]
        order += list(loc.itertuples())[len(order) // 2:] + list(cw.itertuples())[len(order) // 2:]
        parts.append(pd.DataFrame(order[:int(k)]).drop(columns="Index"))
    gold = pd.concat(parts, ignore_index=True)

    ind = gold["indicator"].str[:2]
    _, test_idx = train_test_split(gold.index, test_size=N_TEST, stratify=ind, random_state=SEED)
    gold["split"] = "tune"
    gold.loc[test_idx, "split"] = "test"

    gold = gold.sample(frac=1, random_state=SEED).reset_index(drop=True)
    gold.insert(0, "gold_id", [f"G{i + 1:02d}" for i in range(len(gold))])
    for c in HUMAN:
        gold[c] = ""
    return gold[["gold_id", "split", *SHOW, *HUMAN]]


def write_sheet(gold: pd.DataFrame) -> None:
    lines = ["# Gold set - reading sheet", "",
             "Score in `data/processed/gold_labels.csv` (columns my_intensity, my_exposure, notes).",
             "Score each event from its text only; do not look up model scores.", "", RUBRIC]
    for r in gold.itertuples():
        lines += [f"## {r.gold_id} · event {r.event_id} · {r.country} · {r.date}",
                  f"*{r.subindicator}* · country_wide={r.country_wide} · adm1: {r.adm1_name} · "
                  f"groups: {r.targeting_specific_population_groups} · source: {r.source_name}", "",
                  str(r.description).strip(), "", "intensity: __  exposure: __", ""]
    GOLD_SHEET.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    if GOLD_CSV.exists():
        old = pd.read_csv(GOLD_CSV, dtype=str)
        if old[["my_intensity", "my_exposure"]].notna().any().any():
            raise SystemExit(f"{GOLD_CSV} already has human scores - not overwriting.")
    gold = build()
    gold.to_csv(GOLD_CSV, index=False, encoding="utf-8-sig")
    write_sheet(gold)
    print(f"wrote {GOLD_CSV} ({len(gold)} events: {gold['split'].value_counts().to_dict()})")
    print(f"wrote {GOLD_SHEET}")
    print("country_wide:", gold["country_wide"].value_counts().to_dict())
    print("indicators:", gold["indicator"].str[:2].value_counts().sort_index().to_dict())


if __name__ == "__main__":
    main()
