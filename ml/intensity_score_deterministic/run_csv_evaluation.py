"""
Comprehensive Evaluation Script against Ground-Truth CSV Data (risk-radar-export.csv)
- Loads ground-truth labeled rows from 'risk-radar-export.csv' (N=123).
- Evaluates both Method 1 (Lexicon Evidence-Anchor Scorer) and Method 2 (Embedding Cosine Similarity Scorer).
- Computes absolute error metrics (MAE, RMSE, Exact Match Accuracy, Bad Predictions >= 2).
- Computes pairwise difference discrepancies across random pairs (N=61 pairs).
- Saves all evaluation artifacts into 'intensity_scores/'.
"""

import os
import random
import numpy as np
import pandas as pd

from step2_intensity_scorer_v3 import ACAPSIntensityScorer as LexiconScorer
from step3_rubric_embedding_scorer import ACAPSRubricEmbeddingScorer as EmbeddingScorer

def evaluate_csv():
    output_dir = "intensity_scores"
    os.makedirs(output_dir, exist_ok=True)

    csv_path = "risk-radar-export.csv"
    if not os.path.exists(csv_path):
        print("Error: risk-radar-export.csv not found.")
        return

    df = pd.read_csv(csv_path)
    df_eval = df[df['Intensity of hazard'].notna()].copy()
    print("Loaded " + str(len(df_eval)) + " ground-truth labeled events from " + csv_path)

    lex_scorer = LexiconScorer()
    emb_scorer = EmbeddingScorer(softmax_temperature=0.08)

    results = []
    for _, row in df_eval.iterrows():
        risk_id = str(row.get("Risk ID", ""))
        title = str(row.get("Risk Title", ""))
        rationale = str(row.get("Rationale", ""))
        impact_desc = str(row.get("Impact materialisation description", ""))
        
        description = title + ". " + rationale + " " + impact_desc
        gt_intensity = int(row.get("Intensity of hazard"))

        sub = ["S7.1 - Violence inhibiting the affected population"]
        t_low = title.lower()
        if "drought" in t_low or "la niña" in t_low or "precipitation" in t_low or "climate" in t_low:
            sub = ["S9.2 - Severe infrastructure disruption"]
        elif "return" in t_low or "refugee" in t_low or "deport" in t_low:
            sub = ["S2.3 - The forced displacement of people in need"]
        elif "attack" in t_low or "clash" in t_low or "war" in t_low or "violence" in t_low:
            sub = ["S7.1 - Violence inhibiting the affected population"]

        lex_res = lex_scorer.score_event(description, sub)
        lex_score = int(lex_res["final_intensity_score"])

        emb_res = emb_scorer.score_sentence(description)
        emb_score = int(emb_res["predicted_tier"])

        results.append({
            "risk_id": risk_id,
            "title": title[:80],
            "ground_truth": gt_intensity,
            "lexicon_score": lex_score,
            "embedding_score": emb_score,
            "lex_error": abs(lex_score - gt_intensity),
            "emb_error": abs(emb_score - gt_intensity),
            "lex_bad": int(abs(lex_score - gt_intensity) >= 2),
            "emb_bad": int(abs(emb_score - gt_intensity) >= 2)
        })

    df_res = pd.DataFrame(results)
    eval_csv = os.path.join(output_dir, "csv_absolute_evaluation.csv")
    df_res.to_csv(eval_csv, index=False, encoding="utf-8")
    print("Saved absolute evaluation results to " + eval_csv)

    lex_mae = df_res["lex_error"].mean()
    emb_mae = df_res["emb_error"].mean()
    lex_rmse = np.sqrt((df_res["lex_error"]**2).mean())
    emb_rmse = np.sqrt((df_res["emb_error"]**2).mean())
    lex_acc = (df_res["lex_error"] == 0).mean() * 100
    emb_acc = (df_res["emb_error"] == 0).mean() * 100
    lex_bad_pct = df_res["lex_bad"].mean() * 100
    emb_bad_pct = df_res["emb_bad"].mean() * 100

    print("\n=== ABSOLUTE EVALUATION AGAINST GROUND TRUTH (N = " + str(len(df_res)) + ") ===")
    print("Mean Absolute Error (MAE)  | Lexicon: " + f"{lex_mae:.2f}" + " | Embedding: " + f"{emb_mae:.2f}")
    print("Root Mean Squared Error    | Lexicon: " + f"{lex_rmse:.2f}" + " | Embedding: " + f"{emb_rmse:.2f}")
    print("Exact Match Accuracy (%)   | Lexicon: " + f"{lex_acc:.1f}%" + " | Embedding: " + f"{emb_acc:.1f}%")
    print("Bad Predictions (Err >= 2) | Lexicon: " + f"{lex_bad_pct:.1f}%" + " | Embedding: " + f"{emb_bad_pct:.1f}%")

    random.seed(42)
    indices = list(range(len(df_res)))
    random.shuffle(indices)
    
    pairs = []
    num_pairs = min(75, len(df_res) // 2)
    for i in range(num_pairs):
        idx_a = indices[2 * i]
        idx_b = indices[2 * i + 1]
        row_a = df_res.iloc[idx_a]
        row_b = df_res.iloc[idx_b]

        gt_diff = abs(row_a["ground_truth"] - row_b["ground_truth"])
        lex_diff = abs(row_a["lexicon_score"] - row_b["lexicon_score"])
        emb_diff = abs(row_a["embedding_score"] - row_b["embedding_score"])

        lex_pair_disc = abs(lex_diff - gt_diff)
        emb_pair_disc = abs(emb_diff - gt_diff)

        pairs.append({
            "pair_id": i + 1,
            "risk_a": row_a["risk_id"],
            "risk_b": row_b["risk_id"],
            "gt_diff": gt_diff,
            "lex_diff": lex_diff,
            "emb_diff": emb_diff,
            "lex_pair_discrepancy": lex_pair_disc,
            "emb_pair_discrepancy": emb_pair_disc,
            "lex_bad_pair": int(lex_pair_disc >= 2),
            "emb_bad_pair": int(emb_pair_disc >= 2)
        })

    df_pairs = pd.DataFrame(pairs)
    pairs_csv = os.path.join(output_dir, "csv_pairwise_evaluation.csv")
    df_pairs.to_csv(pairs_csv, index=False, encoding="utf-8")
    print("Saved pairwise evaluation results to " + pairs_csv)

    lex_mean_pair_disc = df_pairs["lex_pair_discrepancy"].mean()
    emb_mean_pair_disc = df_pairs["emb_pair_discrepancy"].mean()
    lex_bad_pair_pct = df_pairs["lex_bad_pair"].mean() * 100
    emb_bad_pair_pct = df_pairs["emb_bad_pair"].mean() * 100

    print("\n=== PAIRWISE EVALUATION (N = " + str(num_pairs) + " Pairs) ===")
    print("Mean Pair Diff Discrepancy  | Lexicon: " + f"{lex_mean_pair_disc:.2f}" + " | Embedding: " + f"{emb_mean_pair_disc:.2f}")
    print("Bad Pair Predictions (>= 2) | Lexicon: " + f"{lex_bad_pair_pct:.1f}%" + " | Embedding: " + f"{emb_bad_pair_pct:.1f}%")

def print_best_and_worst_cases():
    eval_csv = "intensity_scores/csv_absolute_evaluation.csv"
    if not os.path.exists(eval_csv):
        return
    df = pd.read_csv(eval_csv)

    print("\n==================================================")
    print("      QUALITATIVE METHOD INSPECTION (BEST & WORST)")
    print("==================================================")

    print("\n--- LEXICON METHOD: BEST CASES (Exact Match: Error = 0) ---")
    for _, r in df[df['lex_error'] == 0].head(3).iterrows():
        t = str(r['title']).encode('ascii', 'ignore').decode('ascii')
        print("[" + str(r['risk_id']) + "] GT: " + str(r['ground_truth']) + " | Pred: " + str(r['lexicon_score']) + " | Title: " + t)

    print("\n--- LEXICON METHOD: WORST CASES (Highest Absolute Error) ---")
    for _, r in df.sort_values(by='lex_error', ascending=False).head(3).iterrows():
        t = str(r['title']).encode('ascii', 'ignore').decode('ascii')
        print("[" + str(r['risk_id']) + "] GT: " + str(r['ground_truth']) + " | Pred: " + str(r['lexicon_score']) + " (Err: " + str(r['lex_error']) + ") | Title: " + t)

    print("\n--- EMBEDDING METHOD: BEST CASES (Exact Match: Error = 0) ---")
    for _, r in df[df['emb_error'] == 0].head(3).iterrows():
        t = str(r['title']).encode('ascii', 'ignore').decode('ascii')
        print("[" + str(r['risk_id']) + "] GT: " + str(r['ground_truth']) + " | Pred: " + str(r['embedding_score']) + " | Title: " + t)

    print("\n--- EMBEDDING METHOD: WORST CASES (Highest Absolute Error) ---")
    for _, r in df.sort_values(by='emb_error', ascending=False).head(3).iterrows():
        t = str(r['title']).encode('ascii', 'ignore').decode('ascii')
        print("[" + str(r['risk_id']) + "] GT: " + str(r['ground_truth']) + " | Pred: " + str(r['embedding_score']) + " (Err: " + str(r['emb_error']) + ") | Title: " + t)

if __name__ == "__main__":
    evaluate_csv()
    print_best_and_worst_cases()
