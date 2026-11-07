# """
# Step 2: ACAPS Deterministic Intensity Scorer (Anchor-and-Bound Model)
# Replaces additive modifier deltas with an Evidence-Anchor model.
# Finds the highest/lowest evidence tiers in text, checks against subindicator priors,
# and updates toward the appropriate bounds (with breakouts permitted for extreme evidence).
# """

# import re
# import pandas as pd
# from difflib import SequenceMatcher
# from typing import List, Dict, Optional

# # Negation / cancellation tokens checked in a 4-word window BEFORE a match
# NEGATION_TOKENS = {
#     "no", "not", "never", "neither", "nor", "none",
#     "zero", "without", "absence", "absent", "denies", "denied",
#     "unconfirmed", "unfounded", "false", "rumour", "rumor",
#     "prevented", "averted", "avoided", "halted", "ceased", "ended"
# }

# # Categories where "without" or "no" is PART of the severe condition itself
# EXEMPT_FROM_WITHOUT_NEGATION = {
#     "wash_shelter_deprivation", "famine_starvation_ipc5", "total_collapse"
# }

# # High-value single tokens (stems) for fast fallback fuzzy/stem token scanning
# FUZZY_ANCHOR_VOCAB = {
#     "famine": (5, "famine_starvation_ipc5"),
#     "starvation": (5, "famine_starvation_ipc5"),
#     "massacre": (5, "mass_atrocities_mortality"),
#     "genocide": (5, "mass_atrocities_mortality"),
#     "destitution": (5, "famine_starvation_ipc5"),
#     "casualties": (4, "direct_mortality"),
#     "fatalities": (4, "direct_mortality"),
#     "airstrikes": (4, "heavy_weaponry_strikes"),
#     "shelling": (4, "heavy_weaponry_strikes"),
#     "bombardment": (4, "heavy_weaponry_strikes"),
#     "besieged": (4, "siege_encirclement"),
#     "blockade": (4, "siege_encirclement"),
#     "atrocities": (4, "grave_hr_violations"),
#     "malnutrition": (4, "severe_hunger_ipc4"),
#     "trafficking": (4, "grave_hr_violations"),
#     "displaced": (3, "displacement_uprooted"),
#     "displacement": (3, "displacement_uprooted"),
#     "refoulement": (3, "displacement_uprooted"),
#     "deportation": (3, "displacement_uprooted"),
#     "kidnapped": (3, "looting_kidnapping_injury"),
#     "abducted": (3, "looting_kidnapping_injury"),
#     "pillage": (3, "looting_kidnapping_injury"),
#     "landmines": (3, "explosive_contamination"),
#     "ordnance": (3, "explosive_contamination"),
#     "cholera": (3, "harmful_coping_ipc3"),
#     "checkpoints": (2, "checkpoints_harassment"),
#     "roadblocks": (2, "checkpoints_harassment"),
#     "extortion": (2, "checkpoints_harassment"),
#     "harassment": (2, "checkpoints_harassment"),
#     "scarcity": (2, "logistical_consumables"),
#     "bureaucratic": (1, "admin_friction"),
#     "impunity": (1, "judicial_impunity"),
#     "paperwork": (1, "admin_friction"),
# }


# class ACAPSIntensityScorer:
#     def __init__(
#         self,
#         subindicator_csv: str = "acaps_subindicator_intensity_scores-v2.csv",
#         modifiers_csv: str = "acaps_severity_modifiers-v3.csv",
#         enable_fuzzy_fallback: bool = True,
#         fuzzy_threshold: float = 0.86
#     ):
#         self.sub_df = pd.read_csv(subindicator_csv)
#         self.mod_df = pd.read_csv(modifiers_csv)
#         self.enable_fuzzy_fallback = enable_fuzzy_fallback
#         self.fuzzy_threshold = fuzzy_threshold

#         # Build O(1) lookup by subindicator code
#         self.sub_lookup = {}
#         for _, row in self.sub_df.iterrows():
#             code = str(row["subindicator_code"]).strip()
#             self.sub_lookup[code] = {
#                 "code": code,
#                 "min": int(row["min_typical_intensity"]),
#                 "typical": int(row["typical_intensity"]),
#                 "max": int(row["max_typical_intensity"]),
#                 "name": row["subindicator_name"]
#             }

