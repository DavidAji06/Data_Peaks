# Moderator dashboard: spec (Phase 1)

Status: draft for review. No code has changed yet.
Scope: the ACAPS moderator dashboard in this Next.js frontend (`/mod`). The expert app is out of scope.
Design inspiration: `data_peaks_demo (1).html` (prototype, moderator tab M1–M6, modal behaviour).
Data source: the FastAPI backend contract in `lib/types.ts` (`Api*` types) and `lib/server/mock-backend.ts` (offline demo).

## 1. Principles

- Moderators stay in control. Every action is an explicit button, and nothing changes the ACAPS risk without a recorded decision.
- Anonymity rules come from the backend. The dashboard shows the pseudonym or "Anonymous expert N" exactly as the API sends it. It never derives names.
- Small-n suppression: no figures, distributions or themes for fewer than 5 answers (`canShowAggregate`).
- Demo data is labelled once, per screen, with the existing `DemoBadge`. No "illustrative", "fictional" or "synthetic" wording in the UI.
- English only (see decision D1).

## 2. Route map

The prompt's `/moderator/...` paths become the existing `/mod/...` paths, so deep links and the backend-facing code keep working.

| Prompt | Route (existing) | Purpose |
|---|---|---|
| M1 Alerts to review | `/mod` (`app/mod/page.tsx`) | Pending alerts, with tabs for pending, approved and rejected |
| M1 detail | `/mod/alerts/[id]` | One alert, the matched trigger, the draft question, the decision |
| M2 Risks needing attention | `/mod/risks` | Ranked risks with priority breakdown and filters |
| M2 detail | `/mod/risks/[id]` | One risk: its questions, triggers, rationale, decision |
| M3 Questions list | `/mod/questions` | All questions, with status filters |
| M4 Question detail | `/mod/questions/[id]` | Distribution, before and after, responses, AI summary, actions |
| M5 Leaderboard | `/mod/leaderboard` | Calibration ranking (anonymous experts excluded) |
| M6 Public results | `/outcomes/[questionId]` (public) | Preview link from M4. Not a moderator route |
| (extra) Panel invites | `/mod/panel` | Invite an expert and copy the one-time join link |

Each route keeps its `metadata` title. Moderator pages set `robots: noindex` (new).

## 3. Global shell (all moderator screens)

- Header: "Ground Truth · ACAPS moderator", then the section navigation.
- Navigation: Alerts, Risks, Questions, Leaderboard, Panel. Under 800px it becomes a horizontal scroll row. (Decision D2: keep top tabs, not a sidebar.)
- Page header: eyebrow (for example "ACAPS · Moderator · Alerts"), title, back link where relevant, status chip on the right (risk and country on detail pages), `DemoBadge` when the data is demo.
- Loading: `ModSkeleton`. Errors: `app/mod/error.tsx` with retry. Not found: `app/mod/not-found.tsx`.
- Desktop: content up to 1200px wide. Phone and tablet: one column, tables scroll inside their own container.

## 4. Screens

### M1 Alerts to review (`/mod`)

- **Data:** `GET /alerts?status=…`. Fields used: `id`, `risk_id`, `trigger_id`, `report.title`, `report.source`, `report.published_at`, `strength`, `direction`, `evidence`.
- **Card:** title, source and date, matched risk ID and country, trigger ID, strength as text ("Strong signal (0.82)") and a bar, direction tag.
- **Actions (new):** "Review" stays (opens detail). Add **Create question** (opens the create dialog, see §5.1) and **Reject** (ghost, status `rejected`). Both are pending-tab only.
- **Decision feedback:** a banner under the list after an action ("Question sent to 6 experts", "Alert rejected"). Real result shown from the response.
- **Empty state:** the existing `mod.alerts.empty[status]` text per tab.
- **Gap today:** only "Review" exists. Reject and create are only on the detail page.

### M1 detail (`/mod/alerts/[id]`)

