import os
import json
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

"""
The assumed structure for the event input is a standard Python dictionary containing these four specific string keys:
{
    "Risk Title": "Short headline or name of the event",
    "Risk Type": "Category classification (e.g., 'New emerging risk')",
    "Country": "Location of the event",
    "Rationale": "Detailed description of the situation and its drivers"
}
"""

# 1. Configuration
MAIN_CSV = "risk-radar-export_2.csv"
EMBEDDINGS_CSV = "risk_radar_embeddings.csv"
MODEL_NAME = "BAAI/bge-small-en-v1.5"

print(f"Loading embedding model '{MODEL_NAME}'...")
model = SentenceTransformer(MODEL_NAME)

def clean_text(val, default=""):
    """Scrubs pandas NaN, Python None, and empty strings."""
    if pd.isna(val) or val is None or str(val).strip().lower() in ['nan', 'none', '']:
        return default
    return str(val).strip()

def has_sufficient_evolution_data(row, min_chars=30):
    """
    Retains a risk if it has meaningful narrative text across ANY of the three 
    evolution columns.
    """
    evo_narrative_cols = [
        'Hazard materialisation',
        'Impact materialisation description',
        'Rationale update'
    ]
    combined_text = " ".join([clean_text(row.get(col, '')) for col in evo_narrative_cols]).strip()
    return len(combined_text) >= min_chars

def build_evolution_summary(row):
    """Synthesizes all evolution-related columns into a structured summary."""
    status = clean_text(row.get('Status'), 'Unknown')
    trend = clean_text(row.get('Risk trend'), 'Unknown')
    what_mat = clean_text(row.get('What materialised?'), 'N/A')
    
    parts = [f"[Status: {status} | Trend: {trend} | Materialised: {what_mat}]"]
    
    hazard_mat = clean_text(row.get('Hazard materialisation'))
    if hazard_mat:
        parts.append(f"Hazard Materialisation: {hazard_mat}")
        
    impact_mat = clean_text(row.get('Impact materialisation description'))
    if impact_mat:
        parts.append(f"Impact Materialisation: {impact_mat}")
        
    rat_update = clean_text(row.get('Rationale update'))
    if rat_update:
        parts.append(f"Rationale Updates: {rat_update}")
        
    return "\n   ".join(parts)

def format_action_text(row):
    """Embeds the structural mechanism."""
    title = clean_text(row.get('Risk Title'), 'Untitled')
    r_type = clean_text(row.get('Risk Type'), 'Unknown')
    needs = clean_text(row.get('Expected priority needs'))
    triggers = clean_text(row.get('Triggers'))
    
    text = f"Event: {title}. Type: {r_type}."
    if needs:
        text += f" Priority Needs: {needs}."
    if triggers:
        text += f" Triggers: {triggers[:400]}"
    return text

def format_context_text(row):
    """Embeds the situational baseline."""
    country = clean_text(row.get('Country'), 'Unknown')
    rationale = clean_text(row.get('Rationale'))
    vuln = clean_text(row.get('Current vulnerability / Coping capacities'))
    exp_impact = clean_text(row.get('Expected impact'))
    
    text = f"Location: {country}. Situation: {rationale}"
    if vuln:
        text += f" Vulnerability: {vuln[:400]}"
    if exp_impact:
        text += f" Expected Impact: {exp_impact[:400]}"
    return text