#         # Compile regex patterns once
#         self.compiled_rules = []
#         for _, row in self.mod_df.iterrows():
#             self.compiled_rules.append({
#                 "tier": int(row["tier"]),
#                 "category": str(row["category"]),
#                 "match_type": str(row["match_type"]),
#                 "regex": re.compile(row["pattern"], re.IGNORECASE)
#             })

#     @staticmethod
#     def _extract_sub_code(sub_str: str) -> Optional[str]:
#         if not sub_str:
#             return None
#         m = re.match(r"\s*(S\d+\.\d+)", str(sub_str))
#         return m.group(1) if m else None

#     def get_subindicator_prior(self, subindicators: Optional[List[str]]) -> Dict:
#         """Returns combined prior {code, min, typical, max} for a list of subindicators."""
#         if not subindicators:
#             return {"code": "NONE", "min": 2, "typical": 3, "max": 4}

#         matched_priors = []
#         for s in subindicators:
#             code = self._extract_sub_code(s)
#             if code and code in self.sub_lookup:
#                 matched_priors.append(self.sub_lookup[code])

#         if not matched_priors:
#             return {"code": "NONE", "min": 2, "typical": 3, "max": 4}

#         # Select the most severe subindicator logic bounds
#         best = max(matched_priors, key=lambda x: (x["typical"], x["max"]))
#         return {"code": best["code"], "min": best["min"], "typical": best["typical"], "max": best["max"]}

#     @staticmethod
#     def _is_negated(text: str, match_start: int, category: str, window_words: int = 4) -> bool:
#         """Checks the preceding `window_words` before `match_start` for negation tokens within the same clause."""
#         prefix = text[max(0, match_start - 60):match_start].lower()
#         clause = re.split(r"[.;!?]|\bbut\b|\bhowever\b|\balthough\b", prefix)[-1]
#         words = re.findall(r"[a-z]+", clause)
#         preceding = words[-window_words:] if words else []

#         for w in preceding:
#             if w in NEGATION_TOKENS:
#                 if category in EXEMPT_FROM_WITHOUT_NEGATION and w in {"without", "no", "lack", "lacking"}:
#                     continue
#                 return True
#         return False

#     def scan_text_modifiers(self, text: str) -> Dict:
#         """
#         Scans description text using compiled regexes and fuzzy fallback.
#         Returns the highest/lowest tier triggers found.
#         """
#         if not isinstance(text, str) or not text.strip():
#             return {"matched_categories": [], "negated_matches": [], "max_tier_hit": None, "min_tier_hit": None}

#         matched_by_category = {}
#         negated_matches = []

#         # 1. Regex stem & proximity scan
#         for rule in self.compiled_rules:
#             cat = rule["category"]
#             for m in rule["regex"].finditer(text):
#                 matched_span = m.group(0)
#                 if self._is_negated(text, m.start(), cat):
#                     negated_matches.append((cat, matched_span, rule["tier"]))
#                 else:
#                     if cat not in matched_by_category:
#                         matched_by_category[cat] = {
#                             "category": cat,
#                             "tier": rule["tier"],
#                             "matched_text": matched_span,
#                             "method": rule["match_type"]
#                         }

#         # 2. Fuzzy single-token fallback
#         if self.enable_fuzzy_fallback:
#             tokens = [(m.group(0).lower(), m.start()) for m in re.finditer(r"\b[a-z]{6,}\b", text.lower())]
#             for tok, pos in tokens:
#                 for anchor, (tier, cat) in FUZZY_ANCHOR_VOCAB.items():
#                     if cat in matched_by_category:
#                         continue
#                     if abs(len(tok) - len(anchor)) <= 2 and tok[0] == anchor[0]:
#                         ratio = SequenceMatcher(None, tok, anchor).ratio()
#                         if ratio >= self.fuzzy_threshold:
#                             if not self._is_negated(text, pos, cat):
#                                 matched_by_category[cat] = {
#                                     "category": cat,
#                                     "tier": tier,
#                                     "matched_text": f"{tok}~{anchor}({ratio:.2f})",
#                                     "method": "fuzzy_stem"
#                                 }

#         hits = list(matched_by_category.values())
#         if not hits:
#             return {"matched_categories": [], "negated_matches": negated_matches, "max_tier_hit": None, "min_tier_hit": None}

#         max_tier = max(h["tier"] for h in hits)
#         min_tier = min(h["tier"] for h in hits)

