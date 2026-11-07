# Design Parity Inventory

**Purpose:** Record every screen, component, interactive element, state transition, validation rule, and accessibility feature currently in the frontend. Use this as the checklist for Step 5 (functional parity verification).

**Scope:** Expert app (mobile-first), moderator dashboard (desktop-first), public outcomes, emails (prototype only, not in real app yet).

---

## EXPERT APP (Mobile-First)

### Route: `/q/[token]`
**File:** `app/q/[token]/page.tsx`, `components/expert/ExpertFlow.tsx`

**Data sources:**
- Server: `getExpertQuestion(token)` returns `{ question, risk, trigger_update, similar_risks, answered, revised }`
- Client: device storage for local answer state (`gt:my-answer:{questionId}`)

**Screens (5 steps):**

#### Step 1: Context (`step === 'context'`)
- **Header:** Data Peaks logo (left), demo badge (right if source === 'demo')
- **Eyebrow:** "1 of 4 · Context"
- **Risk title:** question heading (h1), text from data.risk.title
- **ACAPS rating:** Chip component, shows risk level (Low/Medium/High) + band name
- **"What changed"** section: trigger update card with title, description, evidence source link, date
- **Trigger completion bar:** visual bar showing current completion % (from trigger_update.completion)
- **"How similar past risks played out"** section: 3 expandable cards per similar_risk
  - Title, country (muted), ACAPS rating chip, outcome badge (Occurred/Did not occur)
  - Expandable detail: date, description text, learning text
- **Button:** Primary "Continue to estimate" → go('estimate')

#### Step 2: Estimate (`step === 'estimate'`)
- **Header:** logo + demo badge
- **Eyebrow:** "2 of 4 · Your estimate"
- **Question text:** h1 from data.question.text
- **Expandable criteria:** "What counts as yes?" → shows data.question.resolution_criteria
- **Probability slider:**
  - Unset state: slider thumb hidden, no label, grey track
  - Set state: percentage label (0–100, step 5), track filled from 0 to the value, full-width
  - Below slider: two text labels "0% · Not likely" and "100% · Certain"
  - aria-label, id, oninput handler updates state
- **Reason field:**
  - Textarea, max 280 characters
  - Label: "Why? (one line)"
  - Counter: "n/280" (live updated)
  - Placeholder: text from strings
- **Privacy line:** Card showing current anonymity level (read-only for now), link to `/q/{token}/settings`
- **Validation:** Before submit, check percent !== null AND reason.trim().length > 0 → show error notice
- **Button:** Primary "Submit" → submit() → saveMine() → setStep('group')
- **Error states:** Notice with tone 'warning' for validation errors, network errors

#### Step 3a: Group Results (`step === 'group' && !mine?.revised`)
- **Header:** logo + demo badge
- **Eyebrow:** "3 of 4 · Group results"
- **Heading:** "How does your view compare?"
- **Description text**
- **Metric tiles (2-column grid):**
  - "Your first answer" → mine.first as percentage
  - "Group median" → group.median as percentage (null if < 5 answers)
- **Range card:**
  - "Range of answers" → min–max percentages and expert count
  - Bar chart: 6 columns showing answer distribution (0–20, 20–40, 40–60, 60–80, 80–100, no 5th), bar height by count, labels below
- **"What experts are saying" section:**
  - Three whitecards: Agreement, Disagreement, New information
  - Each shows paraphrased group.themes text (empty until moderator generates AI summary)
- **Buttons:**
  - Primary: "Change my answer" → go('revise')
  - Secondary: "Keep my answer" → go('receipt')
- **Access control:** This screen only loads after submitAnswer succeeds AND step === 'group'; data comes from fetchGroupView(). Shows notice if < 5 answers (no median).

#### Step 3b: Revise (`step === 'revise'`)
- **Header:** logo + demo badge
- **Eyebrow:** "3 of 4 · Review your answer"
- **Heading:** "Would you like to change your answer?"
- **Description:** States the original answer and the group median
- **Probability slider:** prefilled with mine.first (or mine.revised if already revised once), unset state removed
- **Reason field:** empty, optional (can be left blank)
- **Validation:** Same as estimate step
- **Buttons:**
  - Primary: "Save" → revise() → saveMine() → setStep('receipt')
  - Ghost: "Back to group results" → go('group')
