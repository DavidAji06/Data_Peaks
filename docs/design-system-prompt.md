# Prompt for agents: apply the "Expert Panel" design to the frontend

> Paste everything below this line into any agent working on the frontend (expert app or moderator dashboard).

---

You are working on the ACAPS Ground Truth frontend: Next.js, mobile-first. It has two surfaces:
the **expert app** (question, context, probability slider and one-line reason, blind answer, group reveal, revision, profile and privacy) and the **moderator dashboard** (alert queue, ranked risks with score breakdown, risk detail, AI summary, update decision).

The design team made a mobile draft of the expert app (`expert panel draft.pdf`, 6 screens). Your job is to **adopt its visual system (tokens, fonts, components, page pattern) in the existing frontend**, not to redesign it. Where the draft has errors (listed below), apply the corrected version. Where a screen isn't designed, build it from the same tokens and components so that it looks like it came from the same designer.

## Step 0 — Look before you change anything

1. Read the existing frontend first. Note the styling approach (Tailwind, CSS modules or other), any existing theme or tokens file, the font loading, the layout components and the routes. Use whichever approach the repo already has; don't add a second styling system.
2. Read the backend API types (FastAPI OpenAPI schema / shared types) so components bind to real fields such as `risk_id`, `country`, `status`, `risk_level`, `question`, `deadline`, `median`, `spread` and `reasons`. Don't hard-code sample text.
3. Map each existing page to a design screen (table in §4). Then restyle in place: replace hard-coded colours, fonts and spacing with the tokens in §1. Keep the existing logic, data fetching and routes.
4. Report what you mapped, what you restyled and what you built new.

## 1. Design tokens (source of truth)

Define these once, as CSS variables and/or the Tailwind theme, and use only these names in components.