def load_and_filter_main_data(csv_path):
    """Loads the main CSV and filters for events with rich evolution data."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Missing dataset: {csv_path}")
        
    df = pd.read_csv(csv_path)
    initial_count = len(df)
    
    mask = df.apply(has_sufficient_evolution_data, axis=1)
    df = df[mask].copy().fillna("")
    
    print(f"Loaded {len(df)} risks with rich evolution history (Discarded {initial_count - len(df)} rows with minimal/no evolution data).")
    return df

def sync_embeddings(main_df, emb_csv_path):
    """
    Reads the main CSV and the embeddings CSV. Calculates dual embeddings for missing Risk IDs.
    The main CSV is strictly READ-ONLY.
    """
    if os.path.exists(emb_csv_path):
        emb_df = pd.read_csv(emb_csv_path)
    else:
        emb_df = pd.DataFrame(columns=['Risk ID', 'emb_action', 'emb_context'])

    existing_ids = set(emb_df['Risk ID'].dropna().astype(str))
    main_ids = set(main_df['Risk ID'].dropna().astype(str))
    missing_ids = main_ids - existing_ids

    if missing_ids:
        print(f"Found {len(missing_ids)} new risk(s). Calculating dual-embeddings...")
        
        missing_df = main_df[main_df['Risk ID'].astype(str).isin(missing_ids)]
        
        actions = missing_df.apply(format_action_text, axis=1).tolist()
        contexts = missing_df.apply(format_context_text, axis=1).tolist()
        
        vecs_action = model.encode(actions).astype(np.float32)
        vecs_context = model.encode(contexts).astype(np.float32)
        
        new_rows = pd.DataFrame({
            'Risk ID': missing_df['Risk ID'].values,
            'emb_action': [json.dumps(v.tolist()) for v in vecs_action],
            'emb_context': [json.dumps(v.tolist()) for v in vecs_context]
        })
        
        new_rows.to_csv(emb_csv_path, mode='a', header=not os.path.exists(emb_csv_path), index=False)
        print(f"Appended {len(missing_ids)} new dual-embeddings to '{emb_csv_path}'.")
        
        emb_df = pd.read_csv(emb_csv_path)
    else:
        print(f"All {len(main_ids)} risks already have embeddings. No updates needed.")

    # Keep only embeddings corresponding to our filtered valid risks
    emb_df = emb_df[emb_df['Risk ID'].astype(str).isin(main_ids)].copy()

    emb_df['emb_action_array'] = emb_df['emb_action'].apply(json.loads).apply(np.array)
    emb_df['emb_context_array'] = emb_df['emb_context'].apply(json.loads).apply(np.array)
    return emb_df

def search_similar_risks(new_event_dict, main_df, emb_df, k=3, weight_action=0.65, weight_context=0.35):
    """
    Searches the embeddings database using dual-vector weighting.
    """
    print(f"\nAnalyzing new event situation: {new_event_dict.get('Risk Title', 'Untitled')}")
    
    if emb_df.empty:
        print("No historical embeddings available to search.")
        return []
        
    # 1. Embed the new event as two separate vectors
    new_action_vec = model.encode([format_action_text(new_event_dict)]).astype(np.float32)
    new_context_vec = model.encode([format_context_text(new_event_dict)]).astype(np.float32)
    
    # 2. Extract historical matrices
    matrix_action = np.stack(emb_df['emb_action_array'].values).astype(np.float32)
    matrix_context = np.stack(emb_df['emb_context_array'].values).astype(np.float32)
    emb_risk_ids = emb_df['Risk ID'].values
    
    # 3. Calculate independent scores and combine using weights
    scores_action = cosine_similarity(new_action_vec, matrix_action).flatten()
    scores_context = cosine_similarity(new_context_vec, matrix_context).flatten()
    
    final_scores = (scores_action * weight_action) + (scores_context * weight_context)
    
    actual_k = min(k, len(final_scores))
    top_indices = final_scores.argsort()[-actual_k:][::-1]
    
    print(f"\n=== TOP {actual_k} SIMILAR PAST SITUATIONS ===")
    for rank, idx in enumerate(top_indices):
        sim_score = final_scores[idx]
        matched_id = emb_risk_ids[idx]
        
        match_row = main_df[main_df['Risk ID'] == matched_id].iloc[0]
        
        print(f"\nMatch {rank+1} | Combined Similarity: {sim_score:.3f} (Action: {scores_action[idx]:.3f})")
        print(f"  Risk ID: {match_row.get('Risk ID', 'N/A')} ({match_row.get('Country', 'Unknown')})")
        print(f"  Risk Title: {match_row.get('Risk Title', 'N/A')}")
        print(f"  Risk Level: {match_row.get('Risk Level', 'N/A')} | Status: {match_row.get('Status', 'N/A')}")
        
        rationale = str(match_row.get('Rationale', ''))
        snippet_rat = rationale[:250] + "..." if len(rationale) > 250 else rationale
        print(f"  >> The Situation: {snippet_rat}")
        
        evolution_summary = build_evolution_summary(match_row)
        snippet_evo = evolution_summary[:350] + "..." if len(evolution_summary) > 350 else evolution_summary
        print(f"  >> How it Evolved:\n   {snippet_evo}")

# ==========================================
# Execution
# ==========================================
if __name__ == "__main__":
    
    # 1. Load the Risk Radar Database (Strictly Read-Only)
    try:
        main_df = load_and_filter_main_data(MAIN_CSV)
    except FileNotFoundError:
        print(f"Error: Could not find '{MAIN_CSV}'. Please ensure the file is in the directory.")
        exit(1)
        
    # 2. Sync embeddings into the separate CSV cache
    embeddings_df = sync_embeddings(main_df, EMBEDDINGS_CSV)
    
    # 3. Define a new incoming event situation
    incoming_event = {
        "Risk Title": "Sudden border closure leading to mass deportation and shelter crisis",
        "Risk Type": "New emerging risk",
        "Country": "Lebanon",
        "Rationale": "Neighboring authorities abruptly closed border crossings and began deporting undocumented migrants. Returnees are stranded in makeshift border camps lacking basic sanitation, water, and shelter, creating an immediate protection crisis."
    }
    
    # 4. Search and retrieve the matched situations alongside their evolution
    search_similar_risks(incoming_event, main_df, embeddings_df, k=3, weight_action=0.65, weight_context=0.35)