- **Error states:** Same as estimate

#### Step 4: Receipt (`step === 'receipt'`)
- **Header:** logo + demo badge
- **Eyebrow:** "4 of 4 · Complete"
- **Success badge:** 58px circle, ✓ glyph, teal background
- **Heading:** "Thank you."
- **Description:** Confirmation text
- **Comparison card:** First answer vs Final answer (with divider rule)
- **Closing note:** Text about ACAPS review
- **Button:** Primary "View my profile" → go('/q/{token}/record') or similar
- **Post-receipt state:** Can open profile page

**State transitions:**
1. `context` → `estimate` (primary button)
2. `estimate` → `group` (after successful submitAnswer POST)
3. `group` ↔ `revise` (Change/Back buttons)
4. `revise` → `receipt` (after successful submitRevision POST)
5. Server flags (answered/revised) pre-set step on initial load

**Validation rules:**
- Slider: 0–100 in steps of 5, no unset submit
- Reason: max 280 chars, required non-empty, trimmed before submit
- Percentage counter: live (n/280)

**Error handling:**
- ValidationError (422): show detail text from response
- ConflictError (409): refetch progress flags, recompute step
- NetworkError: show retry notice with callback
- ClosedError (400): show message, disable submit
- NotFoundError (404): redirect to not-found.tsx
- Locked (403 on group): user hasn't answered yet, stay on estimate

**Accessibility:**
- `aria-label` on slider: "Probability estimate"
- Native `<input type="range">` with associated `<label>`
- Labels on textarea
- Focus ring: blue #1d4ed8, 2px offset
- Headings h1 for question, h2 for sections
- lang="en" on body

**Loading state:** QuestionSkeleton (app/q/[token]/loading.tsx) shows while fetching

**Error state:** ExpertFlow error boundary (app/q/[token]/error.tsx) on fetch fail

---

### Route: `/q/[token]/record`
**File:** `app/q/[token]/record/page.tsx`, `components/expert/TrackRecordView.tsx`

**Data sources:**
- Server: `getTrackRecord(token)` returns `{ resolved, mean_brier, beats_baseline, baseline_brier, history[] }`

**Content:**
- **Header:** logo, back/profile button
- **Eyebrow:** "Your track record"
- **Heading:** "How well calibrated are your forecasts?"
- **Metric tiles (2-column grid):**
  - "Questions answered" → resolved count
  - "Average accuracy" → mean_brier (or null if no resolved questions)
- **Explanation text:** "Lower is better. 0 is perfect; 0.25 is guessing. Better than baseline" (if beats_baseline true)
- **History table:**
  - Columns: Question text, Your answer %, Outcome (Happened/Did not), Accuracy (Brier score)
  - Rows: one per history entry, clickable to expand (shows rationale, resolution info)
- **Calibration view:** Simple bar chart or grid showing accuracy by band (optional; current code uses TrackRecordView)
- **Button:** Secondary "Return to question" → back to `/q/{token}`

**Accessibility:** Native table, labels, focus ring

---

### Route: `/q/[token]/settings`
**File:** `app/q/[token]/settings/page.tsx`, `components/expert/ProfileForm.tsx`

**Data sources:**
- Server: `getSettingsPage(token)` returns `{ settings, questionId }`
- Client: form state (anonymity_level, country, topics, max_open_questions)

**Content:**
- **Header:** logo, back button
- **Eyebrow:** "Your privacy settings"
- **Heading:** "How you participate"
- **Anonymity picker:** 3 radio options (known_to_acaps, pseudonymous, anonymous)
  - Each shows label, description, what ACAPS sees, and whether ranked
- **Change warning:** If level changes (especially to less private), show amber notice with retroWarning text
- **Country field:** Text input, max 80 chars (updated: now has datalist with ACAPS_COUNTRIES)
- **Topics field:** Checkboxes, max 10 selected
- **Max open questions:** Radio options 1–5
- **Buttons:**
  - Primary: "Save" → PATCH /q/{token}/settings, then router.refresh()
  - Secondary: "Back to question" → back
