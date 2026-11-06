# Frontend handoff (Ground Truth)

Next.js 16.4 + React 19.3 + Tailwind 4.3.4 + TypeScript. Built against David's FastAPI backend, with an offline demo fallback so the pitch never depends on a running API.

## Run it (Mac)

Two terminals.

**1. Backend** (David's API, port 8000)
```bash
cd backend
source .venv/bin/activate
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
| `/q/demo-expert-a` | Expert | Context → blind estimate → group view → revise → receipt. EN/FR |
| `/q/demo-expert-b` | Expert | Same question, already answered: opens on the group view |
| `/q/[token]/record` | Expert | Track record (Brier scores) |
| `/mod` | ACAPS | Alert queue (pending/approved/rejected), approve with an editable question, or reject |
| `/mod/questions`, `/mod/questions/[id]` | ACAPS | Participation, first vs latest median, 5-band distribution, labelled answers, resolve |
| `/mod/leaderboard` | ACAPS | Calibration (anonymous experts never ranked) |
| `/mod/risks`, `/mod/risks/[id]` | ACAPS | Ranked risks with score breakdown; risk detail with triggers and a decision panel |
| `/outcomes/[questionId]` | Public | Group figures only. EN/FR |

## How the code is organised

- `lib/types.ts`: the contract. `Api*` types are the backend JSON exactly (snake_case); UI types are camelCase.
- `lib/adapters.ts`: the only place `Api*` becomes UI data.
- `lib/api.ts` (server only): one loader per screen. Adds the moderator key only on moderator loaders.
- `lib/client-api.ts` (browser): submit, revise, group view, approve/reject, resolve.
- `app/api/mod/[...path]`: forwards the two moderator actions (alert decision, resolve) with the key added on the server. Not a general proxy.
- `lib/server/mock-backend.ts` + `mock/db.json`: TypeScript copy of the backend over a snapshot of its seed, for the offline fallback. Refresh with `npm run mocks:snapshot` after `python -m app.seed`.
- `mock/curated.json`: real Risk Radar data shown while the API still returns placeholder samples (similar risks, ranking), labelled "Demo data until the ML pipeline lands". Rebuild with `npm run mocks:extract`.
- `lib/anonymity.ts`: small-n rule (no figures below 3 answers) and the public view builder.
- Text: `lib/i18n/en.ts` + `fr.ts` (expert and public, same keys), `lib/i18n/mod.ts` (moderator, English only).
- Design tokens: `app/globals.css` (`@theme`). Hana: restyle there.

## Endpoints used

Expert (no key): `GET /q/{token}`, `GET /q/{token}/settings`, `POST /q/{token}/responses`, `POST /q/{token}/revision`, `GET /q/{token}/group`, `GET /q/{token}/track-record`.

Moderator (with `X-Moderator-Key`): `GET /alerts?status=`, `POST /alerts/{id}/decision`, `GET /risks/ranked`, `GET /risks/{id}`, `GET /moderator/questions`, `GET /moderator/questions/{id}`, `POST /moderator/questions/{id}/resolve`, `GET /moderator/leaderboard`.

Public page: no public endpoint exists yet, so the Next.js server reads `GET /moderator/questions/{id}` with the key and sends only aggregates to the browser.

Not used yet: `/join/{token}` (sign-up), `PATCH /q/{token}/settings`, `POST /moderator/panel-invites`.

## Security notes

- **The moderator key never reaches the browser.** David suggested `NEXT_PUBLIC_MODERATOR_KEY`, but every `NEXT_PUBLIC_*` value is copied into the JavaScript all visitors download, including experts. So it's `MODERATOR_KEY`, read only on the server.
- **There's no moderator sign-in.** Anyone who can open `/mod` (or POST to `/api/mod`) acts as a moderator. Fine for a local demo; a pilot needs real moderator accounts on the Next.js side.
- Expert links are credentials: never shown, logged, or put in a page title, and never sent to moderator pages.
- The public range is shown in 20% bands, not exact min/max (with 3 answers those are individual answers).

## Requests for David

1. **Apply the two fixes** in [handoff/backend-fixes.patch](handoff/backend-fixes.patch) on the `backend` branch. The patch was made against `6f6d641`, so it may not apply cleanly to `3220fc0`; the changes are small:
   - `GET /q/{token}/group`: with fewer than 3 answers, return `median`, `min`, `max` as `null` (with 2 answers, min and max *are* the two answers).
   - `services/routing.py`: match each country in a comma-separated list, case-insensitively, instead of the whole string.
2. **A public endpoint** (e.g. `GET /public/questions/{id}`) returning aggregates only, so the public page doesn't need the moderator key.
3. **Expert-facing themes** in `/q/{token}/group` and moderator `themes` (agreement / disagreement / new information). Both are always empty now; the UI says "pending" instead of inventing them.
4. **`GET /alerts/{id}`**: the alert page currently searches all three status lists.
5. **A risk-decision endpoint** (keep / raise / lower / update trigger / add trigger, with a note). The decision panel is page-only for now and labelled "Not saved to server yet".
6. **Seed content**: alerts point at trigger `T0001`, which isn't one of R1043's triggers (`T0618`–`T0620`). The alert page warns about it. Real T0618 content would make the demo read much better.
7. **Reason length**: the backend accepts up to 280 characters; the expert form limits it to 160 for one-line answers. Fine either way, just agree on one.
8. Resolving an already resolved question returns 409 (handled). Resolving with no answers returns only `scored: 0` (handled).

## Open questions for the team

- **Pilot timing:** the ACAPS pilot runs about 2 months, but questions have a 6-month deadline, so nothing resolves during the pilot. Proposal: short-horizon trigger questions (e.g. "Will T0618 reach 100% by 31 Dec?") plus the practice questions built from past ACAPS outcomes.
- **Practice scores:** the current track records and calibration table come from practice questions (H001–H008) with real ACAPS outcomes but **simulated** answers. Say so in the pitch.
- **Probability bands:** we use five equal 20% bands like the backend. Confirm which bands ACAPS uses now.
- **Resolution criteria:** should 6-month questions resolve against a trigger's "Quantitative objective" text? Only some triggers have one.

## French review (Hana or a native speaker)

`lib/i18n/fr.ts` is machine-translated and marked "needs review". Please check all of it, especially:
- the expert flow wording (estimate, group view, revise),
- `record` (track record) and the Brier explanation,
- `public` (public summary page) and `whoSees.yourLevel`, added last,
- typography: narrow no-break space before `% ; ? !`, no-break space before `:`.

## Demo path (about 3 minutes)

1. `python -m app.seed` in `backend/`, then open `/`.
2. **Moderator** `/mod` → alert A002 → edit the draft question, fill "How it resolves" → Approve: "Question Q002 sent to 6 experts" (the backend prints the expert links in its terminal).
3. **Expert** (phone width) `/q/demo-expert-a` → context and similar past risks → slide to a value, one-line reason → submit → group view (median, range, your mark) → revise or keep.
4. **Moderator** `/mod/questions/Q001` → 6 answers, first vs latest median, distribution, labelled answers → resolve → Brier scores.
5. **Public** `/outcomes/Q001` → group figures only.
6. **Expert** `/q/demo-expert-a/record` → track record. `/mod/leaderboard` → calibration.
7. `/mod/risks/R1043` → triggers (completion rates unchanged since June despite the escalation) → record "update T0618 40% → 70%".
