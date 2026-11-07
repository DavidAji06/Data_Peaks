"""
Step 3: ACAPS Rubric Anchor Embedding & Cosine Similarity Scorer
- Strips semantically irrelevant boilerplate AND negated contrast clauses from the 5 ACAPS rubric definitions.
- Embeds the 5 distilled rubric anchors and any input sentence/description.
- Computes Cosine Similarity against each of the 5 anchors.
- Outputs a 5-element probability distribution [P(T1), P(T2), P(T3), P(T4), P(T5)] via temperature-scaled Softmax.
"""

import re
import numpy as np
from typing import List, Dict, Union, Tuple

# 1. RAW ACAPS RUBRIC DESCRIPTIONS (for reference)
RAW_RUBRIC_DESCRIPTIONS = {
    1: (
        "People are facing none or minor shortages or/and accessibility problems regarding basic "
        "services, such as food, health, shelter, and wash. People are able to meet basic needs without "
        "having to apply to irreversible coping strategies. There may be some needs but are not life-threatening."
    ),
    2: (
        "People are facing some shortages or/and some availability and accessibility problems in "
        "regard to basic services, but they are not life-threatening. Needs are more increased but are "
        "still not life-threatening. The affected population can meet their need by applying copying "
        "strategies. There may exist localized/targeted incidents of violence and/or human rights violations."
    ),
    3: (
        "People are facing shortages and/or availability and accessibility problems in regard to basic "
        "services that cause discomfort and/or high level of suffering which can result in irreversible "
        "damages to the health status, but they are not life-threatening. Significant gaps are visible, or "
        "people are marginally able to meet minimum needs only with irreversible coping strategies. "
        "As a result of shortages and disruption of services, may face potentially life-threatening "
        "consequences if not provided assistance. People may also face malnutrition. There may be "
        "physical and mental harm in populations resulting in a loss of dignity."
    ),
    4: (
        "People are facing life-threatening conditions and significant shortages and/or availability and "
        "accessibility problems in regard to basic services causing high level of suffering and "
        "irreversible damages to health status. People may face severe food consumption gaps and "
        "have started to deplete their assets or already face an extreme loss of assets. This may result "
        "in very high levels of acute malnutrition and excess mortality. Presence of irreversible harm "
        "and heightened mortality as well as widespread grave violations of human rights."
    ),
    5: (
        "People are facing extreme shortages or availability and accessibility problems in regard to "
        "basic services. Deaths are directly caused by the current conditions and there is widespread "
        "mortality. People face a complete lack of food and/or other basic needs and starvation, death, "
        "and destitution are evident. Acute malnutrition may be widely reported. They may face grave "
        "human rights violations."
    ),
}

# 2. DISTILLED SEMANTIC ANCHORS (Boilerplate + Negated Contrast Phrases Stripped)
# Why strip negated phrases? In Tier 1 & 2, the raw rubric says "without irreversible coping strategies"
# and "not life-threatening". Embedding models have high cosine similarity between "not life-threatening"
# and "life-threatening"! Stripping shared boilerplate ("People are facing... in regard to basic services")
# and negated contrasts isolates the pure positive semantic signal of each tier.
DISTILLED_RUBRIC_ANCHORS = {
    1: (
        "none or minor shortages, minor accessibility delays. "
        "able to meet basic needs easily, normal routine conditions, safe and manageable."
    ),
    2: (
        "some shortages, moderate availability and accessibility constraints. "
        "increased needs met by applying standard coping strategies. "
        "localized or targeted incidents of violence, isolated human rights violations."
    ),
    3: (
        "shortages and disruption of services causing discomfort, high suffering, and irreversible health damage. "
        "significant gaps visible, marginally able to meet minimum needs only with irreversible coping strategies. "
        "malnutrition, physical and mental harm, loss of dignity, urgent assistance required."
    ),
    4: (
        "life-threatening conditions, significant shortages, high suffering, irreversible damage to health. "
        "severe food consumption gaps, asset depletion, extreme loss of assets. "
        "very high acute malnutrition, excess and heightened mortality, widespread grave violations of human rights."
    ),
    5: (
        "extreme catastrophic shortages, complete lack of food and basic needs. "
        "deaths directly caused by current conditions, widespread mortality, starvation, death, famine, destitution evident. "
        "widespread acute malnutrition and grave human rights violations."
    ),
}

# Stopwords and shared rubric filler tokens to strip if preprocessing raw text dynamically
RUBRIC_BOILERPLATE_PATTERNS = [
    r"\bpeople are facing\b",
    r"\bin regard to basic services\b",
    r"\bregarding basic services, such as food, health, shelter, and wash\b",
    r"\bavailability and accessibility problems\b",
    r"\bwithout having to apply to irreversible coping strategies\b",
    r"\bbut (?:they )?are (?:still )?not life-threatening\b",
    r"\bthere may be\b",
    r"\bpeople may (?:also )?face\b",
    r"\bthis may result in\b",
]


