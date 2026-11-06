"""
Simply sets anonymity based on the level they are
"""


from ..models import Expert


def moderator_label(expert: Expert, anonymous_number: int) -> dict:
    if expert.anonymity_level == "known_to_acaps":
        # A real system would show the expert's real name here
        return {
            "label": expert.pseudonym,
            "anonymity_level": "known_to_acaps",
            "identity_known": True,
        }
    if expert.anonymity_level == "pseudonymous":
        return {
            "label": expert.pseudonym,
            "anonymity_level": "pseudonymous",
            "identity_known": False,
        }
    return {
        "label": f"Anonymous expert {anonymous_number}",
        "anonymity_level": "anonymous",
        "identity_known": False,
    }