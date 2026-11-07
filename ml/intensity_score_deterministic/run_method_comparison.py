import os
import random
import json
import numpy as np
import pandas as pd

from step2_intensity_scorer_v3 import ACAPSIntensityScorer as LexiconScorer
from step3_rubric_embedding_scorer import ACAPSRubricEmbeddingScorer as EmbeddingScorer

def load_or_generate_events(n=150):
    """Loads events from available local data or generates n representative events."""
    events = []
    
    # Try loading from possible local files
    for filename in ["events.json", "acaps_events.json"]:
        if os.path.exists(filename):
            try:
                with open(filename, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    items = data.get("results", data) if isinstance(data, dict) else data
                    if isinstance(items, list) and len(items) > 0:
                        for item in items:
                            events.append({
                                "event_id": str(item.get("event_id", "1000")),
                                "description": item.get("description", item.get("Rationale", "")),
                                "subindicator": item.get("subindicator", ["S7.1 - Violence inhibiting the affected population"])
                            })
            except Exception:
                pass

    if len(events) < n and os.path.exists("risk-radar-export.csv"):
        try:
            df = pd.read_csv("risk-radar-export.csv")
            for _, row in df.iterrows():
                desc = str(row.get("Rationale", "")) + " " + str(row.get("Impact materialisation description", ""))
                events.append({
                    "event_id": str(row.get("Risk ID", "R000")),
                    "description": desc,
                    "subindicator": ["S7.1 - Violence inhibiting the affected population"]
                })
        except Exception:
            pass

    # If still not enough, generate synthetic representative events spanning Tiers 1 to 5
    while len(events) < n:
        idx = len(events) + 1000
        synthetic_pool = [
            ("Minor administrative delays at routine checkpoints; people can meet basic needs easily.", ["S3.1 - Complex, costly, and time-consuming registration processes"]),
            ("Localized violence and some shortages reported, forcing households to apply coping strategies.", ["S7.1 - Violence inhibiting the affected population"]),
            ("Disruption of water services and significant gaps causing high suffering and loss of dignity.", ["S9.2 - Severe infrastructure disruption"]),
            ("Life-threatening conditions, severe food consumption gaps, acute malnutrition, and excess mortality.", ["S8.3 - Casualties"]),
            ("Widespread mortality, complete lack of food, starvation, famine, and destitution are evident.", ["S8.3 - Casualties"])
        ]
        text, sub = random.choice(synthetic_pool)
        events.append({
            "event_id": str(idx),
            "description": text + f" (Event instance {idx})",
            "subindicator": sub
        })

    random.seed(42)
    return random.sample(events, n)

def run_comparison():
    output_dir = "intensity_scores"
    os.makedirs(output_dir, exist_ok=True)

    print("Loading 150 events...")
    events = load_or_generate_events(150)

    print("Initializing scorers...")
    lex_scorer = LexiconScorer()
    emb_scorer = EmbeddingScorer(softmax_temperature=0.08)

    results = []
    print("Scoring 150 events with both methods...")
    for ev in events:
        eid = ev["event_id"]
        desc = ev["description"]
        subs = ev["subindicator"]

        # Method 1: Lexicon & Evidence-Anchor Modifying (Step 2 v3)
        lex_res = lex_scorer.score_event(desc, subs)
        lex_score = int(lex_res["final_intensity_score"])

        # Method 2: Embedding & Cosine Similarity (Step 3)
        emb_res = emb_scorer.score_sentence(desc)
        emb_score = int(emb_res["predicted_tier"])

        results.append({
            "event_id": eid,
            "description": desc[:120] + "...",
            "lexicon_score": lex_score,
            "embedding_score": emb_score,
            "discrepancy": abs(lex_score - emb_score)
        })

    df_scores = pd.DataFrame(results)
    scores_csv = os.path.join(output_dir, "selected_events_scores.csv")
    df_scores.to_csv(scores_csv, index=False, encoding="utf-8")
    print(f"Saved individual scores to {scores_csv}")

    mean_individual_discrepancy = df_scores["discrepancy"].mean()

    print("Creating 75 random event pairs...")
    indices = list(range(len(events)))
    random.shuffle(indices)
    pairs = []
    for i in range(0, 75):
        idx_a = indices[2 * i]
        idx_b = indices[2 * i + 1]
        ev_a = results[idx_a]
        ev_b = results[idx_b]

        diff_lex = abs(ev_a["lexicon_score"] - ev_b["lexicon_score"])
        diff_emb = abs(ev_a["embedding_score"] - ev_b["embedding_score"])
        diff_discrepancy = abs(diff_lex - diff_emb)

        pairs.append({
            "pair_id": i + 1,
            "event_a_id": ev_a["event_id"],
            "event_b_id": ev_b["event_id"],
            "lexicon_diff": diff_lex,
            "embedding_diff": diff_emb,
            "pair_discrepancy": diff_discrepancy,
            "is_bad_prediction": int(diff_discrepancy >= 2)
        })

    df_pairs = pd.DataFrame(pairs)
    pairs_csv = os.path.join(output_dir, "event_pairs_comparison.csv")
    df_pairs.to_csv(pairs_csv, index=False, encoding="utf-8")
    print(f"Saved pair comparisons to {pairs_csv}")

    mean_pair_discrepancy = df_pairs["pair_discrepancy"].mean()
    bad_prediction_pct = (df_pairs["is_bad_prediction"].sum() / len(df_pairs)) * 100.0

    print("\n=== METHOD COMPARISON SUMMARY ===")
    print(f"Mean Individual Event Intensity Discrepancy: {mean_individual_discrepancy:.2f}")
    print(f"Mean Pair Difference Discrepancy: {mean_pair_discrepancy:.2f}")
    print(f"Percentage of Bad Predictions (Discrepancy >= 2): {bad_prediction_pct:.1f}%")

if __name__ == "__main__":
    run_comparison()