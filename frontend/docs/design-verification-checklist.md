# Design Verification Checklist — STEP 5

**Purpose:** Systematically verify that every item in `design-parity.md` still works correctly with the new teal design system after the restyle.

**Test Environment:**
- Dev server: http://localhost:3000
- Breakpoints: 390px (mobile), 768px (tablet), 1280px (desktop)
- Browser: Chrome/Safari/Firefox

---

## Expert Flow (`/q/[token]`)

### Visual Verification (390px width)

- [ ] **Header**
  - [ ] Data Peaks logo visible and properly sized
  - [ ] Demo badge present (if source === 'demo')
  - [ ] Logo color is teal (#14776e)
  - [ ] Spacing and padding match prototype

- [ ] **Step Indicator**
  - [ ] Eyebrow text visible ("1 of 4 · Context" format)
  - [ ] Text styling: 11px, uppercase, letter-spacing 1.2px
  - [ ] Color: ink-500 (#5d7280)

### Context Step (Step 1)

- [ ] **Risk Title Heading (h1)**
  - [ ] Font size: 25px, weight 800, letter-spacing -0.7px
  - [ ] Color: ink-900 (#173247)
  - [ ] Line height: ~1.18
  - [ ] Text content from data.risk.title

- [ ] **ACAPS Rating Chip**
  - [ ] Shows risk level ("High", "Medium", "Low")
  - [ ] Color matches prototype: gold for High, amber for Medium, green for Low
  - [ ] Chip background: soft tinted (#fbf1dc for gold, etc)
  - [ ] Font: 11px, bold, no uppercase

- [ ] **"What Changed" Section**
  - [ ] Section header visible
  - [ ] Trigger card background: surface-card (#f5f8f9)
  - [ ] Border: 1px border-subtle (#dce7ea)
  - [ ] Card padding: 15px
  - [ ] Card radius: 14px
  - [ ] Text content readable

- [ ] **Similar Past Risks Cards**
  - [ ] 3 expandable cards visible
  - [ ] Default state: shows title + country + ACAPS rating + outcome chip
  - [ ] Click/tap expands to show detail, description, learning
  - [ ] Outcome chip color: teal for "Occurred", gray for "Did not occur"
  - [ ] Expand/collapse indicator (+ / −) visible and functional

- [ ] **Continue Button**
  - [ ] Full-width button
  - [ ] Background: primary-600 (#14776e)
  - [ ] Text: white, bold
  - [ ] Min height: 49px
  - [ ] Rounded: 12px
  - [ ] Hover: darkens to primary-700 (#0e6b65)
  - [ ] Click navigates to estimate step

### Estimate Step (Step 2)

- [ ] **Question Text**
  - [ ] h1 heading, teal color tokens applied
  - [ ] Text from data.question.text

- [ ] **Expandable Criteria**
  - [ ] Title: "What counts as yes?"
  - [ ] Click to expand/collapse works
  - [ ] Expanded shows data.question.resolution_criteria text
  - [ ] Indicator (▾ / ▸) visible

- [ ] **Probability Slider**
  - [ ] Unset state: thumb hidden, track gray
  - [ ] Click/drag sets value 0–100 in steps of 5
  - [ ] Filled portion of track: teal (primary-600)
  - [ ] Empty portion: light gray (border-subtle)
  - [ ] Thumb: teal with white border, 44px target area
  - [ ] Percentage display updates in real-time
  - [ ] Big numerals: 36px, weight 850 when set; muted 13px when unset

- [ ] **Reason Textarea**
  - [ ] Min height: 44px
  - [ ] Width: full
  - [ ] Max 280 characters enforced
  - [ ] Character counter: "n/280" right-aligned
  - [ ] Counter updates live as user types
  - [ ] Label: "Why? (one line)" – 13px, weight 750

- [ ] **Privacy Card**
  - [ ] Background: surface-card
  - [ ] Shows current anonymity level
  - [ ] Link to `/q/{token}/settings` visible
  - [ ] Link text and color: teal (#14776e)

- [ ] **Submit Button**
  - [ ] Full-width, primary style
  - [ ] Disabled until both slider and reason filled
  - [ ] Shows error notice if validation fails
  - [ ] Click submits and navigates to group step

### Group Results Step (Step 3a)

- [ ] **Heading & Description**
  - [ ] h1: "How does your view compare?"
  - [ ] Description text below

- [ ] **Metric Tiles (2-column grid)**
  - [ ] Left tile: "Your first answer" + percentage (big numerals)
  - [ ] Right tile: "Group median" + percentage
  - [ ] Tiles: surface-card background, 14px radius, border-subtle
  - [ ] Padding: 15px
  - [ ] Gap between tiles: visible

- [ ] **Range Card**
  - [ ] Shows min–max range (e.g., "45%–80%")
  - [ ] Expert count visible ("6 of 6 experts answered")
  - [ ] Bar chart with 5 columns (0–20, 20–40, 40–60, 60–80, 80–100)
  - [ ] Bar heights proportional to counts
  - [ ] Bar color: primary-500 (#16827b)
  - [ ] Labels: "20%" below each column

- [ ] **"What Experts Are Saying" Whitecards**
  - [ ] 3 cards: Agreement, Disagreement, New information
  - [ ] Cards: white background, 1px border, 14px radius
  - [ ] Text content visible

- [ ] **Change/Keep Buttons**
  - [ ] "Change my answer" primary button (full-width, teal)
  - [ ] "Keep my answer" secondary button (teal-50 bg, teal text)
  - [ ] Both functional

### Revise Step (Step 3b)

- [ ] **Slider & Reason (same as estimate)**
  - [ ] Slider prefilled with original answer
  - [ ] Reason field optional (can be empty)

- [ ] **Save/Back Buttons**
  - [ ] "Save" primary (teal)
  - [ ] "Back to group results" ghost (white with border)
  - [ ] Both functional

### Receipt Step (Step 4)

- [ ] **Success Badge**
  - [ ] 58px circle
  - [ ] Pale teal background (#e6f4f1)
  - [ ] Checkmark glyph visible
  - [ ] Centered

- [ ] **Heading & Description**
  - [ ] h1: "Thank you."
  - [ ] Confirmation message below
  - [ ] Both centered

- [ ] **Comparison Card**
  - [ ] First answer vs final answer
  - [ ] Divider rule between them
  - [ ] Both values shown as percentages
  - [ ] Card: surface-card, 15px padding, 14px radius

- [ ] **Closing Note**
  - [ ] Text about ACAPS review
  - [ ] Link to profile button

---

## Mobile Responsiveness

### 390px (Mobile)

- [ ] Full-bleed layout (no side gutters except page padding)
- [ ] Buttons full-width
- [ ] Cards stack vertically
- [ ] Tables scroll horizontally (if any)
- [ ] Touch targets: ≥ 44px
- [ ] No overflow on x-axis

### 768px (Tablet)

- [ ] 2-column grids become single-column or 2 cols as appropriate
- [ ] Buttons full-width
- [ ] Padding increases slightly

### 1280px (Desktop)

- [ ] Centered max-width container (~40em for expert)
- [ ] Buttons full-width in container
- [ ] 2-column grids render as 2 columns
- [ ] Moderator dashboard has sidebar (if implemented)

---

## Form & Input Validation

- [ ] Slider: no submit until value set
- [ ] Reason: no submit until non-empty
- [ ] Slider + reason both required shows appropriate error notice
- [ ] Error notice: warning tone (gold background)
- [ ] Error message text readable
- [ ] Error clears when both fields filled again

---

## State Transitions

- [ ] Context → Estimate: "Continue" button works
- [ ] Estimate → Group: Submit works, data persists
- [ ] Group → Revise: "Change my answer" works, slider prefilled
- [ ] Revise → Receipt: Save works
- [ ] Receipt back button works
- [ ] Device storage: answer persists after page reload (in demo mode)

---

## Loading & Error States

- [ ] Loading skeleton visible while fetching
- [ ] Network error shows notice with retry button
- [ ] Invalid token (404) shows not-found page
- [ ] Question closed (400) shows appropriate message
- [ ] Demo fallback badge shows when offline
- [ ] "Not enough responses" shown when < 5 answers

---

## Accessibility

- [ ] Slider has `aria-label` and proper `role="slider"`
- [ ] All inputs have associated `<label>` elements
- [ ] Radios in `<fieldset>` with `<legend>`
- [ ] Tab navigation works (no traps)
- [ ] Focus ring visible: teal (#64a7b7), 3px, 2px offset
- [ ] Keyboard: Enter submits, Space toggles radios, Escape closes modals
- [ ] Heading hierarchy: h1 → h2 → h3 (no skipped levels)
- [ ] Color not the only signal (labels + text always present)
- [ ] `lang="en"` on `<html>`

---

## Moderator Dashboard (`/mod`)

- [ ] Alert cards visible with proper styling
- [ ] Tab filter (Pending/Approved/Rejected) works
- [ ] Risk ranking table renders
- [ ] Mini bars show progress with proper teal color
- [ ] Questions list loads
- [ ] Question detail shows distribution chart
- [ ] Decision panel functional
- [ ] Leaderboard shows expert scores
- [ ] Page headers styled correctly (dark text, proper sizing)

---

## Public Pages (`/outcomes`)

- [ ] Outcomes list loads
- [ ] Click navigates to detail
- [ ] Detail page shows group median only (no individual answers)
- [ ] Outcome badge visible
- [ ] < 3 answers suppresses figures

---

## Signup/Settings (`/join/[token]`, `/q/[token]/settings`)

- [ ] Join form loads
- [ ] Anonymity picker displays 3 options with descriptions
- [ ] Country field has datalist (ACAPS country names)
- [ ] Topics checkboxes work (max 10 selectable)
- [ ] Max open questions radio works (1–5)
- [ ] Submit button functional
- [ ] Settings form prefills from data
- [ ] Privacy change warning shows when level changes to less private
- [ ] Save button functional
- [ ] Router.refresh() called after settings save (fixes back-nav cache)

---

## Color System Verification

- [ ] Primary accent (buttons, links, progress): teal (#14776e)
- [ ] Primary hover: darker teal (#0e6b65)
- [ ] Primary-50: light teal (#e6f4f1) for active nav/soft backgrounds
- [ ] Primary-100: teal chip bg (#e6f2f0)
- [ ] Text (body): ink-900 (#173247)
- [ ] Text (secondary): ink-700 (#23455a) or ink-500 (#5d7280)
- [ ] Text (muted): ink-500 (#5d7280)
- [ ] Text (footer): ink-400 (#728692)
- [ ] Surfaces: page (#edf2f4), card (#f5f8f9), white (#ffffff)
- [ ] Borders: subtle (#dce7ea), default (#c9d9df)
- [ ] Gold (High risk): bg #fbf1dc, text #866017
- [ ] Grey (signal): bg #e9eff1, text #496271
- [ ] Focus ring: teal (#64a7b7)

---

## Typography Verification

- [ ] Base body: 15px, line-height 1.6
- [ ] h1: 25px, weight 800, letter-spacing -0.7px
- [ ] h2: 20px, weight 800 (if used)
- [ ] h3: 16px, weight 800 (if used)
- [ ] Labels: 13px, weight 750
- [ ] Eyebrow: 11px, weight 800, uppercase, letter-spacing 1.2px
- [ ] Big numerals: 36px, weight 850, letter-spacing -1px
- [ ] Muted text: 13px, ink-500 color
- [ ] Footer text: 12px, ink-400 color

---

## Lint & Build Verification

- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run build` passes (0 errors)
- [ ] No TypeScript errors in console
- [ ] CSS compiles without errors
- [ ] No console warnings about missing classNames

---

## Summary Checklist

**Expert Flow:** [ ] Context [ ] Estimate [ ] Group [ ] Revise [ ] Receipt  
**Mobile (390px):** [ ] Layout [ ] Typography [ ] Buttons [ ] Cards [ ] Forms  
**Desktop (1280px):** [ ] Layout [ ] Typography [ ] Buttons [ ] Cards [ ] Forms  
**Accessibility:** [ ] Keyboard [ ] Focus ring [ ] Labels [ ] Semantics [ ] Color contrast  
**Colors:** [ ] Teal primary [ ] Surfaces [ ] Text [ ] Borders [ ] Status  
**Typography:** [ ] h1/h2/h3 [ ] Labels [ ] Body [ ] Muted [ ] Footer  
**State Transitions:** [ ] All steps [ ] Errors [ ] Loading [ ] Device storage  
**Build:** [ ] Lint clean [ ] Build passes [ ] No errors [ ] No warnings  

---

## Notes

- This checklist should be completed by manually testing in a browser at the specified breakpoints
- Each item should be visually verified by taking screenshots if needed
- For the best results, test in multiple browsers (Chrome, Safari, Firefox)
- All color values should match the prototype within acceptable variance (±1-2 hex values)
- Typography measurements can be verified using browser dev tools (Inspector)