- **Validation:**
  - Country: required, 2+ chars
  - At least 1 topic (optional: may not be enforced)
- **Success message:** Notice with green tone "Saved"
- **Error handling:** 404 (invalid link), 422 (validation), network

**Accessibility:** Native radio inputs, labels, focus ring

---

### Route: `/join/[token]`
**File:** `app/join/[token]/page.tsx`, `components/expert/ProfileForm.tsx` (mode='join')

**Data sources:**
- Server: `getJoinInfo(token)` returns `{ country, topics }` (prefilled)

**Content:**
- **Header:** logo, profile button
- **Eyebrow:** "A1 · Join the panel"
- **Heading:** "Help improve humanitarian early warning."
- **Description text**
- **Anonymity picker:** Same as settings (required on join)
- **Country select:** Dropdown or text input with datalist (ACAPS_COUNTRIES)
- **Topics checkboxes:** Max 10 selections
- **Max open questions:** Radio 1–5
- **Language select:** English only (no French)
- **Note:** "No password needed. You can sign in securely through your email links."
- **Button:** Primary "Join the panel" → POST /join/{token} → submitSuccess screen
- **Validation:**
  - Anonymity level: required
  - Country: 2+ chars
- **Error handling:** 409 (link already used), 404 (invalid), 422 (validation), network
- **Success screen (joined=true):** Confirmation card with pseudonym

**Accessibility:** Native radios, labels, focus ring

---

## MODERATOR DASHBOARD (Desktop-First)

### Route: `/mod`
**File:** `app/mod/page.tsx`, `components/mod/AlertDecisionForm.tsx`

**Data sources:**
- Server: `getAlerts()` returns `[{id, risk_id, trigger_id, report{}, direction, strength, evidence, status}]`
- Filter by status: pending, approved, rejected (tabs)

**Content:**
- **Header:** Data Peaks wordmark, "ACAPS Moderator" title
- **Tab buttons:** Pending | Approved | Rejected
- **Alert list:** One card per alert
  - Risk title chip, trigger ID, strength badge, status, "Create question" + "Reject" buttons
- **Decision form:** AlertDecisionForm component (client state, not saved until approved)
  - Question text field (prefilled from risk/trigger)
  - Resolution criteria field
  - Deadline date picker (default +6 months)
  - "Send to experts" button → POST /moderator/alerts/{id}/decision
- **After approval:** "Question sent to N experts" notice
- **After rejection:** "Alert rejected" notice

**Interactive elements:**
- Tab click: filter alerts by status
- "Create question" button: open form (client-side, not persisted)
- "Send to experts" button: POST decision, lock form until success/error
- "Reject" button: POST decision with status=rejected

**Validation:** Deadline >= tomorrow

**Accessibility:** Tabs with proper ARIA, form labels, focus ring

---

### Route: `/mod/panel`
**File:** `app/mod/panel/page.tsx`, `components/mod/InviteForm.tsx`

**Data sources:**
- None (form-only page)

**Content:**
- **Header:** logo, title
- **Heading:** "Invite an expert"
- **Form:**
  - Email input (with EMAIL regex)
  - Country input (with ACAPS_COUNTRIES datalist)
  - Button: "Send invite link" → POST /moderator/panel-invites
- **Success screen:**
  - Copy-to-clipboard button for the join link
  - "Open the sign-up page" button (opens in new tab)
  - "Invite another expert" button
- **Validation:** Email format, country 2+ chars
- **Error handling:** 422 (validation)

**Accessibility:** Labels, focus ring, button states

---

### Route: `/mod/alerts/[id]`
**File:** `app/mod/alerts/[id]/page.tsx`, `components/mod/AlertDecisionForm.tsx`

**Data sources:**
- Server: `getAlert(id)` returns alert object
- Same form as /mod but dedicated page

**Content:** Same as alert decision form, but persisted

---

### Route: `/mod/questions`
**File:** `app/mod/questions/page.tsx`

**Data sources:**
- Server: `getQuestions()` returns `[{id, risk_id, text, status, outcome, deadline, invited, answered, median}]`

