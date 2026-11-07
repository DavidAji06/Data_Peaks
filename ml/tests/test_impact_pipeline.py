"""Offline tests for the silver-label -> student -> matrix pipeline (no API calls)."""
import json

import numpy as np
import pandas as pd
import pytest

from ml.pipeline.impact import band, impact_from_matrix
from ml.pipeline.silver_labels import allocate, label_batch, parse_reply, validate
from ml.pipeline.student import accept, people_numbers, regex_pin


# ----------------------------------------------------------------- matrix
def test_matrix_cells_from_brief():
    assert impact_from_matrix(1, 1) == (1, "Very Low")
    assert impact_from_matrix(5, 5) == (5, "Major")
    assert impact_from_matrix(3, 4) == (3, "Moderate")
    assert impact_from_matrix(4, 4) == (4, "Significant")
    assert impact_from_matrix(2, 5) == (4, "Significant")


def test_band_edges():
    assert [band(v) for v in (9_999, 10_000, 49_999, 50_000, 250_000)] == [1, 2, 2, 3, 5]


# ----------------------------------------------------------------- sampling
def test_allocate_floor_then_proportional():
    sizes = pd.Series({"a": 1000, "b": 100, "c": 5})
    alloc = allocate(sizes, 100, floor=10)
    assert alloc.sum() == 100
    assert alloc["c"] == 5                 # small stratum: take all it has
    assert alloc["a"] > alloc["b"] >= 10   # rest proportional


def test_allocate_floor_exceeding_n_shrinks():
    sizes = pd.Series({k: 50 for k in "abcdefghij"})
    assert allocate(sizes, 55, floor=10).sum() <= 55


# ----------------------------------------------------------------- LLM reply
GOOD = {"event_id": "1", "explicit_pin_extracted": "12,000", "scope_type": "adm1_regional",
        "brief_reasoning": "x", "exposure_score": "2", "intensity_score": 4}


def test_parse_reply_tolerates_fences_and_wrappers():
    arr = [GOOD]
    assert parse_reply(json.dumps(arr)) == arr
    assert parse_reply("```json\n" + json.dumps(arr) + "\n```") == arr
    assert parse_reply("Here you go: " + json.dumps(arr) + " done") == arr
    assert parse_reply(json.dumps({"labels": arr})) == arr
    with pytest.raises(ValueError):
        parse_reply("no json here")


def test_validate_coerces_and_rejects():
    v = validate(GOOD, {"1"})
    assert (v["explicit_pin_extracted"], v["exposure_score"], v["intensity_score"]) == (12000, 2, 4)
    for bad in ({"event_id": "9"}, {"exposure_score": 6}, {"intensity_score": 0},
                {"scope_type": "global"}, {"intensity_score": 2.5}):
        with pytest.raises((ValueError, TypeError)):
            validate({**GOOD, **bad}, {"1"})


class FakeClient:
    """Answers only the first event of each batch, to exercise the split-retry logic."""
    model = "fake"

    def chat(self, messages):
        ids = [r["event_id"] for r in json.loads(messages[0]["content"].split("LABEL:\n", 1)[1])]
        return json.dumps([{**GOOD, "event_id": ids[0]}])


def test_label_batch_retries_missing_events():
    df = pd.DataFrame({"event_id": ["1", "2", "3", "4"], "country": "X", "country_wide": False,
                       "adm1_name": None, "indicator": "I7", "subindicator": "S7.1",
                       "targeting_specific_population_groups": None, "description": "d"})
    labels, missing = label_batch(FakeClient(), df)
    assert {lab["event_id"] for lab in labels} | set(missing) == {"1", "2", "3", "4"}
    assert len(labels) >= 3  # first answer + split retries recover most


# ----------------------------------------------------------------- student helpers
def test_people_numbers():
    assert regex_pin("Some 35,000 refugees and 2,000 households were displaced") == 35_000
    assert people_numbers("1,200 families fled") == [6_000]
    assert regex_pin("1.5 million people in need") == 1_500_000
    assert regex_pin("In 2023 people moved") is None


def test_confidence_rule():
    p = np.array([
        [0.02, 0.05, 0.15, 0.73, 0.05],   # confident
        [0.0, 0.0, 0.45, 0.42, 0.13],     # adjacent 3+4 = 0.87
        [0.20, 0.25, 0.20, 0.20, 0.15],   # flat
        [0.45, 0.0, 0.42, 0.0, 0.13],     # top two not adjacent
    ])
    assert accept(p).tolist() == [True, True, False, False]
