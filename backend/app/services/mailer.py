"""
Sends panel invitation emails over SMTP (standard library only).

Configure in backend/.env (or real environment variables):
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=you@gmail.com
    SMTP_PASSWORD=<app password>
    SMTP_FROM=ACAPS expert panel <you@gmail.com>   (optional, defaults to SMTP_USER)

With no SMTP_HOST, nothing is sent: the link is printed and the moderator copies it from the dashboard.
"""

import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _load_env_file():
    """Minimal .env reader so no extra dependency is needed. Real environment variables win."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def invite_message(to: str, join_link: str, country: str) -> EmailMessage:
    sender = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "no-reply@localhost"
    msg = EmailMessage()
    msg["Subject"] = "You're invited to the ACAPS expert panel"
    msg["From"] = sender
    msg["To"] = to
    msg.set_content(
        f"Hello,\n\n"
        f"ACAPS invites you to join its expert panel for {country}.\n\n"
        f"Every few weeks you'll get a short question about how a humanitarian risk may evolve "
        f"(about 2 minutes each). You choose how visible you are: known to ACAPS, a nickname, "
        f"or fully anonymous. Your individual answers are never public.\n\n"
        f"Activate your place (takes under a minute):\n{join_link}\n\n"
        f"This link works once and is personal to you. Please don't forward it.\n\n"
        f"ACAPS"
    )
    msg.add_alternative(
        f"""<p>Hello,</p>
<p>ACAPS invites you to join its expert panel for <b>{country}</b>.</p>
<p>Every few weeks you'll get a short question about how a humanitarian risk may evolve
(about 2 minutes each). You choose how visible you are: known to ACAPS, a nickname, or fully anonymous.
Your individual answers are never public.</p>
<p><a href="{join_link}" style="display:inline-block;padding:12px 20px;background:#0b2e4f;color:#fff;
text-decoration:none;border-radius:6px;font-weight:bold">Activate my place</a></p>
<p style="color:#666;font-size:13px">Or open this link: {join_link}<br>
It works once and is personal to you. Please don't forward it.</p>
<p>ACAPS</p>""",
        subtype="html",
    )
    return msg


def welcome_message(to: str, app_link: str, pseudonym: str, anonymous: bool) -> EmailMessage:
    sender = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "no-reply@localhost"
    msg = EmailMessage()
    msg["Subject"] = "Your personal link to the ACAPS expert panel"
    msg["From"] = sender
    msg["To"] = to
    who = "You answer anonymously." if anonymous else f"Your nickname is {pseudonym}. You can change it in your profile."
    msg.set_content(
        f"Welcome to the ACAPS expert panel.\n\n{who}\n\n"
        f"Keep this email: this is your personal link to the app, where your questions will appear.\n{app_link}\n\n"
        f"It signs you in, so please don't forward it.\n\nACAPS"
    )
    msg.add_alternative(
        f"""<p>Welcome to the ACAPS expert panel.</p>
<p>{who}</p>
<p>Keep this email: this is your personal link to the app, where your questions will appear.</p>
<p><a href="{app_link}" style="display:inline-block;padding:12px 20px;background:#0b2e4f;color:#fff;
text-decoration:none;border-radius:6px;font-weight:bold">Open my expert app</a></p>
<p style="color:#666;font-size:13px">It signs you in, so please don't forward it.</p>
<p>ACAPS</p>""",
        subtype="html",
    )
    return msg


def _send(message: EmailMessage) -> tuple[bool, str | None]:
    """Returns (sent, error). Never raises: a failed email must not lose the invite or the account."""
    to = message["To"]
    if not is_configured():
        print(f"[notify] SMTP not configured, not emailed to {to}: {message['Subject']}")
        return False, "Email is not configured on the server"
    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    try:
        context = ssl.create_default_context()
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls(context=context)
        with server:
            if user and password:
                server.login(user, password)
            server.send_message(message)
        print(f"[notify] Emailed {to}: {message['Subject']}")
        return True, None
    except Exception as e:  # SMTP, DNS or auth failure: keep going, report it
        print(f"[notify] Email to {to} failed: {e!r}")
        return False, "The email could not be sent"


def send_invite(to: str, join_link: str, country: str) -> tuple[bool, str | None]:
    sent = _send(invite_message(to, join_link, country))
    if not sent[0]:
        print(f"[notify] Invitation link for {to}: {join_link}")
    return sent


def send_welcome(to: str, app_link: str, pseudonym: str, anonymous: bool) -> tuple[bool, str | None]:
    return _send(welcome_message(to, app_link, pseudonym, anonymous))