#         return {
#             "matched_categories": hits,
#             "negated_matches": negated_matches,
#             "max_tier_hit": max_tier,
#             "min_tier_hit": min_tier,
#             "n_tier4_plus": sum(1 for h in hits if h["tier"] >= 4),
#             "n_tier5": sum(1 for h in hits if h["tier"] == 5)
#         }

#     def score_event(self, description: str, subindicators: Optional[List[str]] = None) -> Dict:
#         """
#         Computes final intensity using an Evidence-Anchor model.
#         """
#         prior = self.get_subindicator_prior(subindicators)
#         scan = self.scan_text_modifiers(description)
        
#         p_min = prior["min"]
#         p_typ = prior["typical"]
#         p_max = prior["max"]
        
#         e_max = scan["max_tier_hit"]
        
#         is_institutional_report = any(h["category"] == "judicial_impunity" for h in scan["matched_categories"])

#         # Baseline Default
#         if e_max is None:
#             final_score = p_typ

#         # ESCALATION (Text is worse than typical baseline)
#         elif e_max > p_typ:
#             # Dampen escalation if it's just an institutional HR report
#             if is_institutional_report and e_max >= 4:
#                 final_score = min(p_max, e_max - 1)
#             else:
#                 # Extreme Breakout Rules
#                 if scan["n_tier5"] > 0:
#                     final_score = 5
#                 elif scan["n_tier4_plus"] >= 2 and p_max < 4:
#                     final_score = 4
#                 else:
#                     # Normal Escalation -> Pulls up to the evidence, but caps at subindicator max
#                     final_score = min(e_max, p_max)

#         # DE-ESCALATION (Text is milder than typical baseline)
#         elif e_max < p_typ:
#             # Pulls down to the evidence, but floors at subindicator min
#             final_score = max(e_max, p_min)

#         # CONFIRMATION (Text perfectly aligns with typical baseline)
#         else:
#             final_score = p_typ

#         return {
#             "subindicator_prior": prior,
#             "text_max_tier": e_max,
#             "final_intensity_score": final_score,
#             "matched_triggers": [(h["category"], f"Tier {h['tier']}: '{h['matched_text']}'") for h in scan["matched_categories"]],
#             "negated_triggers": scan["negated_matches"]
#         }

"""
Step 2: ACAPS Deterministic Intensity Scorer (Anchor-and-Bound Model)
Replaces additive modifier deltas with an Evidence-Anchor model.
Finds the highest/lowest evidence tiers in text, checks against subindicator priors,
and updates toward the appropriate bounds (with breakouts permitted for extreme evidence).
"""

import re
import pandas as pd
from difflib import SequenceMatcher
from typing import List, Dict, Optional

# Negation / cancellation tokens checked in a 4-word window BEFORE a match
NEGATION_TOKENS = {
    "no", "not", "never", "neither", "nor", "none",
    "zero", "without", "absence", "absent", "denies", "denied",
    "unconfirmed", "unfounded", "false", "rumour", "rumor",
    "prevented", "averted", "avoided", "halted", "ceased", "ended"
}

# Categories where "without" or "no" is PART of the severe condition itself
EXEMPT_FROM_WITHOUT_NEGATION = {
    "wash_shelter_deprivation", "famine_starvation_ipc5", "total_collapse"
}

# High-value single tokens (stems) for fast fallback fuzzy/stem token scanning
FUZZY_ANCHOR_VOCAB = {
    "famine": (5, "famine_starvation_ipc5"),
    "starvation": (5, "famine_starvation_ipc5"),
    "massacre": (5, "mass_atrocities_mortality"),
    "genocide": (5, "mass_atrocities_mortality"),
    "destitution": (5, "famine_starvation_ipc5"),
    "casualties": (4, "direct_mortality"),
    "fatalities": (4, "direct_mortality"),
    "airstrikes": (4, "heavy_weaponry_strikes"),
    "shelling": (4, "heavy_weaponry_strikes"),
    "bombardment": (4, "heavy_weaponry_strikes"),
    "besieged": (4, "siege_encirclement"),
    "blockade": (4, "siege_encirclement"),
    "atrocities": (4, "grave_hr_violations"),
    "malnutrition": (4, "severe_hunger_ipc4"),
    "trafficking": (4, "grave_hr_violations"),
    "displaced": (3, "displacement_uprooted"),
    "displacement": (3, "displacement_uprooted"),
    "refoulement": (3, "displacement_uprooted"),
    "deportation": (3, "displacement_uprooted"),
    "kidnapped": (3, "looting_kidnapping_injury"),
    "abducted": (3, "looting_kidnapping_injury"),
    "pillage": (3, "looting_kidnapping_injury"),
    "landmines": (3, "explosive_contamination"),
    "ordnance": (3, "explosive_contamination"),
    "cholera": (3, "harmful_coping_ipc3"),
    "checkpoints": (2, "checkpoints_harassment"),
    "roadblocks": (2, "checkpoints_harassment"),
    "extortion": (2, "checkpoints_harassment"),
    "harassment": (2, "checkpoints_harassment"),
    "scarcity": (2, "logistical_consumables"),
    "bureaucratic": (1, "admin_friction"),
    "impunity": (1, "judicial_impunity"),
    "paperwork": (1, "admin_friction"),
}