**Content:**
- **Header:** ACAPS Moderator, title
- **Table:**
  - Columns: Question, Status, Deadline, Invited, Answered, Median
  - Click row → /mod/questions/[id]
- **Sort/filter:** (if implemented)

**Accessibility:** Table, clickable rows with pointer cursor

---

### Route: `/mod/questions/[id]`
**File:** `app/mod/questions/[id]/page.tsx`, `components/mod/RiskDecisionPanel.tsx`

**Data sources:**
- Server: `getModeratorQuestion(id)` returns full question data including distribution, responses, themes

**Content:**
- **Header:** Question text, risk chip
- **Metrics (3-column grid):** Invited, Answered, Changed answer
- **Answer distribution:** Bar chart (5 bands, 0–100%)
- **Before/after:** Two cards showing first median vs latest median (shift)
- **Expert responses table:**
  - Columns: Expert label (pseudonym or Anonymous N), Anonymity level, First answer, Reason, Revised answer
  - Only shown if anonymity_level != anonymous (small-n rule: >= 5 answers)
- **AI themes card:** "Generate AI summary" button (client action) → POST /moderator/questions/{id}/summarise
  - Draft box with Agreement, Disagreement, New information sections (empty until generated)
  - Label: "Draft generated by AI. Review before use."
- **Decision panel:**
  - RadioGroup: Keep / Raise / Lower / Update trigger / Add trigger
  - Note field: optional text
  - "Save decision" button → POST /moderator/questions/{id}/resolve (or custom endpoint)
  - Audit trail: "Decision recorded: ..." notice
- **Preview button:** "Preview public outcome" → /outcomes/[questionId]

**Accessibility:** Native radios, table, labels

---

### Route: `/mod/risks`
**File:** `app/mod/risks/page.tsx`, `components/mod/RiskList.tsx`

**Data sources:**
- Server: `getRankedRisks()` returns `[{id, title, country, rating, priority, signal_strength, uncertainty, impact, review_age}]`

**Content:**
- **Header:** ACAPS Moderator, title
- **Filters:** Country dropdown, Risk level checkboxes (Low/Medium/High)
- **Table:**
  - Columns: Risk, Country, Rating, Priority, Score breakdown (4 inline bars: signal, uncertainty, impact, age)
  - Click row → /mod/risks/[id]
  - "Last reviewed X days ago" tooltip

**Accessibility:** Table, filters with labels, clickable rows

---

### Route: `/mod/risks/[id]`
**File:** `app/mod/risks/[id]/page.tsx`, `components/mod/RiskDecisionPanel.tsx`

**Data sources:**
- Server: `getRisk(id)` returns risk with triggers, current ACAPS rating, expert distribution (if any questions answered)

**Content:**
- **Header:** Risk title, country chip, ACAPS rating
- **Trigger cards:** One per trigger
  - Title, description, quantitative objective
  - Current completion %
  - Recent reports linked
- **Decision panel:** (if questions answered)
  - Shows expert distribution (5 bands)
  - Before/after comparison
  - Grouped reasons
  - "Update trigger completion %" → RadioGroup or slider
  - "Add trigger" → text input
  - "Record decision" button
- **Recent questions:** List of questions related to this risk
- **Similar risks:** (if implemented)

**Accessibility:** Headings, focus ring, form labels

---

### Route: `/mod/leaderboard`
**File:** `app/mod/leaderboard/page.tsx`

**Data sources:**
- Server: `getLeaderboard()` returns `{baseline_brier, experts[]}`

**Content:**
- **Header:** ACAPS Moderator, title
- **Note:** "Lower accuracy is better. X is the benchmark for always guessing."
- **Table:**
  - Columns: Rank, Nickname, Questions answered, Average accuracy
  - Rows: Expert data (pseudonym only; anonymous experts excluded)
- **Benchmark card:** "0.25 — always guessing"

**Accessibility:** Table, headings

---

## PUBLIC PAGES

### Route: `/outcomes`
**File:** `app/outcomes/page.tsx`

**Data sources:**
- Server: `getPublicOutcomes()` returns `[{questionId, questionText, riskTitle, country, deadline, outcome, group{expertCount, median}, simulated}]`

