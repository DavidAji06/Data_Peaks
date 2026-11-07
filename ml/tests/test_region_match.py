"""Tests for the region-match heuristic used in alerts.json (no data files needed)."""
from ml.pipeline.region_match import places_in, region_match, trigger_text

R1049_TITLE = "RSF restoration of siege on Al Obeid, North Kordofan drives widescale displacement towards White Nile state"
R1049_TRIGGERS = """Trigger ID: R1049 - T0634
Title: RSF encirclement of Al Obeid
Description:
Further RSF deployment west/south of Al Obeid, road interdiction, or attacks on access routes would indicate renewed siege formation.
Sources:
([Darfur24](https://www.darfur24.com/en/2025/11/13/el-fasher-and-kadugli/))"""


def test_places_found_with_aliases_and_accents():
    assert places_in("Shelling near El-Obeid and in Bara town") == ["Al Obeid", "Bara"]
    assert places_in("Refugees arrive in Adré, Ouaddai") == ["Adré", "Ouaddaï"]
    assert places_in("North Kordofan") == ["North Kordofan"]
    assert places_in(None) == []


def test_place_names_need_whole_words():
    assert places_in("Barack said") == []
    assert places_in("embargo") == []


def test_same_region_matches():
    risk = f"{R1049_TITLE} {trigger_text(R1049_TRIGGERS)}"
    assert region_match("RSF attacked trucks on the road out of Bara", risk) == (True, "Bara (North Kordofan)")
    assert region_match("Drone strike in El Obeid market", risk) == (True, "Al Obeid (North Kordofan)")


def test_other_regions_in_the_same_country_do_not_match():
    risk = f"{R1049_TITLE} {trigger_text(R1049_TRIGGERS)}"
    assert region_match("Famine was classified in besieged Kadugli", risk) == (False, None)
    assert region_match("The RSF besieged El Fasher, the capital of North Darfur", risk) == (False, None)
    assert region_match("Countrywide famine risk", risk) == (False, None)


def test_trigger_sources_are_ignored():
    # The source URL mentions El Fasher and Kadugli; they must not count as risk places
    assert "fasher" not in trigger_text(R1049_TRIGGERS).lower()
    assert trigger_text(None) == ""
