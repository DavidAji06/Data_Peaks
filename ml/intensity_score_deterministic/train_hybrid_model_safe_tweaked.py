"""
Robust ML Pipeline for ACAPS Hybrid Intensity Scorer
- Fixed feature bottleneck: extracts full dense embedding vectors instead of 5 similarity scores.
- Fixed ordinality: uses RandomForestRegressor to penalize >= 2 category errors.
- Evaluates the Hybrid ensemble on a completely unseen test set.
"""

import pandas as pd
import numpy as np
import os
from sklearn.model_selection import train_test_split, GridSearchCV, KFold
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, accuracy_score
import warnings

warnings.filterwarnings("ignore")

from step2_intensity_scorer_v3 import ACAPSIntensityScorer as LexiconScorer
from step3_rubric_embedding_scorer import ACAPSRubricEmbeddingScorer as EmbeddingScorer

def create_features(df, lex_scorer, emb_scorer):
    """Extracts Lexicon predictions, full raw Embeddings, and ground-truth labels."""
    lex_preds, emb_vecs, y = [], [], []

    for _, row in df.iterrows():
        title = str(row.get("Risk Title", ""))
        rationale = str(row.get("Rationale", ""))
        impact_desc = str(row.get("Impact materialisation description", ""))
        
        description = str(row.get("description", ""))
        if not description.strip() or description == "nan":
            description = f"{title}. {rationale} {impact_desc}".strip()
            
        gt = int(row.get("Intensity of hazard"))
        y.append(gt)

        # Lexicon Prediction with dynamic baseline mapping
        sub = ["S7.1 - Violence inhibiting the affected population"]
        t_low = title.lower()
        if "drought" in t_low or "la niña" in t_low or "precipitation" in t_low or "climate" in t_low:
            sub = ["S9.2 - Severe infrastructure disruption"]
        elif "return" in t_low or "refugee" in t_low or "deport" in t_low:
            sub = ["S2.3 - The forced displacement of people in need"]
            
        lex_res = lex_scorer.score_event(description, sub)
        lex_preds.append(int(lex_res["final_intensity_score"]))

        # --- CRITICAL FIX 1: Extract full dense embeddings (e.g. 384-D) instead of 5 similarities ---
        raw_vec = emb_scorer.embed_texts([description])[0]
        emb_vecs.append(raw_vec)

    return np.array(lex_preds), np.array(emb_vecs), np.array(y)

def run_ml_pipeline(csv_path="risk-radar-export.csv"):
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found. Please provide a valid CSV dataset.")
        return

    # 1. Load and Clean Data
    df = pd.read_csv(csv_path)
    df = df[df['Intensity of hazard'].notna()].copy()

    MAX_SAMPLES = 500
    if len(df) > MAX_SAMPLES:
        print(f"Limiting dataset from {len(df)} to {MAX_SAMPLES} samples to prevent resource exhaustion.")
        df = df.sample(n=MAX_SAMPLES, random_state=42)
    
    counts = df['Intensity of hazard'].value_counts()
    valid_classes = counts[counts >= 5].index
    df = df[df['Intensity of hazard'].isin(valid_classes)]
    
    print(f"Loaded {len(df)} valid labeled events for training/evaluation.")

    # 2. Strict Train/Test Split (80/20)
    df_train, df_test = train_test_split(df, test_size=0.20, random_state=40, stratify=df['Intensity of hazard'])
    print(f"Dataset Split: {len(df_train)} Training Samples | {len(df_test)} Unseen Test Samples")

    lex_scorer = LexiconScorer()
    emb_scorer = EmbeddingScorer(softmax_temperature=0.08)

    # 3. Feature Extraction
    print("Extracting features... (Running Lexicon rules & Vector Embeddings)")
    lex_train, X_train, y_train = create_features(df_train, lex_scorer, emb_scorer)
    lex_test, X_test, y_test = create_features(df_test, lex_scorer, emb_scorer)

    # --- CRITICAL FIX 2: Use a Regressor to handle ordinal severity and avoid >=2 errors ---
    param_grid = {
        'n_estimators': [100, 200],
        'max_depth': [None, 10, 20]
    }
    
    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    base_clf = RandomForestRegressor(random_state=42)
    grid_search = GridSearchCV(base_clf, param_grid, cv=cv, scoring='neg_mean_absolute_error', n_jobs=-1)
    
    print("Training ML model on high-dimensional embeddings...")
    grid_search.fit(X_train, y_train)
    best_clf = grid_search.best_estimator_

    # Generate Predictions, round them, and clip to 1-5
    raw_preds = best_clf.predict(X_test)
    emb_ml_test_preds = np.clip(np.round(raw_preds), 1, 5).astype(int)

    # 5. Hybrid Ensemble (Average of Lexicon + ML)
    hybrid_test_preds = np.round((lex_test + emb_ml_test_preds) / 2.0).astype(int)

    # 6. Evaluation Metrics
    metrics = {
        "1. Lexicon (Deterministic)": (lex_test),
        "2. ML-Optimized Embedding": (emb_ml_test_preds),
        "3. Hybrid (Lexicon + ML)": (hybrid_test_preds)
    }

    print("\n=== PERFORMANCE ON UNSEEN TEST SET (N={}) ===".format(len(y_test)))
    print(f"{'Method':<30} | {'MAE':<6} | {'Accuracy':<10} | {'Bad (>=2)':<10}")
    print("-" * 65)
    
    for name, preds in metrics.items():
        mae = mean_absolute_error(y_test, preds)
        acc = accuracy_score(y_test, preds) * 100
        bad = np.mean(np.abs(y_test - preds) >= 2) * 100
        print(f"{name:<30} | {mae:<6.2f} | {acc:<8.1f}% | {bad:<8.1f}%")

if __name__ == "__main__":
    run_ml_pipeline()