**Content:**
- **Header:** Data Peaks logo, "Public results"
- **List:** One card per resolved question
  - Question text, risk title, country, group figures (median, count, min–max range if >= 3)
  - Outcome badge (Happened/Did not)
- **Note:** "These questions are closed to new answers. The group forecast is anonymized."

**Accessibility:** Headings, card links

---

### Route: `/outcomes/[questionId]`
**File:** `app/outcomes/[questionId]/page.tsx`

**Data sources:**
- Server: `getPublicOutcome(questionId)` returns aggregates only (no individual answers)

**Content:**
- **Header:** logo, back link
- **Question text:** h1
- **Risk and country:** chips
- **Group figures:**
  - Group median %
  - Range (min–max)
  - Expert count (suppressed if < 3)
- **Outcome:** Happened/Did not badge
- **AI themes:** (if generated and approved by moderator)
  - Agreement, Disagreement, New information
  - No pseudonyms or individual answers anywhere
- **"How is this question resolved?"** section: explanation of resolution criteria and outcome determination

**Accessibility:** Headings, semantic structure, no hidden data

---

### Route: `/` (Demo Hub)
**File:** `app/page.tsx`

**Content:**
- **Header:** Data Peaks wordmark + intro sentence
- **Three buttons:**
  1. "Expert view (R1043 question)" → /q/demo-expert-a
  2. "ACAPS moderator" → /mod
  3. "Public outcomes" → /outcomes
- **Footer:** copyright + explanatory text

**Accessibility:** Native buttons, links

---

## COMPONENTS (Shared UI & Expert)

### `components/ui/primitives.tsx`
**Exports:**
- `Button` (className + onClick)
- `Card` (container)
- `Chip` (variants: default, gold, gray)
- `Notice` (tone: info/warning)
- `Badge` (status badges)
- `DemoBadge` ("Demo data (offline)")
- `RiskChip` (risk level with color)
- `Skeleton` (pulse animation for loading)

**Design:**
- Button: full width (mobile), min-h-11 (44px), padding 3–4px, border-radius 12px, font weight 750
- Card: border 1px, surface background, padding 15px, radius 14px
- Chip: 11px, weight 800, padding 5–8px, radius 7px
  - Default: accent-soft bg with accent text
  - Gold: gold-50 bg with gold-700 text
  - Gray: gray-50 bg with gray-700 text
- Notice: banner with tone color, padding 14px, icon (optional), inline action (optional)

**Accessibility:** Semantic `<button>` and `<div>` (or `<section>`), labels where needed

---

### `components/expert/ProbabilitySlider.tsx`
**Props:** `value`, `onChange`, `min`, `max`, `step`, `label`, `id`

**Features:**
- Native `<input type="range">`
- Custom track gradient (color-filled from 0 to value)
- Unset state: hidden thumb, grey track
- Large thumb (44px tall when visible)
- Inline `--fill` CSS variable updated on oninput
- Percentage label displayed separately (not on slider)
- ACAPS band shaded on the track (optional; currently implemented in GroupAxis)

**Accessibility:** aria-label, associated label element

---

### `components/expert/GroupAxis.tsx`
**Props:** `question`, `group`, `myAnswer`

**Features:**
- Horizontal axis 0–100%
- Group median line
- My mark (bar or dot)
- ACAPS band shaded
- Min/max range labels
- Expert count label
- Suppresses all figures if < 5 answers

**Accessibility:** SVG with `<text>` labels, no interactive elements (display only)

---

### `components/expert/AnonymityPicker.tsx`
**Props:** `value`, `onChange`

**Features:**
- 3 radio options (known_to_acaps, pseudonymous, anonymous)
- Each option shows label, description, "What ACAPS sees", "Ranked?"
- Radio group with native `<input type="radio">`

**Accessibility:** Native radios, fieldset legend, labels

---

### `components/mod/AlertDecisionForm.tsx`
**Props:** `alert`, `onSubmit`, `onReject`

