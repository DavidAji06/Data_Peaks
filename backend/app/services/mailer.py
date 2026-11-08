"""
Sends panel emails (invitation, welcome, sign-in link). Standard library only.

Two transports, picked by EMAIL_PROVIDER (default: "brevo" when BREVO_API_KEY is set, else "smtp"):

- smtp:  SMTP_HOST, SMTP_PORT (587 STARTTLS or 465 SSL), SMTP_USER, SMTP_PASSWORD
- brevo: BREVO_API_KEY (an API v3 key "xkeysib-...", not the SMTP key), sent over HTTPS.
         Use it where outbound SMTP ports are blocked, e.g. Render's free plan.

EMAIL_FROM (or SMTP_FROM) is the sender address, e.g. "you@gmail.com". For Brevo it must be a sender
verified in Brevo (Senders, Domains & Dedicated IPs). The display name is always SENDER_NAME, whatever
name EMAIL_FROM carries, so emails never go out under another organisation's name.

With neither configured, nothing is sent: the link is printed and the moderator copies it from the dashboard.
"""

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
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


def provider() -> str | None:
    """'brevo', 'smtp', or None when email is off."""
    name = (os.getenv("EMAIL_PROVIDER") or "").strip().lower()
    if not name:
        name = "brevo" if os.getenv("BREVO_API_KEY") else "smtp"
    if name == "brevo":
        return "brevo" if os.getenv("BREVO_API_KEY") else None
    if name == "smtp":
        return "smtp" if os.getenv("SMTP_HOST") else None
    return None


def is_configured() -> bool:
    return provider() is not None


SENDER_NAME = "Data Peaks Expert Panel"
SIGN_OFF = "The Data Peaks team"


def sender() -> str:
    configured = os.getenv("EMAIL_FROM") or os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "no-reply@localhost"
    _, address = parseaddr(configured)
    return formataddr((SENDER_NAME, address or configured))