### Colours
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#131415` | Top title bar background, body text, dark stat tiles, slider fill, non-highlighted chart bars |
| `--teal` | `#0096BA` | ACAPS accent: risk hero band, thin header rule, section titles, past-case left rule, highlighted chart bar (the user's own bucket), links on white |
| `--navy` | `#004B78` | Primary buttons, card section labels ("WHAT CHANGED"), list-link text, slider end labels and value |
| `--line` | `#DDE3E7` | Card borders, bottom-nav border, dividers |
| `--track` | `#EBEBEB` | Unfilled slider track, empty or disabled surfaces |
| `--muted` | `#9AA7B0` | Placeholders, secondary meta, disabled text |
| `--alert` | `#FF3131` | Deadline line, and errors only (use it sparingly) |
| `--bg` / `--on-dark` | `#FFFFFF` | Page background; text on ink, teal and navy |

No other colours. Severity and impact chips (see §5) are built from these colours too.

### Fonts (Google Fonts, loaded with `next/font`, `display: swap`)
- **Bebas Neue** (400): **display font**, always UPPERCASE. Used for page titles, the risk title, question text, button labels, nav labels and list-link labels.
- **Roboto Condensed** (400, 700): **all body and UI text**. Meta lines, paragraphs, form labels, helper text and chart labels. Section labels use Roboto Condensed 700, uppercase, `letter-spacing: 0.08em`, in teal or navy.
- The draft also uses Arimo/Arial in some places. **Don't use it.** Use Roboto Condensed wherever the draft shows Arimo, so there are exactly two families.

### Type scale (draft is in pt at 414 px width; pt × 1.333 = px)
| Token | Size / line-height | Font | Example |
|---|---|---|---|
| `display` | 26px / 1.15 | Bebas | Risk title in hero, "GROUP VIEW" headline |
| `title` | 24px / 1.1 | Bebas | Title bar ("QUESTION", "MY PROFILE") |
| `question` | 20px / 1.4 | Bebas | The forecast question text |
| `button` | 20px / 1 | Bebas | Primary buttons, nav and list links |
| `section` | 16px / 1.2, 700, tracked caps | Roboto Cond. | "WHAT CHANGED", "T0618 TRIGGER", "HOW LIKELY IS THIS" |
| `body` | 16px / 1.5 | Roboto Cond. | Paragraphs, card text |
| `meta` | 14px / 1.3 (700 + tracked in hero) | Roboto Cond. | "CHAD · Active risk · High", "R1027 · Materialised" |
| `small` | 13px / 1.4 | Roboto Cond. | Helper notes ("Your answer is hidden…"), deadline, chart labels |

### Spacing, radius, size
- Base unit 4px. Page side gutter **16px** (12px minimum). Gap between cards 12–16px. Card padding 16px.
- Card radius **12px**, 1px `--line` border, no shadow.
- Primary button: full width minus gutters, height **52px**, radius **8px**, `--navy` background, white Bebas text.
- Bottom nav: floating pill, 16px from the screen edges and bottom, height about 44px, radius 14px, white with `--line` border. A small caret (^) above the active item.
- Design width is 414px. Keep it fluid from 360px to 480px; above that, centre a 480px column. **No horizontal scroll.**
- Touch targets 44px minimum.

## 2. Page pattern (every expert screen)

From top to bottom:
1. **Logo row**: ACAPS logo top-left, about 28px tall, on white.
2. **Title bar**: full-bleed `--ink` block. Bebas `title` in white, with an optional Roboto Condensed subtitle underneath (e.g. "Share your view on developing risk"). Text left-aligned with an indent of about 48px.
3. **Teal band**:
   - Main screens (Question, Forecast): a **hero band** with the meta line (`COUNTRY · Status · Level`, Roboto Cond. 700, tracked) and the risk title (Bebas `display`, white, wraps freely to as many lines as needed, never truncated).
   - Secondary screens (past cases, triggers, group view, profile): a **6px teal rule** only.
4. **Black tab**: a short `--ink` bar (about 56 × 8px) hanging under the band at the left gutter plus about 24px. It's a signature detail, so keep it on every screen.
5. **Content**: cards and sections as in §3.
6. **Footer**: either the 3-item bottom nav (main screens) or a full-width "‹ BACK TO QUESTION" pill link (detail screens).

## 3. Components

- **Info card** (`What changed`): white, bordered card. Section label in `--navy`, then body text. Emphasis inside text uses Roboto Cond. 700, not colour.
- **List link row** ("VIEW TRIGGER AND SOURCES ›"): bordered card, about 48px tall, Bebas `button` text in `--navy` on the left, chevron on the right.
- **Question card**: question in Bebas `question` in `--ink`, then the deadline line in `small` `--alert` ("Deadline: 6 May 2027").
- **Probability slider**: section "HOW LIKELY IS THIS" in navy, a helper line, then 0% and 100% labels at the ends (Bebas, navy). The track is `--track` with an `--ink` fill and an `--ink` circular thumb (about 20px). The current value sits centred under the thumb in Bebas navy. Steps of 5%, keyboard-accessible, `aria-valuetext="60 percent"`.
- **Reason field**: label "WHY? ONE SHORT REASON, UP TO 280 CHARACTERS." (Bebas, navy). Bordered textarea with radius 8px, `--muted` placeholder, and a live character counter (`small`, turns `--alert` at the limit).
- **Privacy note**: one line, `small`, centred: "Your answer is hidden from the panel until you submit." Show it **once only**; don't repeat it in the deadline line.
- **Past-case item**: 4px `--teal` left rule. Country in Roboto Cond. 22px. Meta `R1027 · Materialised` in `small`. Outcome text in `body`. After the list, a bordered disclaimer card: "These cases show similar humanitarian impact pathways. They are not direct predictions for {country}."
- **Trigger section**: label "T0618 TRIGGER" (teal, tracked caps), then the description, then a **source list with real links** (title, publisher, date). Show **every** trigger of the risk, not just one. Use a small static inset map of the country (SVG, under 15 KB) instead of a world map.
- **Stat tiles** ("YOUR ANSWER" / "GROUP MEDIAN"): two equal `--ink` tiles, radius 8px. White label (Roboto Cond. 700, 18px) and value (Bebas 28px).
- **Distribution chart**: bordered card titled "Group distribution". Four rows for 0–25 / 25–50 / 50–75 / 75–100. The label is on the left, a rounded bar (8px high) uses `--ink`, and the count is on the right. **The bucket that contains the user's own answer is `--teal`** (computed from the data, never fixed). Below the chart, show the spread (IQR) and the **anonymised reasons** list (pseudonym + reason), which the group endpoint returns.
- **Radio group** (privacy): bordered card with three options, each with a 700 title and a body description. **The current level is always shown selected** (navy radio dot).
- **Bottom nav**: QUESTION · GROUP VIEW · MY PROFILE (shorten the draft's "Group view-change my answer"). Before the expert's first answer is saved, **GROUP VIEW is visibly locked**: `--muted` text plus a lock icon, with a tooltip or toast saying "Answer first to see the group view". Don't hide it.

## 4. Screen map (expert app)

| Route / state | Draft page | Notes |
|---|---|---|
| Question context | p1 | Hero, intro line with **bold "2-minute task"**, "What changed" card, two link rows |
| Forecast | p2 | Hero, question card, slider card, reason, **SUBMIT ANSWER**. Submit is disabled until a reason is entered |
| Past cases | p3 | Up to 3 cases from `similar_risks`; each case's text comes from its own risk record |
| Triggers & sources | p4 | All triggers plus their sources |
| Group view (after submit) | p5 | One headline ("HOW DOES YOUR VIEW COMPARE?") plus one subline. Stat tiles, chart, reasons, then **CHANGE MY ANSWER** and **KEEP MY ANSWER** (both navy) |
| Profile / privacy | p6 | Title "MY PROFILE", "Your privacy" section, radio group |
| **Not in draft — build from tokens** | — | Access-link landing / expired link · submitted confirmation · revise step (slider + reason prefilled, "SUBMIT REVISION") · profile: previous responses and Brier track record, "how your contribution was used" · loading skeletons (`--track` blocks) · error and offline banners (`--alert` text on white, bordered) |

## 5. Moderator dashboard (not designed yet — derive from the same system)

- Same tokens and fonts. Desktop layout: `--ink` top bar with the logo and Bebas section title, a 6px teal rule, then a 12-column grid. On phones it collapses to one column.
- **Alert queue**: cards showing the matched trigger (teal tracked label), report evidence and source link, LLM verdict (direction, strength), and actions **APPROVE** (navy), **EDIT QUESTION** (bordered navy text) and **REJECT** (bordered `--alert` text).
- **Ranked risks**: table rows with the risk title (Bebas), `COUNTRY · status`, and the total score. The score breakdown (signal strength, uncertainty p(1−p), impact, review age) shows as an inline stacked bar using ink, teal and navy, with exact values on hover or tap. Country and risk-type filters sit as chips above the table.
- **Impact/severity chip** (from the v7 impact scorer: Very Low / Low / Moderate / Significant / Major): an outlined pill, Roboto Cond. 700 caps. Moderate and below in `--muted`, Significant in `--navy`, Major in a filled `--teal` pill. Show "Flagged for expert review" when the level is Significant or Major. The same chip can appear in the expert app's "What changed" card.
- **Risk detail**: before/after distribution (two charts as in §3, or one chart with paired bars), grouped reasons (Agreement / Disagreement / New information as three bordered cards), the AI summary card (section label "AI SUMMARY", plus a muted line saying it's machine-generated), and the update decision with an audit note.
- Identity: render only what the API returns for the moderator role. Never derive or show names in the UI that the API didn't send.

## 6. Rules

- Bind everything to API data. The draft's sample copy (R1043, R1027, R1000, R1014, T0618, the 60% values, the 4/6/5/3 counts) is illustration only. In particular, the draft's Mali text is a copy of Syria's; each case must render its own record.
- Copy is sentence case in Roboto Condensed and all caps only in Bebas. Fix stray casing ("question", "mY PROFILE") and double spaces.
- No duplicated messages on the same screen (headline vs subline, privacy note vs deadline).
- Performance: no raster images except the logo; icons are inline SVG; fonts are subset with `next/font`. The expert pages should stay light on 3G.
- Accessibility: contrast passes AA (teal `#0096BA` on white is about 3.4:1, so use it only for text ≥ 18px or bold ≥ 14px; use `--navy` for smaller text). Visible focus ring is a 2px `--teal` outline. Labels on all inputs.
- The blind-answer lock is enforced by the API (`GET /questions/{id}/group` refuses before the first response). The UI mirrors it with the locked nav state and never fetches group data early.
- When done, take screenshots at 375px and 414px (and 1280px for the dashboard) and compare them with the draft: logo row, title bar, teal band, black tab, card borders and radii, fonts.