**Features:**
- Question textarea (prefilled from alert/trigger)
- Resolution criteria textarea
- Deadline date input (min date = tomorrow)
- "Send to experts" (primary) and "Reject" (ghost) buttons
- Client state (form values not persisted)
- When form mounts, sets initial values from alert/trigger
- After submit/reject, navigates or shows notice

**Accessibility:** Labels, focus ring

---

### `components/mod/RiskDecisionPanel.tsx`
**Props:** `question`, `onSave`

**Features:**
- RadioGroup: Keep / Raise / Lower / Update trigger / Add trigger
- Note textarea (optional)
- "Save decision" button → calls onSave callback → POST /moderator/questions/{id}/resolve
- Shows audit trail notice after save

**Accessibility:** Native radios, labels

---

### `components/mod/ModNav.tsx`
**Features:**
- Side navigation (desktop) or horizontal tabs (mobile < 800px)
- Links to: Alerts, Questions, Risks, Leaderboard, Panel invites
- Highlights current section
- Wrapped in Suspense with NavLinks fallback

**Accessibility:** Native `<nav>`, active link aria-current

---

## GLOBAL STATE & CONTEXT

**No Redux/Context API used.** State is local to components (`useState`) or in device storage (`lib/storage.ts`).

---

## DATA LAYER

### `lib/api.ts` (Server-only)
**Loaders:**
- `getExpertQuestion(token)` → fetches GET /q/{token}
- `getTrackRecord(token)` → fetches GET /q/{token}/track-record
- `getSettingsPage(token)` → fetches GET /q/{token}/settings
- `getAlerts()` → fetches GET /alerts?status={status}
- `getAlert(id)` → not implemented (alerts filtered client-side)
- `getModeratorQuestion(id)` → fetches GET /moderator/questions/{id}
- `getRankedRisks()` → fetches GET /risks/ranked
- `getRisk(id)` → fetches GET /risks/{id}
- `getLeaderboard()` → fetches GET /moderator/leaderboard
- `getPublicOutcomes()` → fetches GET /public/questions
- `getPublicOutcome(id)` → filters from getPublicOutcomes
- `getJoinInfo(token)` → fetches GET /join/{token}
- `getSource()` → calls GET /health to determine API vs demo

**Error handling:**
- Timeout: 5 seconds
- NetworkError: triggers demo fallback if NEXT_PUBLIC_DEMO_FALLBACK=true
- ApiError: 404, 409, 422 status codes mapped to error.kind
- All loaders wrapped in Suspense on their pages

**Fallback (demo mode):**
- If API unreachable and NEXT_PUBLIC_DEMO_FALLBACK=true, re-runs loader on mock backend
- Shows "Demo data (offline)" badge
- Never mixes real and demo data on same screen

---

### `lib/client-api.ts` (Browser only)
**Actions:**
- `submitAnswer(source, token, {probability, reason})` → POST /q/{token}/responses
- `submitRevision(source, token, {probability, reason})` → POST /q/{token}/revision
- `fetchGroupView(source, token)` → GET /q/{token}/group (returns 'locked' if not answered)
- `fetchProgress(source, token)` → lightweight GET to check answered/revised flags
- `fetchThemes(source, questionId)` → (not yet called; moderator generates it)
- `resolveQuestion(source, id, outcome)` → POST /moderator/questions/{id}/resolve
- `approveAlert(source, id, questionData)` → POST /alerts/{id}/decision
- `rejectAlert(source, id)` → POST /alerts/{id}/decision with status=rejected
- `createPanelInvite(source, {email, country})` → POST /moderator/panel-invites
- `joinPanel(source, token, {anonymity_level, country, topics, max_open_questions})` → POST /join/{token}
- `updateSettings(source, token, {anonymity_level?, country?, topics?, max_open_questions?})` → PATCH /q/{token}/settings

**Error handling:**
- Network: show retry notice with callback
- Validation (422): show detail text
- Conflict (409): refetch state, recompute step
- Locked (403): redirect to estimate or error
- NotFound (404): show "invalid link" message
- Closed (400): show "question closed" message

**Retry logic:** User-initiated via notice.retry callback, not automatic

---