def invite_message(to: str, join_link: str, country: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "You're invited to the Data Peaks expert panel"
    msg["From"] = sender()
    msg["To"] = to
    msg.set_content(
        f"Hello,\n\n"
        f"You are invited to join the Data Peaks expert panel for {country}.\n\n"
        f"Every few weeks you'll get a short question about how a humanitarian risk may evolve "
        f"(about 2 minutes each). You choose how visible you are: known to the panel team, a nickname, "
        f"or fully anonymous. Your individual answers are never public.\n\n"
        f"Activate your place (takes under a minute):\n{join_link}\n\n"
        f"This link works once and is personal to you. Please don't forward it.\n\n"
        f"{SIGN_OFF}"
    )
    msg.add_alternative(
        f"""<p>Hello,</p>
<p>You are invited to join the Data Peaks expert panel for <b>{country}</b>.</p>
<p>Every few weeks you'll get a short question about how a humanitarian risk may evolve
(about 2 minutes each). You choose how visible you are: known to the panel team, a nickname, or fully anonymous.
Your individual answers are never public.</p>
<p><a href="{join_link}" style="display:inline-block;padding:12px 20px;background:#0b2e4f;color:#fff;
text-decoration:none;border-radius:6px;font-weight:bold">Activate my place</a></p>
<p style="color:#666;font-size:13px">Or open this link: {join_link}<br>
It works once and is personal to you. Please don't forward it.</p>
<p>{SIGN_OFF}</p>""",
        subtype="html",
    )
    return msg


def welcome_message(to: str, app_link: str, pseudonym: str, anonymous: bool) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Your personal link to the Data Peaks expert panel"
    msg["From"] = sender()
    msg["To"] = to
    who = "You answer anonymously." if anonymous else f"Your nickname is {pseudonym}. You can change it in your profile."
    msg.set_content(
        f"Welcome to the Data Peaks expert panel.\n\n{who}\n\n"
        f"Keep this email: this is your personal link to the app, where your questions will appear.\n{app_link}\n\n"
        f"It signs you in, so please don't forward it.\n\n{SIGN_OFF}"
    )
    msg.add_alternative(
        f"""<p>Welcome to the Data Peaks expert panel.</p>
<p>{who}</p>
<p>Keep this email: this is your personal link to the app, where your questions will appear.</p>
<p><a href="{app_link}" style="display:inline-block;padding:12px 20px;background:#0b2e4f;color:#fff;
text-decoration:none;border-radius:6px;font-weight:bold">Open my expert app</a></p>
<p style="color:#666;font-size:13px">It signs you in, so please don't forward it.</p>
<p>{SIGN_OFF}</p>""",
        subtype="html",
    )
    return msg


def login_message(to: str, app_link: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Your sign-in link to the Data Peaks expert panel"
    msg["From"] = sender()
    msg["To"] = to
    msg.set_content(
        "Hello,\n\nSomeone (hopefully you) asked to sign in to the Data Peaks expert panel app.\n\n"
        f"Sign in:\n{app_link}\n\n"
        "This link signs you in, so please don't forward it. If you didn't ask for it, ignore this email.\n\n"
        f"{SIGN_OFF}"
    )
    msg.add_alternative(
        f"""<p>Hello,</p>
<p>Someone (hopefully you) asked to sign in to the Data Peaks expert panel app.</p>
<p><a href="{app_link}" style="display:inline-block;padding:12px 20px;background:#0b2e4f;color:#fff;
text-decoration:none;border-radius:6px;font-weight:bold">Sign in</a></p>
<p style="color:#666;font-size:13px">This link signs you in, so please don't forward it.
If you didn't ask for it, ignore this email.</p>
<p>{SIGN_OFF}</p>""",
        subtype="html",
    )
    return msg


def _parts(message: EmailMessage) -> tuple[str, str | None]:
    text = message.get_body(("plain",))
    html = message.get_body(("html",))
    return (text.get_content() if text else ""), (html.get_content() if html else None)


def brevo_payload(message: EmailMessage) -> dict:
    text, html = _parts(message)
    name, address = parseaddr(message["From"])
    sender_field = {"email": address, "name": name} if name else {"email": address}
    payload = {"sender": sender_field, "to": [{"email": message["To"]}], "subject": message["Subject"], "textContent": text}
    if html:
        payload["htmlContent"] = html
    return payload


def _send_brevo(message: EmailMessage) -> None:
    request = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(brevo_payload(message)).encode(),
        headers={
            "api-key": os.environ["BREVO_API_KEY"],
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "data-peaks-api",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
    except urllib.error.HTTPError as e:  # Brevo explains what is wrong (unverified sender, bad key...)
        raise RuntimeError(f"Brevo {e.code}: {e.read().decode(errors='replace')[:300]}") from None


def _send_smtp(message: EmailMessage) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
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


def _send(message: EmailMessage) -> tuple[bool, str | None]:
    """Returns (sent, error). Never raises: a failed email must not lose the invite or the account."""
    to = message["To"]
    transport = provider()
    if transport is None:
        print(f"[notify] Email not configured, not emailed to {to}: {message['Subject']}")
        return False, "Email is not configured on the server"
    try:
        if transport == "brevo":
            _send_brevo(message)
        else:
            _send_smtp(message)
        print(f"[notify] Emailed {to}: {message['Subject']}")
        return True, None
    except Exception as e:  # SMTP/HTTP, DNS or auth failure: keep going, report it
        print(f"[notify] Email to {to} failed: {e!r}")
        return False, "The email could not be sent"


def send_invite(to: str, join_link: str, country: str) -> tuple[bool, str | None]:
    sent = _send(invite_message(to, join_link, country))
    if not sent[0]:
        print(f"[notify] Invitation link for {to}: {join_link}")
    return sent


def send_welcome(to: str, app_link: str, pseudonym: str, anonymous: bool) -> tuple[bool, str | None]:
    return _send(welcome_message(to, app_link, pseudonym, anonymous))


def send_login_link(to: str, app_link: str) -> tuple[bool, str | None]:
    return _send(login_message(to, app_link))
