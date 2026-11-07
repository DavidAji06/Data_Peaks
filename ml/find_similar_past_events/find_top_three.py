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
MODEL_NAME = "all-MiniLM-L6-v2"

print(f"Loading embedding model '{MODEL_NAME}'...")
model = SentenceTransformer(MODEL_NAME)

def format_situation_text(row):
    """
    Extracts ONLY the situation data for the embedding.
    Explicitly excludes 'Impact materialisation description' or 'Status' 
    so the match is based entirely on the initial risk conditions.
    """
    return (
        f"Risk Type: {row.get('Risk Type', 'Unknown')}. "
        f"Location: {row.get('Country', 'Unknown')}. "
        f"Title: {row.get('Risk Title', '')}. "
        f"Situation/Rationale: {row.get('Rationale', '')}"
    )

def sync_embeddings(main_df, emb_csv_path):
    """
    Reads the main CSV and the embeddings CSV. If any Risk IDs in the main CSV 
    are missing from the embeddings CSV, it calculates them and appends them.
    The main CSV is strictly READ-ONLY.
    """
    # Load existing embeddings if available
    if os.path.exists(emb_csv_path):
        emb_df = pd.read_csv(emb_csv_path)
    else:
        emb_df = pd.DataFrame(columns=['Risk ID', 'embedding'])

    # Find Risk IDs that exist in the Main CSV but NOT in the Embeddings CSV
    existing_ids = set(emb_df['Risk ID'].dropna().astype(str))
    main_ids = set(main_df['Risk ID'].dropna().astype(str))
    missing_ids = main_ids - existing_ids

    if missing_ids:
        print(f"Found {len(missing_ids)} new risk(s). Calculating situation embeddings...")
        
        # Filter main dataframe for missing IDs
        missing_df = main_df[main_df['Risk ID'].astype(str).isin(missing_ids)]
        
        # Generate texts based strictly on the situation
        texts = missing_df.apply(format_situation_text, axis=1).tolist()
        
        # Calculate embeddings
        new_embeddings = model.encode(texts).astype(np.float32)
        
        # Prepare new rows for the separate embeddings CSV
        new_rows = pd.DataFrame({
            'Risk ID': missing_df['Risk ID'].values,
            'embedding': [json.dumps(vec.tolist()) for vec in new_embeddings]
        })
        
        # Append to embeddings CSV (create header if it's a new file)
        new_rows.to_csv(emb_csv_path, mode='a', header=not os.path.exists(emb_csv_path), index=False)
        print(f"Appended {len(missing_ids)} new embeddings to '{emb_csv_path}'.")
        
        # Reload to get the complete mapped set
        emb_df = pd.read_csv(emb_csv_path)
    else:
        print(f"All {len(main_ids)} risks already have embeddings. No updates needed.")

    # Convert stringified JSON back to numpy arrays for calculation
    emb_df['embedding_array'] = emb_df['embedding'].apply(json.loads).apply(np.array)
    return emb_df

def search_similar_risks(new_event_dict, main_df, emb_df, k=3):
    """
    Embeds the new event based on its situation, searches the embeddings database, 
    and joins with the main dataframe to display both the matched situation 
    AND how it ultimately evolved.
    """
    # 1. Format and Embed the incoming event (Situation only)
    new_text = format_situation_text(new_event_dict)
    print(f"\nAnalyzing new event situation: {new_event_dict.get('Risk Title', 'Untitled')}")
    
    new_vector = model.encode([new_text]).astype(np.float32)
    
    # 2. Extract historical matrix and align Risk IDs
    historical_matrix = np.stack(emb_df['embedding_array'].values).astype(np.float32)
    emb_risk_ids = emb_df['Risk ID'].values
    
    # 3. Calculate cosine similarity
    scores = cosine_similarity(new_vector, historical_matrix).flatten()
    top_indices = scores.argsort()[-k:][::-1]
    
    print(f"\n=== TOP {k} SIMILAR PAST SITUATIONS ===")
    for rank, idx in enumerate(top_indices):
        sim_score = scores[idx]
        matched_id = emb_risk_ids[idx]
        
        # Retrieve the full context from the unmodified main CSV
        # (This is where we grab the evolutionary data that wasn't embedded)
        match_row = main_df[main_df['Risk ID'] == matched_id].iloc[0]
        
        print(f"\nMatch {rank+1} | Similarity: {sim_score:.3f}")
        print(f"  Risk ID: {match_row.get('Risk ID', 'N/A')} ({match_row.get('Country', 'Unknown')})")
        print(f"  Risk Title: {match_row.get('Risk Title', 'N/A')}")
        print(f"  Risk Level: {match_row.get('Risk Level', 'N/A')} | Status: {match_row.get('Status', 'N/A')}")
        
        # Display the Situation (What drove the similarity match)
        rationale = str(match_row.get('Rationale', ''))
        snippet_rat = rationale[:250] + "..." if len(rationale) > 250 else rationale
        print(f"  >> The Situation: {snippet_rat}")
        
        # Display how it Evolved (Context to help the experts act on the new event)
        evolution = str(match_row.get('Impact materialisation description', ''))
        if pd.isna(evolution) or not evolution.strip() or evolution.lower() == 'nan':
            evolution = "Event has not materialised yet or no description provided in the dataset."
        snippet_evo = evolution[:250] + "..." if len(evolution) > 250 else evolution
        print(f"  >> How it Evolved: {snippet_evo}")

# ==========================================
# Execution
# ==========================================
if __name__ == "__main__":
    
    # 1. Load the Risk Radar Database (Strictly Read-Only)
    try:
        main_df = pd.read_csv(MAIN_CSV)
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
    search_similar_risks(incoming_event, main_df, embeddings_df, k=3)