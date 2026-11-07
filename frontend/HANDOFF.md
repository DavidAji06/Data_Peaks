# Frontend handoff (Ground Truth)

Next.js 16.4 + React 19.3 + Tailwind 4.3.4 + TypeScript. Built against David's FastAPI backend, with an offline demo fallback so the pitch never depends on a running API.

## Run it (Mac)

Two terminals.

**1. Backend** (David's API from the `backend` branch, at least commit `d4d949d`; port 8000)
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt   # once; adds pytest and httpx for his tests
python -m app.seed          # resets the demo data; run again before every demo
uvicorn app.main:app --reload
```

**2. Frontend** (must be port 3000: the backend's CORS allows only http://localhost:3000)
```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Create `frontend/.env.local` (gitignored, never commit it):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_DEMO_FALLBACK=true
MODERATOR_KEY=dev-moderator-key
```

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL |
| `NEXT_PUBLIC_USE_MOCK` | Anything but `false` = always use the offline demo backend |
| `NEXT_PUBLIC_DEMO_FALLBACK` | `true` = if the API can't be reached, the whole screen loads from demo data, with a "Demo data (offline)" badge |
| `MODERATOR_KEY` | Sent as `X-Moderator-Key` on moderator requests. **Server-only on purpose** (see below) |

Checks: `npm run lint`, `npm run build`, `npm run check:contrast`.

## Pages

| URL | Who | What |
|---|---|---|
| `/` | Pitch | Demo hub with one link per view |
| `/q/demo-expert-a` | Expert | Context → blind estimate → group view → revise → receipt |
| `/q/demo-expert-b` | Expert | Same question, already answered: opens on the group view |
| `/q/[token]/record` | Expert | Track record (Brier scores) |
| `/q/[token]/settings` | Expert | Privacy settings: anonymity level (with who sees what), country, topics, open questions at a time |
| `/join/[token]` | New expert | Sign-up from a moderator's invite link: the expert chooses their own anonymity level |
| `/mod` | ACAPS | Alert queue (pending/approved/rejected), approve with an editable question, or reject |
| `/mod/questions`, `/mod/questions/[id]` | ACAPS | Participation, first vs latest median, 5-band distribution, labelled answers, resolve |
| `/mod/leaderboard` | ACAPS | Calibration (anonymous experts never ranked) |
| `/mod/panel` | ACAPS | Invite an expert: email + country → one-time sign-up link |
| `/mod/risks`, `/mod/risks/[id]` | ACAPS | Ranked risks with score breakdown; risk detail with triggers and a decision panel |
| `/outcomes/[questionId]` | Public | Group figures only |

## How the code is organised

- `lib/types.ts`: the contract. `Api*` types are the backend JSON exactly (snake_case); UI types are camelCase.
- `lib/adapters.ts`: the only place `Api*` becomes UI data.
- `lib/api.ts` (server only): one loader per screen. Adds the moderator key only on moderator loaders.
- `lib/client-api.ts` (browser): submit, revise, group view, join, settings, approve/reject, resolve, AI summary, panel invite.
- `app/api/mod/[...path]`: forwards the four moderator actions (alert decision, resolve, AI summary, panel invite) with the key added on the server. Not a general proxy.
- `lib/server/mock-backend.ts` + `mock/db.json`: TypeScript copy of the backend over a snapshot of its seed, for the offline fallback. Refresh with `npm run mocks:snapshot` after `python -m app.seed`.
- `mock/curated.json`: real Risk Radar data shown while the API still returns placeholder samples (similar risks, ranking), labelled "Demo data until the ML pipeline lands". Rebuild with `npm run mocks:extract`.
- `lib/anonymity.ts`: small-n rule (no figures below 5 answers, same as the backend).
- Text (English only): `lib/i18n/en.ts` (expert and public), `lib/i18n/mod.ts` (moderator).
- Design tokens: `app/globals.css` (`@theme`). Hana: restyle there.

## Endpoints used

Expert (no key): `GET /q/{token}`, `GET /q/{token}/settings`, `PATCH /q/{token}/settings`, `GET /join/{token}`, `POST /join/{token}`, `POST /q/{token}/responses`, `POST /q/{token}/revision`, `GET /q/{token}/group`, `GET /q/{token}/track-record`.

Moderator (with `X-Moderator-Key`): `GET /alerts?status=`, `POST /alerts/{id}/decision`, `GET /risks/ranked`, `GET /risks/{id}`, `GET /moderator/questions`, `GET /moderator/questions/{id}`, `POST /moderator/questions/{id}/resolve`, `POST /moderator/questions/{id}/summarise`, `GET /moderator/leaderboard`, `POST /moderator/panel-invites`.

Public (no key): `GET /public/questions` (resolved questions only; figures null below 5 answers). `/outcomes` lists them, `/outcomes/[id]` shows one.

Not used yet: `POST /alerts/import`.

## Security notes

- **The moderator key never reaches the browser.** David suggested `NEXT_PUBLIC_MODERATOR_KEY`, but every `NEXT_PUBLIC_*` value is copied into the JavaScript all visitors download, including experts. So it's `MODERATOR_KEY`, read only on the server.
- **There's no moderator sign-in.** Anyone who can open `/mod` (or POST to `/api/mod`) acts as a moderator. Fine for a local demo; a pilot needs real moderator accounts on the Next.js side.
- Expert links are credentials: never shown, logged, or put in a page title, and never sent to moderator pages.
- Group figures need at least 5 answers everywhere (expert group view, public page, moderator charts). The frontend checks the count again even when the backend sends figures.

## Requests for David

Done in `d4d949d` (thanks): small-group protection (now 5 answers), multi-country routing, a public endpoint, stored AI themes with a summarise endpoint, ML file hooks.

Still open:
1. **Anonymity changes are retroactive.** The moderator view labels every answer with the expert's *current* level, so switching from "Fully anonymous" to "Known to ACAPS" reveals who gave earlier answers (and puts past scores on the calibration ranking). The settings page warns about this before saving. Safer: store the level on each response when it's given, and label answers with that.
2. **`GET /alerts/{id}`**: the alert page currently searches all three status lists.
3. **A risk-decision endpoint** (keep / raise / lower / update trigger / add trigger, with a note). The decision panel is page-only for now and labelled "Not saved to server yet".
4. **Seed content**: alerts point at trigger `T0001`, which isn't one of R1043's triggers (`T0618`–`T0620`). The alert page warns about it. Real T0618 content would make the demo read much better.
5. **Reason length**: the backend accepts up to 280 characters. Fine; just keep the expert prompt "one or two lines".
6. **`GET /public/questions/{id}`** (optional): the public detail page currently fetches the whole list and picks one.

## Open questions for the team

- **Pilot timing:** the ACAPS pilot runs about 2 months, but questions have a 6-month deadline, so nothing resolves during the pilot. Proposal: short-horizon trigger questions (e.g. "Will T0618 reach 100% by 31 Dec?") plus the practice questions built from past ACAPS outcomes.
- **Practice scores:** the current track records and calibration table come from practice questions (H001–H008) with real ACAPS outcomes but **simulated** answers. Say so in the pitch.
- **Probability bands:** we use five equal 20% bands like the backend. Confirm which bands ACAPS uses now.
- **AI themes reach experts:** once a moderator generates the summary, the backend also sends those themes to experts in `/q/{token}/group`. The brief says AI should be behind the scenes for moderators only. Options: send themes to experts only after a moderator approves them, or label them as an AI summary on the expert screen. Needs a team decision.
- **ML outputs:** the backend reads `data/processed/ranked_risks.json`, `similar_risks.json` and `alerts.json` (Vlad, Markos). Until they exist the frontend shows curated Risk Radar data labelled as demo. Markos: the backend imports `summarise_reasons(reasons) -> {agreement, disagreement, new_information}` from `ml/pipeline/llm.py`.
- **Resolution criteria:** should 6-month questions resolve against a trigger's "Quantitative objective" text? Only some triggers have one.


## Demo path (about 3 minutes)

1. `python -m app.seed` in `backend/`, then open `/`.
2. **Moderator** `/mod` → alert A002 → edit the draft question, fill "How it resolves" → Approve: "Question Q002 sent to 6 experts" (the backend prints the expert links in its terminal).
3. **Expert** (phone width) `/q/demo-expert-a` → context and similar past risks → slide to a value, one-line reason → submit → group view (median, range, your mark) → revise or keep.
4. **Moderator** `/mod/questions/Q001` → 6 answers, first vs latest median, distribution, labelled answers → "Generate AI summary" (empty until Markos's summariser is connected) → resolve → Brier scores.
5. **Public** `/outcomes` → resolved questions with group figures only (Q001 appears once resolved in step 4).
6. **Expert** `/q/demo-expert-a/record` → track record. `/mod/leaderboard` → calibration.
7. `/mod/risks/R1043` → triggers (completion rates unchanged since June despite the escalation) → record "update T0618 40% → 70%".