- **Data:** alert, risk (`GET /risks/{id}` returns the raw row), trigger text.
- **Shows:** report title, source link, evidence, status, risk link with rating chip, trigger card (completion bar, description, objective).
- **Form (existing, kept):** question text, resolution criteria, deadline. Approve or reject.
- **Validation:** question text and resolution criteria required; deadline must be a future date (min = tomorrow). Reject needs no fields.
- **Routing line:** "Goes to every panel expert covering {country}". Upgrade to counts when the API gives them (see gaps).
- **Gap today:** no reason field on reject (not required by the API).

### M2 Risks needing attention (`/mod/risks`)

- **Data:** `GET /risks/ranked` (one contract sample until the ML ranking lands; `areDemo` shows the placeholder notice).
- **Table:** risk (ID, title), country, ACAPS rating chip, priority score, the four breakdown values as inline bars (signal strength, uncertainty, impact, time since review).
- **Filters:** country and rating, as chips above the table (today: two selects; keep them, restyle).
- **Row click:** opens the risk detail. Keyboard: each row contains a real link.
- **Section below the table:** "Why this risk ranks highly", four labelled bars (0–100) for the top-ranked risk. Values come from the data, not hard-coded.
- **Gap today:** rows are links, but the breakdown is only shown per row as tiny bars. The "why it ranks" panel is new.

### M2 detail (`/mod/risks/[id]`)

- **Data:** `GET /risks/{id}`, `GET /moderator/questions` filtered to this risk, and the decision list (see §6, gap G1).
- **Shows:** rating chips (ACAPS probability, impact, exposure, status), linked questions with answered and invited counts, triggers (TriggerCard per trigger), collapsible rationale.
- **Decision panel:** keep, raise, lower, update trigger, add trigger. A required note. Trigger picker for the two trigger kinds, and a "new completion %" field.
- **Gaps today:**
  - The panel posts to `POST /risks/{id}/decide`, which **does not exist** in the backend (see G1). In API mode the submit fails.
  - The new completion value is typed but never sent.
  - The audit list is always empty because the page never passes the decisions to the panel.

### M3 Questions list (`/mod/questions`)

- **Data:** `GET /moderator/questions`.
- **Table:** question text, status (open, closed, resolved), outcome, deadline, answered of invited, group middle (only when `canShowAggregate`).
- **Filters:** status toggle group (Open, Closed, Resolved). Practice questions (ids starting with `H`) are listed separately, as today.
- **Row click:** opens M4.
- **Gap today:** the list is card-based, not a table, and has no status filter.

### M4 Question detail (`/mod/questions/[id]`)

- **Data:** `GET /moderator/questions/{id}`. Fields: `question`, `risk`, `participation`, `first_round`, `latest`, `median_shift`, `distribution` (5 bands), `responses`, `themes`.
- **Header:** question text, ACAPS rating chip, risk and country.
- **Stat tiles:** invited, answered, changed answer (from `participation`). Large numerals.
- **Distribution:** five 20% bands (0–20 … 80–100). Bars from the API's `distribution`. **Not** the prototype's hard-coded counts (see D4).
- **Before and after:** first-round median and latest median, with the shift. Shown only when n ≥ 5.
- **Responses table:** label (pseudonym or "Anonymous expert N"), anonymity level tag, first probability, first reason, revised probability, revision reason. Real `<table>` with captions.
- **AI summary:** labelled "AI draft · moderators only", three groups (agreement, disagreement, new information). Generate or regenerate (`POST …/summarise`). Suppressed under 5 answers. Empty themes show "No summary yet".
- **Actions:**
  - **Update the ACAPS risk**: opens the decision flow (see G1).
  - **No change**: records "keep" (same G1 gap).
  - **Resolve question**: opens the resolve dialog (see §5.2).
- **Gap today:** resolve is an inline two-step confirm, not a dialog. The "Update the ACAPS risk" and "No change" buttons don't exist on this page yet.

### M5 Leaderboard (`/mod/leaderboard`)

- **Data:** `GET /moderator/leaderboard`. Fields: `rank`, `label`, `anonymity_level`, `resolved`, `mean_brier`, `beats_baseline`, `note`.
- **Table:** rank, nickname, resolved count, average accuracy (lower is better), beats the 0.25 benchmark (text and icon, not colour alone).
- **Benchmark card:** "0.25 = always predicting 50%". Anonymous experts are never listed (backend rule).
- **Empty state:** "Not enough resolved questions yet" (backend needs 3 resolved per expert).

