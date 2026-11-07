"""
Region match: a HEURISTIC that says whether an access event mentions the same area as a risk.

Alerts are matched to risks by country only. This module adds a second, finer signal: it looks
for known place names in the event description and in the risk title plus trigger text, maps
each place to its first-level region (state / province), and reports a match when both texts
name a place in the same region. For example "El Obeid" and "Bara" are both in North Kordofan.

It is a keyword list, not geocoding. It can miss places that are not listed and can be fooled
by an event that merely mentions a place. The UI must label it as a heuristic and must never
say a trigger fired because of it.
"""
import re
import unicodedata

# canonical place -> (admin1 region, aliases). Regions are also places in their own right.
GAZETTEER: dict[str, tuple[str, list[str]]] = {
    # Sudan
    "Al Obeid": ("North Kordofan", ["al obeid", "el obeid", "el-obeid", "al-ubayyid", "el obied", "obeid"]),
    "Bara": ("North Kordofan", ["bara"]),
    "Um Rawaba": ("North Kordofan", ["um rawaba", "umm ruwaba"]),
    "North Kordofan": ("North Kordofan", ["north kordofan", "shamal kordofan"]),
    "Kadugli": ("South Kordofan", ["kadugli"]),
    "Dilling": ("South Kordofan", ["dilling", "dilinj"]),
    "South Kordofan": ("South Kordofan", ["south kordofan", "nuba mountains"]),
    "Babanusa": ("West Kordofan", ["babanusa"]),
    "El Fula": ("West Kordofan", ["el fula", "al fulah"]),
    "West Kordofan": ("West Kordofan", ["west kordofan"]),
    "El Fasher": ("North Darfur", ["el fasher", "al fasher", "al-fashir", "el-fasher"]),
    "Tawila": ("North Darfur", ["tawila"]),
    "North Darfur": ("North Darfur", ["north darfur"]),
    "El Geneina": ("West Darfur", ["el geneina", "al geneina", "geneina"]),
    "West Darfur": ("West Darfur", ["west darfur"]),
    "Nyala": ("South Darfur", ["nyala"]),
    "South Darfur": ("South Darfur", ["south darfur"]),
    "Zalingei": ("Central Darfur", ["zalingei"]),
    "Ed Daein": ("East Darfur", ["ed daein", "ad du'ayn"]),
    "Khartoum": ("Khartoum", ["khartoum", "omdurman", "bahri"]),
    "Wad Madani": ("Al Jazirah", ["wad madani", "al jazirah", "gezira", "al gezira"]),
    "Kosti": ("White Nile", ["kosti", "rabak", "white nile"]),
    "Sennar": ("Sennar", ["sennar", "sinja", "singa"]),
    "Ed Damazin": ("Blue Nile", ["ed damazin", "blue nile"]),
    "Kassala": ("Kassala", ["kassala"]),
    "Gedaref": ("Gedaref", ["gedaref", "al qadarif"]),
    "Port Sudan": ("Red Sea", ["port sudan", "red sea state"]),
    # Chad (eastern border)
    "Adré": ("Ouaddaï", ["adre", "adré"]),
    "Abéché": ("Ouaddaï", ["abeche", "abéché"]),
    "Ouaddaï": ("Ouaddaï", ["ouaddai", "ouaddaï"]),
    "Tiné": ("Wadi Fira", ["tine", "tiné"]),
    "Wadi Fira": ("Wadi Fira", ["wadi fira"]),
    "Sila": ("Sila", ["goz beida", "sila province"]),
    "Lac": ("Lac", ["lake chad", "lac province"]),
}


def _fold(text: str) -> str:
    """Lower case, accents removed, punctuation turned into spaces."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " " + re.sub(r"[^a-z0-9']+", " ", text.lower()) + " "


_ALIASES = sorted(
    ((_fold(alias).strip(), place) for place, (_, aliases) in GAZETTEER.items() for alias in aliases),
    key=lambda pair: -len(pair[0]),  # Longest first, so "north kordofan" wins over "kordofan"
)


def places_in(text: str | None) -> list[str]:
    """Canonical place names found in the text, in order of first appearance."""
    if not text:
        return []
    folded = _fold(text)
    found: dict[str, int] = {}
    for alias, place in _ALIASES:
        pos = folded.find(f" {alias} ")
        if pos >= 0 and (place not in found or pos < found[place]):
            found[place] = pos
    return sorted(found, key=found.get)


def region_of(place: str) -> str:
    return GAZETTEER[place][0]


def region_match(event_text: str | None, risk_text: str | None) -> tuple[bool, str | None]:
    """(True, "Bara (North Kordofan)") when the event names a place in a region the risk names."""
    risk_regions = {region_of(place) for place in places_in(risk_text)}
    for place in places_in(event_text):
        region = region_of(place)
        if region in risk_regions:
            return True, place if place == region else f"{place} ({region})"
    return False, None


def trigger_text(triggers: str | None) -> str:
    """Trigger titles and descriptions only, without the Sources lists (their URLs name other places)."""
    if not isinstance(triggers, str):
        return ""
    kept = []
    for block in triggers.split("Trigger ID:"):
        if "Title:" in block:
            kept.append(block.split("Sources:", 1)[0])
    return " ".join(kept)
