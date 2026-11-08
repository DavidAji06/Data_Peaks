# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Running against the Data Peaks backend

1. Backend (repo root): `venv/Scripts/python.exe -m pip install -r backend/requirements.txt`, then `cd backend && ../venv/Scripts/python.exe -m app.seed` and `../venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`.
2. This app: `npm install` then `npm run dev -- --port 8080` and open http://localhost:8080.
3. Moderator dashboard (`frontend/`, port 3000): `npm install`, then `npm run dev`. Needs `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`, `NEXT_PUBLIC_USE_MOCK=false` and `MODERATOR_KEY=dev-moderator-key` (see `frontend/HANDOFF.md`).

`/api/*` is proxied to http://localhost:8000 (override with `API_PROXY_TARGET`), so no CORS change is needed.
Data layer: `src/lib/api.ts` (HTTP client) and `src/components/datapeaks/useExpert.ts` (state + actions).

### Links and the demo flow

The seed creates **no open question**. Questions are written by the moderator.

- Each synthetic expert has a fixed personal link: `demo-expert-a` … `demo-expert-f`. Open `http://localhost:8080/?token=demo-expert-a` to sign in as one (the token is saved on the device; Profile → Sign out forgets it). Without a saved token the app shows the email sign-in screen, which emails the expert their personal link via `POST /auth/login-link`. A personal link always points at the expert's newest open question.
- Right after the seed, expert A sees **"You're up to date"** and the globe has no halo.
- The moderator opens http://localhost:3000/mod, picks R1049's top alert, writes the question and approves it. The backend invites **every** expert whose country is one of the risk's countries (no panel cap) and prints one `[notify]` line per expert with a per-question link, `http://localhost:8080/?token=<invite token>`. Either that link or the personal link works.
- `cd backend && ../venv/Scripts/python.exe -m app.demo_answers Q001` adds 5 synthetic answers (experts B–F) so expert A can demo the blind-answer lock. It refuses to run if the question does not exist.
- `max_open_questions` ("How often" in Profile) is a notification preference: experts at their limit are still invited, they are just not pinged.

### Profile

- **Nickname**: tap the pencil next to your name. 3–30 characters (letters, numbers, spaces, `-`, `_`), not an email or phone number, unique (case-insensitive). Other experts never see it; ACAPS moderators see it unless you choose Fully anonymous. Past answers keep the nickname you had when you gave them.
- **Track record**: questions answered and resolved, and each outcome. No Brier scores: accuracy scores and the Brier-weighted group estimate are shown to ACAPS moderators only (`docs/brier-weighting.md`).

## Where the data comes from

| Screen | Source | Real or synthetic |
| --- | --- | --- |
| Home globe | `GET /public/contexts`: `data/processed/ranked_risks.json` (Data Peaks ranking) joined with the ACAPS Risk Radar (`data/risk-radar-export.csv`). Halo only where the expert has an open question | Real ACAPS risks; Data Peaks ranking |
| Question | Written by the moderator in `/mod/alerts/[id]`. The draft is built from the ACAPS trigger or risk text only (for R1049: trigger T0634) and edited before approving | Real ACAPS wording, moderator-edited |
| What's changed | The alert the moderator approved, from `data/processed/alerts.json`: ACAPS humanitarian access events scored by the LLM (impact, intensity, exposure). Matched by country, so it reads "Related reporting in Sudan". "Reporting near {place}" appears only when the place-name heuristic matches | Real ACAPS events, LLM scores |
| Relevant past cases | `data/processed/similar_risks.json` from `ml/find_similar_past_events/find_top_three_v2.py`. Tap a case for how it evolved | Real resolved ACAPS risks |
| Group view | Median and range from the backend; "AI summary of expert reasons" from GreenPT (`ml/pipeline/llm.py`), generated once after the 5th answer | Real computation over synthetic answers |
| Experts, their answers and nicknames | Seed data and `app.demo_answers` | Synthetic |
| Practice track record (H001–H008) | Real ACAPS outcomes | Simulated forecasts |

Reset the demo with `cd backend && ../venv/Scripts/python.exe -m app.seed`.