### M6 Public results (preview from M4)

- The existing `/outcomes/[questionId]` page is the public output. The moderator screen links to it ("Preview the public summary") for resolved questions only.
- **Gap today:** `PublicOutcomesClient` always fetches the demo route, even when the API is live (see B1). That needs fixing for the preview to be accurate.

### Panel invites (`/mod/panel`)

- Form: email (format checked) and country (list of countries). Output: one-time join link with copy and open actions. The invitee's email is not shown back.
- No change in behaviour. Restyle only.

## 5. Dialogs

### 5.1 Create expert question (from M1 card and M1 detail)

- Fields: question text (prefilled from the trigger), "What counts as yes?" (required), deadline (date input, must be in the future, default +6 months).
- Action: **Send to experts** (primary). Calls `POST /alerts/{id}/decision` with status `approved`.
- Cancel: **Cancel** (ghost). Close with Escape and the close button. Focus trapped, focus restored to the opener.
- Result: banner with `experts_invited`. Errors: 409 "already decided", 422 "check the fields".

### 5.2 Resolve question (from M4)

- Text: "Choose the observed outcome. This sets the accuracy scores for everyone who answered."
- Actions: **It happened** (primary) and **It didn't happen** (secondary). Calls `POST /moderator/questions/{id}/resolve` with `outcome` 1 or 0.
- Confirmation: after success, shows `scored`, mean expert Brier and baseline (existing `ResolvePanel` content).
- Errors: 409 "already resolved".

## 6. Backend gaps (need David; not made here)

| ID | Gap | Impact | Options |
|---|---|---|---|
| G1 | No `POST /risks/{id}/decide` and no `GET /risks/{id}/decisions` on any backend branch | Risk decisions fail in API mode; the audit trail is empty | David adds both (contract already typed in `lib/types.ts`), or the UI shows "not saved" until then |
| G2 | Expert-facing trigger list and sources are not in the API | Not needed for the moderator screens | None for now |
| G3 | Group distribution exists only on the moderator question detail | Fine for moderators | None |
| G4 | No moderator auth beyond the key | Moderator endpoints are protected only by the server-side key | Keep as-is (already server-only) |

## 7. Bugs found in the existing code (fix in this work)

| ID | Where | Problem |
|---|---|---|
| B1 | `components/public/PublicOutcomesClient.tsx:22` | Always fetches `/api/demo/...` even in API mode, so live data is swapped for demo data. |
| B2 | `components/mod/RiskDecisionPanel.tsx` + `app/mod/risks/[id]/page.tsx` | Audit list never receives the decisions, so it is always empty. The new completion % is never sent. |
| B3 | `app/mod/risks/[id]/page.tsx:66` | Uses `border-border-strong`, a token that doesn't exist. |
| B4 | `components/ui/primitives.tsx` (`RiskChip`) | "High" is gold, not red. Rating colours don't match the ACAPS scale. |
| B5 | Inline `borderRadius` in `primitives.tsx` | Overrides the Tailwind radius class, so radii can't be changed from one place. |

## 8. Accessibility

- Real `<table>` with `<caption>`, `<th scope>`. Clickable rows contain a real link or button.
- Dialogs: focus trapped, restored on close, Escape closes.
- Charts: every bar chart has a text summary or a table next to it.
- Status is never colour alone: each chip has a word or icon.
- Contrast: WCAG AA on both themes (checked with the existing `check:contrast` script, extended to the moderator tokens).
- Visible focus: 2–3px ring. Keyboard-only navigation works across the whole dashboard.

## 9. Visual design

- Same brand: ACAPS blue `#0096ba`, navy `#004b78`, risk, access and severity colours from `styles.css`. Bebas Neue for headings and large numerals, Roboto and Roboto Condensed for text and labels.
- Dark moderator theme, scoped to the moderator layout (`.moderator-theme`). The expert app stays light.
- Subtle touches: 1px borders with a faint blue glow on the active card, gradient bars from primary to navy, 150–200ms opacity and transform motion. All motion respects `prefers-reduced-motion`.
- No decorative illustrations on the dashboard.

