"""Tests for the expert Elo ranking (no data files or API calls needed)."""
import pytest

from ml.ranking.elo import FLOOR, START_RATING, EloLeague, expected, factor_result

TRUTH = {"intensity": 3, "exposure": 3, "impact": 3}


def test_expected_is_symmetric():
    assert expected(1000, 1000) == pytest.approx(0.5)
    assert expected(1400, 1000) + expected(1000, 1400) == pytest.approx(1.0)
    assert expected(1400, 1000) > 0.9


def test_factor_result_right_close_wrong():
    assert factor_result(3, 3) == 1.0
    assert factor_result(4, 3) == 0.5
    assert factor_result(5, 3) == 0.0


def test_right_gains_wrong_loses():
    league = EloLeague()
    rows = league.rate_event({
        "good": {"intensity": 3, "exposure": 3, "impact": 3},
        "bad": {"intensity": 5, "exposure": 1, "impact": 5},
    }, TRUTH)
    by_id = {r["expert_id"]: r for r in rows}
    assert by_id["good"]["delta"] > 0
    assert by_id["bad"]["delta"] < 0
    assert rows[0]["expert_id"] == "good" and rows[0]["place"] == 1


def test_floor_is_zero():
    league = EloLeague()
    league.player("bad").rating = 0.01  # any loss would push it below zero
    rows = league.rate_event({"bad": {"intensity": 1, "exposure": 5, "impact": 1},
                              "good": dict(TRUTH)}, TRUTH)
    assert league.players["bad"].rating == FLOOR
    assert next(r for r in rows if r["expert_id"] == "bad")["rating_after"] == FLOOR
    assert league.players["good"].rating > START_RATING
    # and it never goes negative however long the losing streak
    for _ in range(50):
        league.rate_event({"bad": {"intensity": 1, "exposure": 5, "impact": 1},
                           "good": dict(TRUTH)}, TRUTH)
    assert league.players["bad"].rating >= FLOOR


def test_ties_share_place_and_order_does_not_matter():
    preds = {"a": dict(TRUTH), "b": dict(TRUTH), "c": {"intensity": 4, "exposure": 3, "impact": 3}}
    rows1 = EloLeague().rate_event(preds, TRUTH)
    rows2 = EloLeague().rate_event(dict(reversed(list(preds.items()))), TRUTH)
    assert [r["place"] for r in rows1] == [1, 1, 3]
    assert {r["expert_id"]: r["delta"] for r in rows1} == {r["expert_id"]: r["delta"] for r in rows2}


def test_beating_stronger_peer_pays_more():
    league = EloLeague()
    league.player("strong").rating = 1400
    league.player("weak").rating = 600
    upset = league.rate_event({"weak": dict(TRUTH),
                               "strong": {"intensity": 4, "exposure": 4, "impact": 4}}, TRUTH)
    league2 = EloLeague()
    league2.player("strong").rating = 1400
    league2.player("weak").rating = 600
    normal = league2.rate_event({"strong": dict(TRUTH),
                                 "weak": {"intensity": 4, "exposure": 4, "impact": 4}}, TRUTH)
    gain_upset = next(r["delta"] for r in upset if r["expert_id"] == "weak")
    gain_normal = next(r["delta"] for r in normal if r["expert_id"] == "strong")
    assert gain_upset > gain_normal