### `lib/probability.ts`
**Exports:**
- `bandLabel(probability)` → band name ("Low", "Medium", "High") based on 5 bands
- `fromPercent(n)` → converts 0–100 to 0–1
- `toPercent(n)` → converts 0–1 to 0–100
- `brier(forecast, outcome)` → computes (forecast - outcome)²
- `isBetterThanBaseline(score)` → checks if score < 0.25
- `roundLikePython(n)` → mirrors Python's round() for Brier scores

---

### `lib/anonymity.ts`
**Exports:**
- `MIN_GROUP_SIZE` = 5 (matches backend)
- `canShowFigures(answeredCount)` → answers >= 5
- `expertLabel(response)` → computes display label based on anonymity_level
  - known_to_acaps: pseudonym with `identity_known: true` (shows name if available)
  - pseudonymous: pseudonym
  - anonymous: "Anonymous expert N"

---

### `lib/types.ts`
**Key types:**
- `ApiQuestion` (backend snake_case)
- `ExpertQuestion` (UI camelCase) — union of all expert-facing data
- `GroupView` — median, min, max, themes, response_count
- `AnonymityLevel` = 'known_to_acaps' | 'pseudonymous' | 'anonymous'
- `Response` — single answer with probability, reason, timestamp
- `DataSource` = 'api' | 'demo'
- Error types in union `ApiError`

---

### `lib/storage.ts`
**Exports:**
- `readJSON<T>(key)` → localStorage.getItem(key) parsed, null if missing
- `writeJSON(key, value)` → localStorage.setItem(key, JSON.stringify(value))

**Used for:**
- Device answer state (myAnswer key) in ExpertFlow
- Offline fallback: answer saved locally if submit fails

---

## VALIDATION & ERROR STATES

**Validation rules (enforced client-side before submit):**
- Probability: required, must be set (not null)
- Reason: required, max 280 chars, must be non-empty after trim
- Country: required, >= 2 chars, (now validated against ACAPS_COUNTRIES)
- Anonymity level: required on join, optional on settings
- Email: regex match (moderator)
- Deadline: must be >= tomorrow (moderator)

**Error states (shown to user):**
- Validation error (422): show error.detail text from response
- Conflict (409): "Already submitted. Refreshing..." then jump to correct step
- Not found (404): "This link isn't valid"
- Closed (400): "This question is no longer accepting answers"
- Locked (403): "You must answer first" (on group view)
- Network: "Connection error. [Retry] button"
- Generic: "Something went wrong. [Retry] button"

**Loading states:**
- QuestionSkeleton: placeholder cards while fetching
- Form submit: button disabled + "Sending..." label

**Empty states:**
- No pending alerts: "No pending alerts to review"
- No resolved questions: "No resolved questions yet"
- < 5 answered: "Not enough responses to show safely yet"

---

## ACCESSIBILITY AUDIT CHECKLIST

- [ ] All interactive elements are keyboard accessible (Tab, Enter, Space)
- [ ] Slider has `role="slider"`, `aria-label`, and proper `aria-valuemin/max/now`
- [ ] Accordions have `aria-expanded` on button
- [ ] Active nav link has `aria-current="page"`
- [ ] All inputs have associated `<label>` elements
- [ ] Radios in `<fieldset>` with `<legend>`
- [ ] Focus ring visible: #1d4ed8, 2px offset
- [ ] Colour not the only way to convey info (labels + text required)
- [ ] Headings semantic (h1, h2, h3; no skipped levels)
- [ ] Image alt text on all images (none used currently; Risk Radar has none)
- [ ] Links are underlined or have sufficient color contrast (if not underlined)
- [ ] `lang="en"` on `<html>`
- [ ] Table `<th>` with `scope` attribute
- [ ] No autoplaying audio/video (none currently)
- [ ] Focus not trapped (modals have Escape handler or backdrop click)
- [ ] Prefers-reduced-motion: transitions disabled
- [ ] Contrast: WCAG AA minimum (4.5:1 for body text, 3:1 for large text)

---

## MOTION & TRANSITIONS

**Current transitions:**
- Button background/transform on click: ~150ms (Tailwind default)
- Notice appear: fade in (if implemented)
- Slide movement (if any): ~200ms (if implemented)
- Respect prefers-reduced-motion: no transitions if set