def strip_irrelevant_rubric_words(text: str) -> str:
    """Programmatically strips shared ACAPS boilerplate and negated contrast clauses from rubric text."""
    cleaned = text.lower()
    for pat in RUBRIC_BOILERPLATE_PATTERNS:
        cleaned = re.sub(pat, " ", cleaned, flags=re.IGNORECASE)
    # Remove extra whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class ACAPSRubricEmbeddingScorer:
    """
    Embeds the 5 distilled ACAPS rubric anchors and computes a 5-element probability
    distribution for any input sentence/event description using Cosine Similarity + Softmax.
    """

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        softmax_temperature: float = 0.08,
        use_distilled_anchors: bool = True,
        backend: str = "auto"
    ):
        """
        Args:
            model_name: HuggingFace sentence-transformers model name.
            softmax_temperature: Controls sharpness of the 5-class probability distribution.
                                 Lower values (e.g., 0.05 - 0.10) sharpen raw cosine similarities (which typically
                                 cluster between 0.20 and 0.65) into a clear probability distribution.
            use_distilled_anchors: If True, uses the cleaned DISTILLED_RUBRIC_ANCHORS.
            backend: 'sentence_transformers', 'tfidf_ngram' (offline fallback), or 'auto'.
        """
        self.model_name = model_name
        self.temperature = softmax_temperature
        self.anchors_dict = DISTILLED_RUBRIC_ANCHORS if use_distilled_anchors else {
            k: strip_irrelevant_rubric_words(v) for k, v in RAW_RUBRIC_DESCRIPTIONS.items()
        }
        self.anchor_texts = [self.anchors_dict[i] for i in range(1, 6)]
        self.backend = backend
        self.model = None
        self.vectorizer = None
        self.anchor_embeddings = None

        self._init_backend()

    def _init_backend(self):
        if self.backend in ("auto", "sentence_transformers"):
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer(self.model_name)
                # Normalize embeddings so dot product == cosine similarity
                self.anchor_embeddings = self.model.encode(
                    self.anchor_texts, normalize_embeddings=True, convert_to_numpy=True
                )
                self.backend = "sentence_transformers"
                return
            except Exception as e:
                if self.backend == "sentence_transformers":
                    raise RuntimeError(f"Failed to load SentenceTransformer('{self.model_name}'): {e}")
                print(f"[Info] sentence-transformers unavailable ({e}); falling back to TF-IDF char/word n-gram cosine similarity.")

        # Fallback: Scikit-learn L2-normalized TF-IDF (word + char_wb n-grams for morphological stem matching)
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.preprocessing import normalize
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 3),
            stop_words="english",
            sublinear_tf=True
        )
        self.anchor_embeddings = normalize(self.vectorizer.fit_transform(self.anchor_texts).toarray(), norm="l2")
        self.backend = "tfidf_ngram"

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """Embeds and L2-normalizes a list of input sentences."""
        if self.backend == "sentence_transformers":
            return self.model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        else:
            from sklearn.preprocessing import normalize
            vecs = self.vectorizer.transform(texts).toarray()
            return normalize(vecs, norm="l2")

    @staticmethod
    def _softmax(similarities: np.ndarray, temperature: float) -> np.ndarray:
        """Applies temperature-scaled softmax along the last axis to produce a 5-element probability vector."""
        scaled = similarities / max(temperature, 1e-6)
        # Subtract max for numerical stability
        shifted = scaled - np.max(scaled, axis=-1, keepdims=True)
        exp_vals = np.exp(shifted)
        return exp_vals / np.sum(exp_vals, axis=-1, keepdims=True)

    def score_sentence(self, sentence: str) -> Dict[str, Union[np.ndarray, int, float, List[float]]]:
        """
        Embeds a single input sentence, computes cosine similarity against the 5 rubric anchors,
        and returns:
          - 'cosine_similarities': 5-element list of raw cosine similarities [-1, 1]
          - 'probability_distribution': 5-element vector [P(Tier 1), ..., P(Tier 5)] summing to 1.0
          - 'predicted_tier': argmax tier (1 to 5)
          - 'expected_value_tier': continuous weighted average sum_{i=1..5} i * P(Tier i)
        """
        vec = self.embed_texts([sentence])[0]  # shape: (D,)
        # Since both vec and anchor_embeddings are L2-normalized, dot product == Cosine Similarity
        cos_sim = np.dot(self.anchor_embeddings, vec)  # shape: (5,)
        probs = self._softmax(cos_sim, self.temperature)  # shape: (5,)

        tiers = np.array([1, 2, 3, 4, 5], dtype=float)
        expected_tier = float(np.dot(tiers, probs))
        pred_tier = int(np.argmax(probs) + 1)

        return {
            "cosine_similarities": [round(float(x), 4) for x in cos_sim],
            "probability_distribution": [round(float(x), 4) for x in probs],
            "predicted_tier": pred_tier,
            "expected_value_tier": round(expected_tier, 2)
        }

    def score_batch(self, sentences: List[str]) -> np.ndarray:
        """
        Fast vectorized scoring for thousands of sentences at once.
        Returns an (N, 5) numpy array where each row is the 5-element probability distribution.
        """
        vecs = self.embed_texts(sentences)  # shape: (N, D)
        cos_sims = np.dot(vecs, self.anchor_embeddings.T)  # shape: (N, 5)
        probs = self._softmax(cos_sims, self.temperature)  # shape: (N, 5)
        return probs


if __name__ == "__main__":
    scorer = ACAPSRubricEmbeddingScorer(softmax_temperature=0.08)
    print(f"Initialized ACAPSRubricEmbeddingScorer (Backend: {scorer.backend})\n")

    test_sentences = [
        "Minor administrative delays at routine checkpoints; people can meet basic needs easily.",
        "Localized violence and some shortages reported, forcing households to apply coping strategies.",
        "Disruption of water services and significant gaps causing high suffering and loss of dignity.",
        "Life-threatening shortages, severe food consumption gaps, acute malnutrition, and excess mortality.",
        "Widespread mortality, complete lack of food, starvation, famine, and destitution are evident."
    ]

    for idx, sent in enumerate(test_sentences, 1):
        res = scorer.score_sentence(sent)
        print(f"Test {idx}: {sent[:70]}...")
        print(f"  Cosine Sim (T1..T5): {res['cosine_similarities']}")
        print(f"  Prob Dist  (T1..T5): {res['probability_distribution']} (Sum={sum(res['probability_distribution']):.2f})")
        print(f"  Predicted Tier: {res['predicted_tier']} | Expected Value: {res['expected_value_tier']}\n")
