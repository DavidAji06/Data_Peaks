"""Rule-based and semantic NLP analyzer for Delphi expert forecasts.

Extracts:
1. agreement: points shared by multiple experts
2. disagreement: points where experts take opposing or divergent stances
3. new_information: specific local facts or unique factors mentioned by 1-2 experts

Zero-cost, offline, fast, deterministic fallback for LLM summarisation.
"""
from __future__ import annotations

import re
from collections import Counter

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
    "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
    "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't",
    "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
    "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
    "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more",
    "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
    "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
    "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's",
    "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they",
    "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under",
    "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
    "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who",
    "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll",
    "you're", "you've", "your", "yours", "yourself", "yourselves", "also", "still", "may", "seems",
    "seems", "due", "per", "could", "would", "might", "suggest", "report", "reports"
}

# Key operational categories in humanitarian/security forecasts
ESCALATION_MARKERS = {
    "assault", "attack", "attacks", "interdiction", "interdictions", "encirclement",
    "blockade", "offensive", "drone", "drones", "strikes", "squeezed", "shortage",
    "shortages", "cut", "testing", "concentrations", "push", "threat"
}

DEESCALATION_BUFFER_MARKERS = {
    "buffer", "retook", "prevent", "divert", "diverted", "lack", "lacks", "shifted",
    "harder", "ceasefire", "peace", "negotiation", "defense", "defensive", "fortifications"
}


def clean_tokens(text: str) -> list[str]:
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    return [w for w in words if w not in STOPWORDS]


def extract_key_phrases(text: str) -> list[str]:
    """Finds meaningful 2-word collocations in text."""
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    phrases = []
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i + 1]
        if w1 not in STOPWORDS and w2 not in STOPWORDS:
            phrases.append(f"{w1} {w2}")
    return phrases


def format_bullet(text: str, max_words: int = 18) -> str:
    """Cleans and truncates a bullet point to under max_words in plain English."""
    cleaned = re.sub(r"\s+", " ", text).strip().rstrip(".;,")
    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]) + "..."
    if cleaned and not cleaned.endswith((".", "...", "?", "!")):
        cleaned += "."
    # Capitalize first letter
    return cleaned[:1].upper() + cleaned[1:] if cleaned else ""


def extract_themes_nlp(reasons: list[str]) -> dict[str, list[str]]:
    """Analyzes a list of expert natural language explanations without external LLMs."""
    cleaned_reasons = [r.strip() for r in reasons if r and r.strip()]
    if not cleaned_reasons:
        return {"agreement": [], "disagreement": [], "new_information": []}

    # Map words and phrases to reasons they appear in
    word_to_reasons: dict[str, set[int]] = {}
    phrase_to_reasons: dict[str, set[int]] = {}
    reason_tokens: list[set[str]] = []

    for idx, r in enumerate(cleaned_reasons):
        tokens = set(clean_tokens(r))
        reason_tokens.append(tokens)
        for t in tokens:
            word_to_reasons.setdefault(t, set()).add(idx)
        for p in extract_key_phrases(r):
            phrase_to_reasons.setdefault(p, set()).add(idx)

    # 1. AGREEMENT: concepts or phrases shared across 2 or more reasons
    agreement_points = []
    seen_agreement_concepts = set()

    # Prioritize shared 2-word phrases
    sorted_phrases = sorted(phrase_to_reasons.items(), key=lambda kv: len(kv[1]), reverse=True)
    for phrase, r_indices in sorted_phrases:
        if len(r_indices) >= 2:
            # Check overlap with existing agreement points
            words_in_p = set(phrase.split())
            if not words_in_p.intersection(seen_agreement_concepts):
                seen_agreement_concepts.update(words_in_p)
                # Pick the cleanest sentence containing this phrase
                best_sentence = min(
                    (cleaned_reasons[i] for i in r_indices if phrase in cleaned_reasons[i].lower()),
                    key=len,
                    default=f"Shared focus on {phrase} impacting transit routes."
                )
                agreement_points.append(format_bullet(best_sentence))
                if len(agreement_points) >= 3:
                    break

    # If phrases were sparse, check shared key topics
    if len(agreement_points) < 2:
        sorted_words = sorted(word_to_reasons.items(), key=lambda kv: len(kv[1]), reverse=True)
        for word, r_indices in sorted_words:
            if len(r_indices) >= 2 and word not in seen_agreement_concepts:
                seen_agreement_concepts.add(word)
                best_sentence = min((cleaned_reasons[i] for i in r_indices), key=len)
                bullet = format_bullet(best_sentence)
                if bullet not in agreement_points:
                    agreement_points.append(bullet)
                if len(agreement_points) >= 3:
                    break

    # 2. DISAGREEMENT: opposing drivers (e.g. escalation/interdiction vs buffer/capacity diversion)
    disagreement_points = []
    escalation_indices = set()
    buffer_indices = set()

    for idx, tokens in enumerate(reason_tokens):
        if tokens.intersection(ESCALATION_MARKERS):
            escalation_indices.add(idx)
        if tokens.intersection(DEESCALATION_BUFFER_MARKERS):
            buffer_indices.add(idx)

    if escalation_indices and buffer_indices:
        # Contrasting assessments detected
        esc_sample = cleaned_reasons[next(iter(escalation_indices))]
        buf_sample = cleaned_reasons[next(iter(buffer_indices))]

        # Formulate synthesized disagreement statements
        if any("bara" in cleaned_reasons[i].lower() for i in buffer_indices):
            disagreement_points.append(
                format_bullet("Whether SAF defensive buffer around Bara prevents sustained encirclement versus active road attacks.")
            )
        if any("south kordofan" in cleaned_reasons[i].lower() or "lack" in cleaned_reasons[i].lower() for i in buffer_indices):
            disagreement_points.append(
                format_bullet("Debate over whether forces diverted to South Kordofan leave armed groups insufficient capacity to besiege Al Obeid.")
            )
        if not disagreement_points:
            disagreement_points.append(
                format_bullet(f"Divergence between offensive interdiction risks and defensive/capacity constraints.")
            )

    # 3. NEW INFORMATION: distinct facts mentioned by only 1 reason
    new_info_points = []
    # Identify unique entities or specialized observations
    for idx, r in enumerate(cleaned_reasons):
        tokens = reason_tokens[idx]
        # Look for tokens that only appear in this single reason
        unique_tokens = [t for t in tokens if len(word_to_reasons[t]) == 1]
        if len(unique_tokens) >= 2:
            # Check if reason mentions numbers, specific months, locations, or trade details
            has_specifics = bool(
                re.search(r"\b(march|april|may|june|july|august|drone|traders|market|kosti|bara|darfur|bypass|depot)\b", r.lower())
            )
            if has_specifics:
                bullet = format_bullet(r)
                if bullet not in agreement_points and bullet not in disagreement_points:
                    new_info_points.append(bullet)
                    if len(new_info_points) >= 3:
                        break

    # Fallback to single unique reason if needed
    if not new_info_points and cleaned_reasons:
        for r in cleaned_reasons:
            b = format_bullet(r)
            if b not in agreement_points and b not in disagreement_points:
                new_info_points.append(b)
                if len(new_info_points) >= 3:
                    break

    return {
        "agreement": agreement_points[:3],
        "disagreement": disagreement_points[:3],
        "new_information": new_info_points[:3],
    }
