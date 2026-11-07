"""Student models (offline fallback): TF-IDF + LightGBM trained on the LLM's v7 labels.

    python -m ml.pipeline.student      # train on all LLM labels (gold events excluded) and save
    python -m ml.pipeline.score_text --offline --country Chad --text "..."   # use it on one text

Evaluation lives in ml.pipeline.student_timesplit (time split, variant and routing choice).
Two classifiers (class_weight=balanced), each predicting a 1-5 score as the rounded expected
value of its probabilities (variant `ev_bal`, chosen on the time-split validation slice):
  intensity: TF-IDF(1-2 grams, 3000) on description + one-hot indicator & subindicator
             + INFORM Risk Vulnerability and Lack of Coping Capacity (country)
             + v7 rule features (death count, destruction, displacement, food-aid loss, famine)
             then the v7 rule floor: 300+ dead or famine deaths -> at least 5, 4+ dead -> at least 4
  exposure:  regex people-numbers from the description + country population
             + country_wide + number of adm1 regions + one-hot targeted groups
             + TF-IDF on description

Output: ml/artifacts/student.joblib
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import cohen_kappa_score
from sklearn.preprocessing import MultiLabelBinarizer

from ml.pipeline.country_context import country_table
from ml.pipeline.impact import band

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "ml" / "artifacts" / "student.joblib"
TARGETS = {"intensity": "intensity_score", "exposure": "exposure_score"}
ACCEPT_MAX = 0.55
ACCEPT_ADJACENT_SUM = 0.85
SEED = 42

# --------------------------------------------------------------------------- #
# Regex people-numbers
# --------------------------------------------------------------------------- #
_PEOPLE = (r"people|persons|individuals|civilians|residents|inhabitants|refugees|returnees|"
           r"migrants|households|families|children|women|students|patients|idps?|"
           r"internally displaced|displaced|asylum[- ]seekers|beneficiaries|villagers")
PEOPLE_NUMBER_RX = re.compile(
    r"\b(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?P<mult>million|thousand)?"
    rf"(?P<gap>(?:\s+[\w'-]+){{0,4}}?)\s+(?P<who>{_PEOPLE})\b", re.I)
_YEAR = re.compile(r"(?:19|20)\d\d")


def people_numbers(text: str) -> list[float]:
    """Numbers followed (within 4 words) by a people noun; households/families x 5."""
    out = []
    for m in PEOPLE_NUMBER_RX.finditer(text or ""):
        num, mult = m.group("num"), m.group("mult")
        if not mult and _YEAR.fullmatch(num):
            continue
        n = float(num.replace(",", ""))
        n *= {"million": 1e6, "thousand": 1e3}.get((mult or "").lower(), 1)
        if m.group("who").lower() in ("households", "families"):
            n *= 5
        out.append(n)
    return out


def regex_pin(text: str) -> float | None:
    nums = people_numbers(text)
    return max(nums) if nums else None


# --------------------------------------------------------------------------- #
# Rule features (prompt v7): death counts, destruction, displacement, food-aid loss
# --------------------------------------------------------------------------- #
_NUMWORD = {"one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
            "eight": 8, "nine": 9, "ten": 10, "dozen": 12, "dozens": 24, "scores": 40,
            "hundreds": 200, "thousands": 2000}
_N = r"(\d{1,3}(?:,\d{3})+|\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|dozens?|scores|hundreds|thousands)"
_DEAD = r"(?:killed|dead|died|deaths|fatalities|lives)"
DEATHS_RX = [  # "57 civilians were killed", "killing 57", "claimed the lives of 12"
    re.compile(rf"\b{_N}\s+(?:[\w'-]+\s+){{0,4}}?(?:were\s+|have\s+been\s+|had\s+been\s+|was\s+)?{_DEAD}\b", re.I),
    re.compile(rf"\b(?:killed|killing|claimed the lives of|death toll (?:of|rose to|reached))\s+"
               rf"(?:at least\s+|over\s+|more than\s+|nearly\s+|about\s+|around\s+)?{_N}\b", re.I),
]
PLURAL_KILL_RX = re.compile(r"\bkillings\b|\b(?:civilians|people|aid workers|villagers|residents)\s+"
                            r"(?:were|have been)\s+killed\b|\bseveral (?:people )?(?:dead|killed|deaths)\b", re.I)
DESTROY_RX = re.compile(r"\b(?:burn\w*|torch\w*|set fire|destroy\w*|razed)\b.{0,60}\b(?:homes?|houses?|village|"
                        r"health (?:centre|center|facility)|hospital|clinic|granar\w*|market)", re.I)
DISPLACE_RX = re.compile(r"\b(?:displac\w*|fled|flee\w*|forced to leave)\b", re.I)
FAMINE_RX = re.compile(r"\b(?:famine|starvation|starving|IPC Phase 5|catastrophic hunger)\b", re.I)


def max_deaths(text: str) -> float:
    """Largest death count stated in the text (0 = none found). Years are skipped."""
    best = 0.0
    for rx in DEATHS_RX:
        for m in rx.finditer(text or ""):
            tok = m.group(1).lower()
            if tok in _NUMWORD:
                n = _NUMWORD[tok]
            elif _YEAR.fullmatch(tok):
                continue
            else:
                n = float(tok.replace(",", ""))
            best = max(best, n)
    return best


def rule_floor(text: pd.Series) -> np.ndarray:
    """Minimum intensity implied by stated deaths (v7): 300+ dead or famine deaths -> 5, 4+ dead -> 4.
    Applied as max(prediction, floor); chosen on the validation slice (5s recall 0.21 -> 0.43, same QWK)."""
    t = text.fillna("")
    d = t.map(max_deaths).to_numpy(float)
    famine = t.str.contains(FAMINE_RX).to_numpy()
    return np.select([d >= 300, famine & (d > 0), d >= 4], [5, 5, 4], 0)


def rule_features(text: pd.Series) -> np.ndarray:
    from ml.pipeline.relabel_all import AID_REGEX, KILL_REGEX
    t = text.fillna("")
    deaths = t.map(max_deaths).to_numpy(float)
    death_bin = np.select([deaths >= 300, deaths >= 4, deaths >= 1], [3, 2, 1], 0)  # v7 thresholds
    destroy = t.str.contains(DESTROY_RX).to_numpy(float)
    displace = t.str.contains(DISPLACE_RX).to_numpy(float)
    aid = t.str.contains(AID_REGEX).to_numpy(float)
    pin = pd.to_numeric(t.map(regex_pin), errors="coerce").fillna(0).to_numpy(float)
    return np.column_stack([
        np.log1p(deaths), death_bin,
        t.str.contains(KILL_REGEX).to_numpy(float),
        t.str.contains(PLURAL_KILL_RX).to_numpy(float),
        destroy, displace,
        ((death_bin == 1) & ((destroy + displace) > 0)).astype(float),  # 1-3 dead + destruction/displacement -> 4
        aid, aid * (pin >= 10_000),                                      # food aid lost by 10k+ -> 4
        t.str.contains(FAMINE_RX).to_numpy(float),
    ])


# --------------------------------------------------------------------------- #
# Features
# --------------------------------------------------------------------------- #
def _codes(s: pd.Series, pattern: str) -> list[list[str]]:
    return s.fillna("").str.findall(pattern).tolist()


def _groups(s: pd.Series) -> list[list[str]]:
    return [[g.strip() for g in v.split(";") if g.strip()] if isinstance(v, str) else []
            for v in s]


@dataclass
class Featurizer:
    tfidf: TfidfVectorizer = field(default_factory=lambda: TfidfVectorizer(
        ngram_range=(1, 2), max_features=3000, sublinear_tf=True, min_df=2))
    ind: MultiLabelBinarizer = field(default_factory=MultiLabelBinarizer)
    sub: MultiLabelBinarizer = field(default_factory=MultiLabelBinarizer)
    grp: MultiLabelBinarizer = field(default_factory=MultiLabelBinarizer)
    countries: pd.DataFrame | None = None
    rules: bool = True  # add the v7 rule features (death counts etc.) to the intensity model

    def fit(self, df: pd.DataFrame) -> "Featurizer":
        self.tfidf.fit(df["description"].fillna(""))
        self.ind.fit(_codes(df["indicator"], r"I\d+"))
        self.sub.fit(_codes(df["subindicator"], r"S\d+\.\d+"))
        self.grp.fit(_groups(df["targeting_specific_population_groups"]))
        self.countries = country_table()
        return self

    def _country(self, df: pd.DataFrame) -> pd.DataFrame:
        iso = df["iso3"].fillna("").str.split(";").str[0].str.strip()
        return pd.DataFrame({"iso3": iso}).merge(self.countries, on="iso3", how="left")

    def transform(self, df: pd.DataFrame, target: str) -> sparse.csr_matrix:
        import warnings
        text = df["description"].fillna("")
        tf = self.tfidf.transform(text)
        with warnings.catch_warnings():  # unseen codes at predict time are simply zero
            warnings.simplefilter("ignore")
            ind = self.ind.transform(_codes(df["indicator"], r"I\d+"))
            sub = self.sub.transform(_codes(df["subindicator"], r"S\d+\.\d+"))
            grp = self.grp.transform(_groups(df["targeting_specific_population_groups"]))
        c = self._country(df)
        if target == "intensity":
            dense = c[["inform_vu", "inform_cc"]].to_numpy(float)
            if self.rules:
                dense = np.column_stack([dense, rule_features(text)])
            return sparse.hstack([tf, ind, sub, sparse.csr_matrix(dense)]).tocsr()
        pins = pd.to_numeric(text.map(regex_pin), errors="coerce")
        n_nums = text.map(lambda t: len(people_numbers(t)))
        pop = c["population"].to_numpy(float)
        pin = pins.to_numpy(float)
        dense = np.column_stack([
            np.log1p(np.nan_to_num(pin, nan=0.0)),                  # regex people count (log)
            pins.notna().to_numpy(float),                            # has a people number
            n_nums.to_numpy(float),                                  # how many
            pins.map(lambda v: band(v) if v == v else 0).to_numpy(float),  # rubric band, 0 = none
            np.log1p(np.nan_to_num(pop, nan=0.0)),                   # country population (log)
            np.nan_to_num(pin / pop, nan=0.0).clip(0, 1),            # count / population
            df["country_wide"].astype(float).to_numpy(),
            df["adm1_name"].fillna("").map(lambda v: len([x for x in v.split(";") if x.strip()]))
              .to_numpy(float),                                      # adm1 regions affected
        ])
        return sparse.hstack([sparse.csr_matrix(dense), grp, tf]).tocsr()


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #
def make_model() -> LGBMClassifier:
    return LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=15,
                          min_child_samples=10, subsample=0.8, subsample_freq=1,
                          colsample_bytree=0.8, class_weight="balanced",
                          random_state=SEED, verbose=-1)


def proba5(model: LGBMClassifier, X) -> np.ndarray:
    """Probabilities over scores 1..5 even if a score was absent from training."""
    p = np.zeros((X.shape[0], 5))
    p[:, model.classes_.astype(int) - 1] = model.predict_proba(X)
    return p


def accept(p: np.ndarray) -> np.ndarray:
    """Confidence rule, row-wise on (n, 5) probabilities."""
    order = np.argsort(-p, axis=1)
    top, second = order[:, 0], order[:, 1]
    rows = np.arange(len(p))
    pmax, p2 = p[rows, top], p[rows, second]
    return (pmax >= ACCEPT_MAX) | ((np.abs(top - second) == 1) & (pmax + p2 >= ACCEPT_ADJACENT_SUM))


def metrics(y, pred) -> dict:
    y, pred = np.asarray(y, int), np.asarray(pred, int)
    if len(y) == 0:
        return {"n": 0}
    return {"n": int(len(y)), "accuracy": round(float((y == pred).mean()), 3),
            "within_1": round(float((abs(y - pred) <= 1).mean()), 3),
            "mae": round(float(abs(y - pred).mean()), 3),
            "quadratic_kappa": round(float(cohen_kappa_score(y, pred, weights="quadratic",
                                                             labels=[1, 2, 3, 4, 5])), 3)}


@dataclass
class Student:
    featurizer: Featurizer
    models: dict[str, LGBMClassifier]

    @classmethod
    def fit(cls, df: pd.DataFrame) -> "Student":
        fz = Featurizer().fit(df)
        models = {t: make_model().fit(fz.transform(df, t), df[col].astype(int))
                  for t, col in TARGETS.items()}
        return cls(fz, models)

    def predict(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """(n, 5) probabilities per target."""
        return {t: proba5(m, self.featurizer.transform(df, t)) for t, m in self.models.items()}

    def scores(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """1-5 scores per target: rounded expected value (ev_bal), plus the v7 floor on intensity."""
        out = {}
        for t, p in self.predict(df).items():
            pred = np.clip(np.rint(p @ np.arange(1, 6) / p.sum(1)), 1, 5).astype(int)
            if t == "intensity":
                pred = np.maximum(pred, rule_floor(df["description"]))
            out[t] = pred
        return out

    def save(self, path: Path = MODEL_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path = MODEL_PATH) -> "Student":
        if not path.exists():
            raise SystemExit(f"{path} not found: train it with python -m ml.pipeline.student")
        return joblib.load(path)


def main() -> None:
    from ml.pipeline.student_timesplit import labelled_frame  # all LLM labels, gold excluded
    df = labelled_frame()
    print(f"training on {len(df):,} LLM-labelled events (gold excluded) ...", flush=True)
    Student.fit(df).save()
    print(f"saved {MODEL_PATH.relative_to(ROOT)}; label distribution:",
          {t: df[c].value_counts().sort_index().to_dict() for t, c in TARGETS.items()})


if __name__ == "__main__":
    # run through the importable module so the pickled classes resolve to
    # ml.pipeline.student (not __main__) when the model is loaded elsewhere
    from ml.pipeline import student

    student.main()