---

## RESPONSIVE BREAKPOINTS

**Mobile-first (expert app):**
- 360px: full bleed, single column
- 768px (md): same layout (mobile optimized)
- 1280px (lg): still single column (expert app is mobile-first)

**Desktop-first (moderator dashboard):**
- 1280px: full layout with sidebar nav
- 800px (md): sidebar becomes horizontal tabs, tables scroll horizontally
- Below 800px: single column if needed

---

## DEMO/SYNTHETIC DATA

**Never committed to repo; marked with `synthetic: true` or labeled "Demo data (offline)" in UI:**
- Alert messages
- Similar risks (R0248, R0998, R1002 outcomes)
- Expert responses (7 synthetic experts)
- Ranked risks (placeholder scores until ML pipeline)
- Track record replay questions (H001–H008 with simulated Brier scores)

---

## OPEN ITEMS (Not yet implemented; requested in HANDOFF.md)

1. **Anonymity level retrieval:** `GET /q/{token}` should return expert's level for "Who sees this?" display
2. **AI theme generation:** Button wired but endpoint not called yet; waiting for ML pipeline
3. **Risk decision endpoint:** `/mod/risks/{id}/decision` doesn't exist; decisions stored in memory only
4. **Moderator auth:** No auth yet; anyone can open `/mod`
5. **Expert auth:** No sign-in; token in URL is the credential
6. **Email notifications:** Prototype-only; no sending in real app yet
7. **Country validation:** Frontend now has datalist; backend should validate too
8. **Moderator key:** Server-only env var (MODERATOR_KEY), not exposed to browser

---

## STEP 5 VERIFICATION CHECKLIST

Use this list to verify every item still works after the visual restyle:

### Expert Flow
- [ ] Context step renders and scrolls on demand
- [ ] Slider starts unset, fills on drag, percentage updates
- [ ] Reason counter updates on input
- [ ] Submit disabled until both filled
- [ ] Group view fetches on step 3
- [ ] Group figures (median, range) display correctly
- [ ] < 5 answers shown as "Not enough responses"
- [ ] Revise button prefills slider with first answer
- [ ] Back to group results button works
- [ ] Receipt shows both first and final answers
- [ ] Device storage persists answer across page reload

### Moderator Alerts
- [ ] Tab filter works (pending/approved/rejected)
- [ ] Alert decision form prefills from alert data
- [ ] Deadline picker defaults to +6 months, min tomorrow
- [ ] Send button POSTs and shows success notice
- [ ] Reject button POSTs with status=rejected

### Moderator Questions
- [ ] Questions table renders and sorts
- [ ] Click row navigates to detail
- [ ] Detail shows distribution, responses, themes
- [ ] "Generate AI summary" button callable (API stub OK)
- [ ] Decision panel tracks choice + note
- [ ] Save button POSTs and shows audit notice

### Public Outcomes
- [ ] Outcomes list shows resolved questions only
- [ ] Click question navigates to detail
- [ ] Detail shows group median (no individual answers)
- [ ] < 3 answers: figures suppressed

### Join/Settings
- [ ] Join form shows all 4 fields
- [ ] Anonymity picker required on join, optional on settings
- [ ] Country datalist shows ACAPS names
- [ ] Submit POST works
- [ ] Settings PATCH works
- [ ] Warning shown when level changes

### Error States
- [ ] Invalid token → not-found page
- [ ] API unreachable + DEMO_FALLBACK=true → "Demo data (offline)" badge
- [ ] Network error during submit → retry notice
- [ ] Validation error (422) → shows detail text
- [ ] Already submitted (409) → refetch state, jump to correct step

### Loading States
- [ ] QuestionSkeleton shows while fetching
- [ ] Button locked + "Sending..." during POST
- [ ] No flash (skeleton visible briefly, then content)

### Accessibility
- [ ] Tab key navigates buttons, inputs, links
- [ ] Enter submits forms
- [ ] Space toggles radios
- [ ] Slider keyboard arrows work
- [ ] Focus ring visible on all interactive elements
- [ ] Aria-labels present on slider
- [ ] Headings are semantic and properly nested