## 10. Decisions (defaults I will use unless you say otherwise)

| ID | Question | My default |
|---|---|---|
| D1 | The prompt asks for EN and FR, but the project decision is English only. | **English only.** Adding French would reopen a decision you already made. |
| D2 | Sidebar or top tabs? | **Keep top tabs** and restyle them. The routes stay the same. |
| D3 | shadcn/ui and recharts? The prompt assumes them, but this project has neither. | **Custom Tailwind primitives and CSS bars.** No new dependencies, as the prompt asks, and no chart library (CLAUDE.md). |
| D4 | The prototype's distribution counts don't match its own responses. | **Compute the bands from the data** (the prototype's counts are wrong). |
| D5 | Dialogs or inline forms for create and resolve? | **Dialogs** for create and resolve, as the prompt asks. The detail-page forms stay for editing. |
| D6 | Dark theme everywhere in the moderator area? | **Yes**, scoped to `/mod` only. |
| D7 | Risk decisions while G1 is open? | **Keep the controls, show "Not saved yet: waiting for the backend decision endpoint"** instead of a failing request. |

## 11. Checklist (to tick off in Phase 7)

- [ ] M1 list: tabs, cards, Create and Reject, decision banner, empty states
- [ ] M1 detail: form validation, trigger card, routing line
- [ ] M2 list: table, filters, row links, "why it ranks" bars, demo notice
- [ ] M2 detail: questions, triggers, decision panel (per D7), audit list
- [ ] M3: status filters, row links, practice split
- [ ] M4: stat tiles, distribution from data, before and after (n ≥ 5), responses table, AI summary, three actions
- [ ] M4 dialogs: create (validation, Escape, focus) and resolve (both outcomes, errors)
- [ ] M5: ranking table, benchmark text, anonymous exclusion, empty state
- [ ] M6 preview: live data (after B1), resolved-only link
- [ ] Panel: invite and copy
- [ ] Bugs B1–B5 fixed
- [ ] Routes and deep links at 390px, 768px and 1280px
- [ ] Keyboard-only navigation and Escape on both dialogs
- [ ] `check:contrast`, lint, typecheck, unit tests and build all pass

## 12. Not in scope

- Expert app screens and expert routes.
- Backend or database changes (G1 is raised, not built).
- Any push to GitHub before Phase 7 is complete and reported.

---

## 13. Phase 2 progress (data layer + new features)

**Status: Complete**

### Feature 1: Write questions (moderator approves alerts as questions)
- [x] `buildQuestionDecision()` and `buildRejectDecision()` helpers in `lib/moderator-data.ts`
- [x] `decideAlert()` already exists in `lib/client-api.ts`
- [x] Form validation for required fields and future deadline
- [ ] Dialog wrapper for M1 card "Create question" button (UI build phase)
- [ ] Integration on M1 list and card (UI build phase)

### Feature 2: Expert Brier scores (display calibration)
- [x] `formatBrier()` and `accuracyTier()` helpers in `lib/moderator-data.ts`
- [x] `toLeaderboard()` and `toQuestionDetail()` adapters already include Brier
- [x] `ModeratorResponse` type includes `brier` field
- [ ] M4 (question detail) responses table: show Brier per response (UI build phase)
- [ ] M5 (leaderboard) table: show mean Brier per expert (UI build phase)

### Feature 3: Impact scores (risk severity display)
- [x] `deriveImpactLabel()`, `IMPACT_SCALE`, and color helpers in `lib/moderator-data.ts`
- [x] Maps 1–5 numeric to "Very Low"–"Major" ACAPS V5 labels
- [ ] M2 (risks list) table: show impact column (UI build phase)
- [ ] M2 detail: show impact with label (UI build phase)

### Data layer checklist
- [x] Create `lib/moderator-data.ts` with all three feature helpers
- [x] Verify build passes (npm run build ✓)
- [x] No new adapters needed (all data shapes already in contracts)
- [ ] Add unit tests for helpers (optional; vitest not installed yet)
- [ ] Integrate helpers into UI components (Phase 3+)
