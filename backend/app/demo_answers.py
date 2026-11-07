"""
Demo helper: adds 5 synthetic answers (experts B-F) to a question the moderator created.

    cd backend && ../venv/Scripts/python.exe -m app.demo_answers Q001

Expert A is left unanswered, so the demo can show the blind-answer lock and then the group
view (5 answers already in, A's makes 6). The reasons are synthetic, written for the R1049
(Al Obeid, Sudan) demo; they are not real expert views. Refuses to run if the question does
not exist or is not open. Answers that already exist are skipped.
"""
import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import Expert, Invite, Question, Response

# Synthetic reasons: plausible, but not real expert views
DEMO_ANSWERS = [
    ("expert-b", 0.70, "RSF units have held positions on the roads west of Al Obeid before; a new push from Bara or the west seems likely before the rains."),
    ("expert-c", 0.55, "SAF retook Bara in March, which widens the buffer north of Al Obeid. A full encirclement is harder now, but road attacks are still plausible."),
    ("expert-d", 0.80, "Drone strikes and attacks on the El Obeid-Kosti road suggest the RSF is testing supply routes again. Interdiction of one route would count."),
    ("expert-e", 0.45, "Fighting has shifted to South Kordofan and Darfur. The RSF may lack the forces to besiege Al Obeid again within six months."),
    ("expert-f", 0.65, "Traders report fuel and market shortages in Al Obeid, an early sign that access routes are being squeezed."),
]


class DemoError(Exception):
    pass


def add_demo_answers(db, question_id: str) -> int:
    question = db.get(Question, question_id)
    if question is None:
        raise DemoError(f"Question {question_id} does not exist. Create it first: approve an alert at http://localhost:3000/mod")
    if question.status != "open":
        raise DemoError(f"Question {question_id} is {question.status}, not open")

    added = 0
    for expert_id, probability, reason in DEMO_ANSWERS:
        expert = db.get(Expert, expert_id)
        if expert is None:
            raise DemoError(f"{expert_id} is missing. Reseed with python -m app.seed")
        invite = db.scalar(select(Invite).where(Invite.question_id == question_id, Invite.expert_id == expert_id))
        if invite is None:
            raise DemoError(f"{expert_id} was not invited to {question_id} (is the question about Sudan?)")
        exists = db.scalar(select(Response).where(
            Response.question_id == question_id, Response.expert_id == expert_id, Response.round == 1,
        ))
        if exists:
            continue
        db.add(Response(
            question_id=question_id,
            expert_id=expert_id,
            probability=probability,
            reason=reason,
            round=1,
            anonymity_level=expert.anonymity_level,
            pseudonym=expert.pseudonym,
        ))
        added += 1
    db.commit()
    return added


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("Usage: python -m app.demo_answers Q001")
        return 2
    db = SessionLocal()
    try:
        added = add_demo_answers(db, argv[0])
    except DemoError as error:
        print(f"Refused: {error}")
        return 1
    finally:
        db.close()
    print(f"Added {added} synthetic answers to {argv[0]}. Open http://localhost:8080/?token=demo-expert-a")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
