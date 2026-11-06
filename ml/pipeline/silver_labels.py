"""Silver-standard labels from the LLM (knowledge-distillation teacher).

    python -m ml.pipeline.silver_labels --dry-run          # sample + show first prompt, no API call
    python -m ml.pipeline.silver_labels --n 1000           # label the stratified sample
    python -m ml.pipeline.silver_labels --max-calls 4      # small paid test run

Steps
  1. Stratified sample over (subindicator, country_wide): every stratum gets at least
     MIN_PER_STRATUM events (or all it has), the rest is allocated proportionally.
     Saved to data/processed/silver_sample.csv so the sample is fixed across runs.
  2. Only the fields the rubric needs are sent (event_id, country, country_wide,
     adm1_name, indicator, subindicator, targeting_specific_population_groups,
     description).
  3. Batches of BATCH_SIZE events per call, temperature 0, prompt from
     ml/prompts/silver_labels.md.
  4. The reply is parsed and validated against the schema. Events missing or invalid in
     a reply are retried in smaller batches; a batch that still fails is logged.
  5. Valid labels are appended to data/processed/silver_labels.jsonl. Re-running skips
     events that already have a label, so the job can be resumed safely.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
EVENTS_CSV = ROOT / "data" / "raw" / "acaps" / "humanitarian_access_events.csv"
PROMPT_PATH = ROOT / "ml" / "prompts" / "silver_labels.md"
PROCESSED = ROOT / "data" / "processed"
SAMPLE_CSV = PROCESSED / "silver_sample.csv"
LABELS_JSONL = PROCESSED / "silver_labels.jsonl"
PLACEHOLDER = "{{INSERT_BATCH_OF_EVENTS_JSON_HERE}}"

PROMPT_FIELDS = ["event_id", "country", "country_wide", "adm1_name", "indicator", "subindicator",
                 "targeting_specific_population_groups", "description"]
SCOPE_TYPES = {"isolated_incident", "subpopulation_group", "adm1_regional", "country_wide"}
BATCH_SIZE = 25
MIN_PER_STRATUM = 10  # 68 strata x 10 = 680, leaving ~320 events for proportional allocation
SEED = 42


# --------------------------------------------------------------------------- #
# Sampling
# --------------------------------------------------------------------------- #
def load_events() -> pd.DataFrame:
    df = pd.read_csv(EVENTS_CSV, dtype={"event_id": str})
    df["stratum"] = (df["subindicator"].fillna("").str.extract(r"(S\d+\.\d+)")[0].fillna("none")
                     + "|" + df["country_wide"].astype(str))
    return df


def allocate(sizes: pd.Series, n: int, floor: int = MIN_PER_STRATUM) -> pd.Series:
    """Events per stratum: min(size, floor) each, the remainder proportional to what is left."""
    while floor > 0 and sizes.clip(upper=floor).sum() > n:  # floors alone exceed n
        floor -= 1
    base = sizes.clip(upper=floor)
    if base.sum() >= n or base.sum() == sizes.sum():
        return base
    spare = sizes - base
    extra = spare / spare.sum() * (n - base.sum())
    alloc = base + extra.apply(math.floor)
    # hand out the rounding remainder to the largest fractional parts
    remainder = int(n - alloc.sum())
    order = (extra - extra.apply(math.floor)).sort_values(ascending=False).index
    for k in order[:remainder]:
        alloc[k] += 1
    return alloc.clip(upper=sizes).astype(int)


def stratified_sample(df: pd.DataFrame, n: int) -> pd.DataFrame:
    sizes = df["stratum"].value_counts()
    alloc = allocate(sizes, n)
    parts = [df[df["stratum"] == s].sample(int(k), random_state=SEED) for s, k in alloc.items() if k]
    return pd.concat(parts).sample(frac=1, random_state=SEED)


def get_sample(n: int) -> pd.DataFrame:
    df = load_events()
    if SAMPLE_CSV.exists():
        ids = pd.read_csv(SAMPLE_CSV, dtype={"event_id": str})["event_id"]
        if len(ids) == n:
            return df.set_index("event_id").loc[ids].reset_index()
    sample = stratified_sample(df, n)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sample[["event_id", "stratum"]].to_csv(SAMPLE_CSV, index=False)
    return sample


# --------------------------------------------------------------------------- #
# Prompting and validation
# --------------------------------------------------------------------------- #
def to_prompt_records(df: pd.DataFrame) -> list[dict]:
    recs = df[PROMPT_FIELDS].astype(object).where(df[PROMPT_FIELDS].notna(), None)
    out = recs.to_dict(orient="records")
    for r in out:
        r["event_id"] = str(r["event_id"])
        r["country_wide"] = bool(r["country_wide"])
    return out


def build_prompt(records: list[dict]) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return template.replace(PLACEHOLDER, json.dumps(records, ensure_ascii=False, indent=1))


def parse_reply(text: str) -> list:
    """JSON array from the reply, tolerating code fences or text around it."""
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("["), text.rfind("]")
        if start < 0 or end <= start:
            raise ValueError("no JSON array in reply")
        data = json.loads(text[start:end + 1])
    if isinstance(data, dict):  # some models wrap the array in an object
        data = next((v for v in data.values() if isinstance(v, list)), None)
    if not isinstance(data, list):
        raise ValueError("reply is not a JSON array")
    return data


def _as_int(v) -> int | None:
    if v is None or (isinstance(v, str) and v.strip().lower() in ("", "null", "none")):
        return None
    if isinstance(v, bool):
        raise ValueError("boolean where integer expected")
    if isinstance(v, str):
        v = re.sub(r"[,\s]", "", v)
    f = float(v)
    if f != int(f):
        raise ValueError("non-integer")
    return int(f)


def validate(item: dict, expected_ids: set[str]) -> dict:
    """Schema check; raises ValueError on anything that would poison training data."""
    eid = str(item.get("event_id", ""))
    if eid not in expected_ids:
        raise ValueError(f"unknown event_id {eid!r}")
    exp, inten = _as_int(item.get("exposure_score")), _as_int(item.get("intensity_score"))
    if exp not in range(1, 6) or inten not in range(1, 6):
        raise ValueError(f"score out of range for {eid}")
    pin = _as_int(item.get("explicit_pin_extracted"))
    if pin is not None and pin < 0:
        raise ValueError(f"negative pin for {eid}")
    scope = item.get("scope_type")
    if scope not in SCOPE_TYPES:
        raise ValueError(f"bad scope_type for {eid}")
    return {"event_id": eid, "explicit_pin_extracted": pin, "scope_type": scope,
            "brief_reasoning": str(item.get("brief_reasoning", ""))[:400],
            "exposure_score": exp, "intensity_score": inten}


def label_batch(client, df: pd.DataFrame, depth: int = 0) -> tuple[list[dict], list[str]]:
    """Label one batch. Missing/invalid events are retried in halves (up to 2 levels)."""
    records = to_prompt_records(df)
    ids = {r["event_id"] for r in records}
    good: dict[str, dict] = {}
    try:
        for item in parse_reply(client.chat([{"role": "user", "content": build_prompt(records)}])):
            try:
                v = validate(item, ids)
                good.setdefault(v["event_id"], v)
            except (ValueError, TypeError):
                continue
    except (ValueError, json.JSONDecodeError):
        pass
    missing = [i for i in ids if i not in good]
    if missing and depth < 2 and len(df) > 1:
        rest = df[df["event_id"].isin(missing)]
        half = math.ceil(len(rest) / 2)
        for part in (rest.iloc[:half], rest.iloc[half:]):
            if len(part):
                g, _ = label_batch(client, part, depth + 1)
                good.update({x["event_id"]: x for x in g})
        missing = [i for i in ids if i not in good]
    return list(good.values()), missing


def label_events(client, df: pd.DataFrame, out_path: Path, max_calls: int | None = None,
                 tag: str = "silver") -> pd.DataFrame:
    """Label every event in df not yet in out_path; append results; return all labels."""
    done = read_labels(out_path)
    todo = df[~df["event_id"].isin(done["event_id"])] if len(done) else df
    batches = [todo.iloc[i:i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
    if max_calls is not None:
        batches = batches[:max_calls]
    failed: list[str] = []
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for k, batch in enumerate(batches, 1):
        labels, missing = label_batch(client, batch)
        with out_path.open("a", encoding="utf-8") as f:
            for lab in labels:
                f.write(json.dumps({**lab, "model": client.model, "source": tag}) + "\n")
        failed += missing
        print(f"batch {k}/{len(batches)}: {len(labels)} labelled, {len(missing)} failed", flush=True)
    if failed:
        print(f"{len(failed)} events could not be labelled: {failed[:20]}")
    return read_labels(out_path)


def read_labels(path: Path = LABELS_JSONL) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=["event_id"])
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    return pd.DataFrame(rows).drop_duplicates("event_id", keep="last")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sample = get_sample(args.n)
    print(f"sample: {len(sample)} events, {sample['stratum'].nunique()} strata")
    if args.dry_run:
        prompt = build_prompt(to_prompt_records(sample.iloc[:BATCH_SIZE]))
        n_calls = math.ceil(len(sample) / BATCH_SIZE)
        print(prompt[-1500:])
        print(f"\n~{len(prompt) // 4} input tokens per call, {n_calls} calls "
              f"=> ~{len(prompt) // 4 * n_calls:,} input tokens total (estimate: chars/4)")
        return

    from ml.pipeline.greenpt import GreenPT, usage_summary
    labels = label_events(GreenPT(), sample, LABELS_JSONL, args.max_calls)
    print(f"silver labels: {len(labels)}  |  usage: {usage_summary()}")
    if len(labels):
        print(labels[["exposure_score", "intensity_score"]].apply(
            lambda s: s.value_counts().sort_index().to_dict()).to_dict())


if __name__ == "__main__":
    main()