class ACAPSIntensityScorer:
    def __init__(
        self,
        subindicator_csv: str = "acaps_subindicator_intensity_scores-v2.csv",
        modifiers_csv: str = "acaps_severity_modifiers-v3.csv",
        enable_fuzzy_fallback: bool = True,
        fuzzy_threshold: float = 0.86
    ):
        self.sub_df = pd.read_csv(subindicator_csv)
        self.mod_df = pd.read_csv(modifiers_csv)
        self.enable_fuzzy_fallback = enable_fuzzy_fallback
        self.fuzzy_threshold = fuzzy_threshold

        # Build O(1) lookup by subindicator code
        self.sub_lookup = {}
        for _, row in self.sub_df.iterrows():
            code = str(row["subindicator_code"]).strip()
            self.sub_lookup[code] = {
                "code": code,
                "min": int(row["min_typical_intensity"]),
                "typical": int(row["typical_intensity"]),
                "max": int(row["max_typical_intensity"]),
                "name": row["subindicator_name"]
            }

        # Compile regex patterns once
        self.compiled_rules = []
        for _, row in self.mod_df.iterrows():
            self.compiled_rules.append({
                "tier": int(row["tier"]),
                "category": str(row["category"]),
                "match_type": str(row["match_type"]),
                "regex": re.compile(row["pattern"], re.IGNORECASE)
            })
            
        # Dynamically inject programmatic stabilizers and baseline overrides 
        self.compiled_rules.extend([
            {
                "tier": 1,
                "category": "political_context",
                "match_type": "stem_regex",
                "regex": re.compile(r"\b(politic\w*|election\w*|parliament\w*|diplomat\w*|protest\w*|campaign\w*)\b", re.IGNORECASE)
            },
            {
                "tier": 2,
                "category": "general_violence",
                "match_type": "stem_regex",
                "regex": re.compile(r"\b(violence|clash\w*)\b", re.IGNORECASE)
            }
        ])

    @staticmethod
    def _extract_sub_code(sub_str: str) -> Optional[str]:
        if not sub_str:
            return None
        m = re.match(r"\s*(S\d+\.\d+)", str(sub_str))
        return m.group(1) if m else None

    def get_subindicator_prior(self, subindicators: Optional[List[str]]) -> Dict:
        """Returns combined prior {code, min, typical, max} for a list of subindicators."""
        if not subindicators:
            return {"code": "NONE", "min": 2, "typical": 3, "max": 4}

        matched_priors = []
        for s in subindicators:
            code = self._extract_sub_code(s)
            if code and code in self.sub_lookup:
                matched_priors.append(self.sub_lookup[code])

        if not matched_priors:
            return {"code": "NONE", "min": 2, "typical": 3, "max": 4}

        # Select the most severe subindicator logic bounds
        best = max(matched_priors, key=lambda x: (x["typical"], x["max"]))
        return {"code": best["code"], "min": best["min"], "typical": best["typical"], "max": best["max"]}

    @staticmethod
    def _is_negated(text: str, match_start: int, category: str, window_words: int = 4) -> bool:
        """Checks the preceding `window_words` before `match_start` for negation tokens within the same clause."""
        prefix = text[max(0, match_start - 60):match_start].lower()
        clause = re.split(r"[.;!?]|\bbut\b|\bhowever\b|\balthough\b", prefix)[-1]
        words = re.findall(r"[a-z]+", clause)
        preceding = words[-window_words:] if words else []

        for w in preceding:
            if w in NEGATION_TOKENS:
                if category in EXEMPT_FROM_WITHOUT_NEGATION and w in {"without", "no", "lack", "lacking"}:
                    continue
                return True
        return False

    def scan_text_modifiers(self, text: str) -> Dict:
        """
        Scans description text using compiled regexes and fuzzy fallback.
        Returns the highest/lowest tier triggers found.
        """
        if not isinstance(text, str) or not text.strip():
            return {"matched_categories": [], "negated_matches": [], "max_tier_hit": None, "min_tier_hit": None}

        matched_by_category = {}
        negated_matches = []

        # 1. Regex stem & proximity scan
        for rule in self.compiled_rules:
            cat = rule["category"]
            for m in rule["regex"].finditer(text):
                matched_span = m.group(0)
                if self._is_negated(text, m.start(), cat):
                    negated_matches.append((cat, matched_span, rule["tier"]))
                else:
                    if cat not in matched_by_category:
                        matched_by_category[cat] = {
                            "category": cat,
                            "tier": rule["tier"],
                            "matched_text": matched_span,
                            "method": rule["match_type"]
                        }

        # 2. Fuzzy single-token fallback
        if self.enable_fuzzy_fallback:
            tokens = [(m.group(0).lower(), m.start()) for m in re.finditer(r"\b[a-z]{6,}\b", text.lower())]
            for tok, pos in tokens:
                for anchor, (tier, cat) in FUZZY_ANCHOR_VOCAB.items():
                    if cat in matched_by_category:
                        continue
                    if abs(len(tok) - len(anchor)) <= 2 and tok[0] == anchor[0]:
                        ratio = SequenceMatcher(None, tok, anchor).ratio()
                        if ratio >= self.fuzzy_threshold:
                            if not self._is_negated(text, pos, cat):
                                matched_by_category[cat] = {
                                    "category": cat,
                                    "tier": tier,
                                    "matched_text": f"{tok}~{anchor}({ratio:.2f})",
                                    "method": "fuzzy_stem"
                                }

        hits = list(matched_by_category.values())
        if not hits:
            return {"matched_categories": [], "negated_matches": negated_matches, "max_tier_hit": None, "min_tier_hit": None}

        max_tier = max(h["tier"] for h in hits)
        min_tier = min(h["tier"] for h in hits)

        return {
            "matched_categories": hits,
            "negated_matches": negated_matches,
            "max_tier_hit": max_tier,
            "min_tier_hit": min_tier,
            "n_tier4_plus": sum(1 for h in hits if h["tier"] >= 4),
            "n_tier5": sum(1 for h in hits if h["tier"] == 5)
        }

    def score_event(self, description: str, subindicators: Optional[List[str]] = None) -> Dict:
        """
        Computes final intensity using an Evidence-Anchor model.
        """
        prior = self.get_subindicator_prior(subindicators)
        scan = self.scan_text_modifiers(description)
        
        p_min = prior["min"]
        p_typ = prior["typical"]
        p_max = prior["max"]
        
        e_max = scan["max_tier_hit"]
        
        is_institutional_report = any(h["category"] == "judicial_impunity" for h in scan["matched_categories"])
        is_political = any(h["category"] == "political_context" for h in scan["matched_categories"])

        # Baseline Default
        if e_max is None:
            final_score = p_typ

        # ESCALATION (Text is worse than typical baseline)
        elif e_max > p_typ:
            # Dampen escalation if it's just an institutional HR report or political tension
            if (is_institutional_report or is_political) and e_max >= 4:
                # Require explicit compound mass atrocities to override the dampener
                if scan["n_tier4_plus"] >= 2:
                    final_score = 4
                else:
                    final_score = min(p_max, e_max - 1)
            else:
                # Extreme Breakout Rules
                if scan["n_tier5"] > 0:
                    final_score = 5
                elif scan["n_tier4_plus"] >= 2 and p_max < 4:
                    final_score = 4
                else:
                    # Normal Escalation -> Pulls up to the evidence, but caps at subindicator max
                    final_score = min(e_max, p_max)

        # DE-ESCALATION (Text is milder than typical baseline)
        elif e_max < p_typ:
            # Pulls down to the evidence, but floors at subindicator min
            final_score = max(e_max, p_min)

        # CONFIRMATION (Text perfectly aligns with typical baseline)
        else:
            final_score = p_typ

        return {
            "subindicator_prior": prior,
            "text_max_tier": e_max,
            "final_intensity_score": final_score,
            "matched_triggers": [(h["category"], f"Tier {h['tier']}: '{h['matched_text']}'") for h in scan["matched_categories"]],
            "negated_triggers": scan["negated_matches"]
        }
