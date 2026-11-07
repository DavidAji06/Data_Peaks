"""
Simply sets anonymity based on the level they are
"""


from ..models import Expert

# From least to most private
PRIVACY_ORDER = ["known_to_acaps", "pseudonymous", "anonymous"]


def stricter(*levels: str | None) -> str:
    """Return the most private of the given levels."""
    known = [level for level in levels if level in PRIVACY_ORDER]
    return max(known, key=PRIVACY_ORDER.index) if known else "anonymous"


def moderator_label(
    expert: Expert, anonymous_number: int, level: str | None = None, pseudonym: str | None = None
) -> dict:
    level = level or expert.anonymity_level
    pseudonym = pseudonym or expert.pseudonym

    if level == "known_to_acaps":
        # A real system would show the expert's real name here
        return {
            "label": pseudonym,
            "anonymity_level": "known_to_acaps",
            "identity_known": True,
        }
    if level == "pseudonymous":
        return {
            "label": pseudonym,
            "anonymity_level": "pseudonymous",
            "identity_known": False,
        }
    return {
        "label": f"Anonymous expert {anonymous_number}",
        "anonymity_level": "anonymous",
        "identity_known": False,
    }