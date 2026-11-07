DATA PEAKS / ACAPS EXPERT PANEL — LOVABLE EDIT MASTER PROMPT
Edit brief for the existing Lovable project (the "ACAPS expert panel app", TanStack Start + React + Tailwind 4)
Builds on: "Data Peaks — Expert Mobile App, Lovable Master Build Prompt" (7 November 2026)
Specification date: 7 November 2026

HOW TO USE THIS FILE
Paste everything between BEGIN EDIT PROMPT and END EDIT PROMPT into the Lovable chat of the existing project. Do not start a new project. If Lovable prefers attachments, attach this file and send the short kickoff message at the end. The earlier build prompt (Data_Peaks_Lovable_Expert_App_Master_Prompt.txt) can be attached as a secondary reference: it is the source for the GLOBE, PROFILE and GROUP designs only. Where the two documents disagree, THIS document wins, and in particular this document keeps the CURRENT colour scheme and typography, not the black/neon palette of the earlier one.

BEGIN EDIT PROMPT

You are editing an existing, working Lovable project: the ACAPS expert panel mobile app. You are the lead product designer and frontend engineer for this edit. Make the changes below directly in the codebase. This is an edit to a live app, not a rebuild: keep everything that is not explicitly changed, keep the code organised, and finish every item in this brief before reporting back. Do not substitute a written plan for implementation and do not stop after the first screen.

=====================================================================
00. WHAT EXISTS TODAY (READ BEFORE CHANGING ANYTHING)
=====================================================================

Files that hold the product today:
- src/routes/index.tsx — the "/" route; renders <PhoneApp lang setLang />.
- src/routes/__root.tsx — HTML shell, fonts (Bebas Neue, Roboto, Roboto Condensed), QueryClientProvider.
- src/components/datapeaks/PhoneApp.tsx — the whole phone experience: header, title band, tab row, and the screens Join, Question, Group, Change answer, Completed ("done"), Profile, Status ("errors").
- src/components/datapeaks/shared.tsx — Wordmark, Badge, SectionLabel, Card, Button, LangToggle, median, brier, beatsGuessing, demo constants.
- src/components/datapeaks/i18n.ts — every string, in English (en) and French (fr), plus pct().
- src/styles.css — the ACAPS brand tokens (@theme inline + :root). THE COLOUR AND TYPE SOURCE OF TRUTH.
- src/assets/camp_sahel.jpg, src/assets/convoy_chad.jpg — the two humanitarian photos.

Data layer (wired to the team's FastAPI backend — MUST BE PRESERVED, see section 10):
- src/lib/api.ts — typed HTTP client for the expert endpoints (GET /q/{token}, POST /q/{token}/responses, POST /q/{token}/revision, GET /q/{token}/group, GET /q/{token}/track-record, GET/PATCH /q/{token}/settings).
- src/components/datapeaks/useExpert.ts — the React hook that loads the question, settings and track record and exposes submit / revise / save actions and loading + error states.
If a file in this list has been renamed in the project, find its equivalent and apply the same rule.

Reference implementation (already built in the team repo, expert-app/): if these files are present, keep them and polish rather than rebuild:
- src/components/datapeaks/Globe.tsx — react-globe.gl globe, deep-blue sphere, red markers, halo for "your question", +/- zoom, reset, pause when hidden.
- src/components/datapeaks/contexts.ts — the demo-snapshot context list and START_VIEW.
- src/components/datapeaks/PhoneApp.tsx — Profile / Home / Questions / Group tabs, Group sub-states (compare / revise / done), Profile sections A–F.
- src/styles.css — --globe-* variables appended to :root (no other token touched).

The current header tab row has SIX entries: Join, Question, Group view, Completed, Profile, Status.
After this edit it must have exactly FOUR: Profile, Home, Questions, Group.

=====================================================================
01. NON-NEGOTIABLE CONSTRAINTS
=====================================================================

1. COLOUR: Do not change a single colour token. Keep every value in src/styles.css :root exactly as it is: background #f8fafc, foreground #0f172a, card white, ACAPS Blue (--primary, #0096ba), text-safe blue (--primary-strong), ACAPS Dark Blue (--navy, #004b78), --risk (#b8163c), --access, --severity, --success, --secondary, --muted, --accent, --border, --input, --ring. Do not introduce a dark theme, do not introduce the black / neon blue / cyan palette from the earlier build prompt, do not add gradients other than the existing navy photo overlay. New components must use the existing tokens via Tailwind classes (bg-card, bg-navy, text-navy, text-primary-strong, bg-accent, border, text-muted-foreground, text-risk, bg-foreground text-background, etc.).
   The ONLY new colours permitted are inside the globe (section 05): the deep-blue sphere and the red markers. Define them once as CSS variables in src/styles.css (for example --globe-ocean, --globe-land, --globe-border, --globe-atmosphere, --globe-marker) and read them from there; do not scatter hex values through components.

2. TYPOGRAPHY: Keep the three existing families and how they are used: Bebas Neue (font-display) for page titles, big numbers and button labels; Roboto (font-sans) for body text; Roboto Condensed (font-condensed) for labels, meta lines, chips and tab labels. Keep current sizes and the SectionLabel style (Bebas, navy, with the short blue bar). Do not add a new font.

3. THE QUESTIONS SECTION IS FINE AS IS. Do not redesign it. Keep its navy hero band with the risk tag and question, the dates line, the "What counts as yes" disclosure, the "What's changed" card with the convoy photo, the "Relevant past cases" carousel, the "How likely is this?" slider, the "Why? (one line)" field with the 0/280 counter, and the Submit button — same layout, same order, same styling. The only permitted Questions changes are (a) the tab label becomes "Questions" and (b) the three inline states listed in section 08 that replace the deleted Status screen. Nothing else.

4. ONE LANGUAGE CONTROL. The EN/FR toggle in the app header (top right, next to the acaps wordmark) is the only language control in the app. It must keep working and translate everything, including all new copy in this brief (write French strings for every new English string in i18n.ts).

5. Keep the existing component vocabulary (Card, Button, Badge, SectionLabel, Chips, PrivacyPicker) and reuse it. Do not import a second design system. shadcn/ui primitives that already exist in src/components/ui may be used for sheets, dialogs, switches and selects, styled with the existing tokens.

6. Keep the backend wiring working (section 10). A screen that looks right but no longer submits to the API is a failed edit.

=====================================================================
02. APP SHELL AND HEADER NAVIGATION
=====================================================================

Keep the current shell exactly: the phone column (max-w-[420px], card-coloured header with the acaps Wordmark at left and the EN/FR LangToggle at right), the black title band underneath (Bebas title + small subtitle + the short blue bar at its bottom-left), then the horizontal tab row, then the scrolling main area.

The tab row lists exactly four sections, in this left-to-right order:
1. Profile
2. Home
3. Questions
4. Group

French labels: Profil, Accueil, Questions, Groupe.

Rules:
- Home is the default section when the app opens, even though it is second in the row.
- Keep the current tab styling: Roboto Condensed bold xs labels, selected = bg-primary text-primary-foreground rounded pill, unselected = text-muted-foreground. With only four tabs, make them share the row width evenly (flex-1, centred labels) so the row no longer scrolls horizontally. Add a small lucide icon above or left of each label only if it fits without shrinking the label below 12px: UserRound (Profile), House (Home), FileQuestion or CircleHelp (Questions), Users (Group). Same stroke width for all four.
- The Group tab stays selected while the user is in any Group sub-state (locked, comparison, revise, confirmation).
- The Questions tab shows a small count badge (bg-risk or bg-primary, white text, condensed) only when the current expert has an assigned question that is open and not yet answered. The count must come from real data, never a hard-coded "1".
- Title band text per section (title / subtitle):
  Profile — "My profile" / "Your panel settings and track record" (FR: "Mon profil" / "Vos préférences et votre historique")
  Home — "Expert panel" / "See what's changing" (FR: "Panel d'experts" / "Ce qui évolue")
  Questions — keep the current "Question" / "Share your view on a developing risk" (FR unchanged), but the title may read "Questions".
  Group — "Group view" / "How does your view compare?" (FR: "Avis du groupe" / "Comparez votre réponse")
- Switching tabs must preserve: the slider value and reason draft in Questions, the Home globe camera position and selected context, the Profile edit state, and the selected question in Group. Lift that state into PhoneApp (or a small context/store) rather than resetting it on every tab switch.
- Remove the screen codes "join", "change", "done" and "errors" from the Screen type. New type: "profile" | "home" | "questions" | "group". Group sub-states live inside the Group section (section 07).
- If the project has more than the "/" route, keep deep links working: /?tab=profile|home|questions|group may select the tab on load. Browser back should return from a Group sub-state (revise, confirmation) to the comparison view before leaving the tab.

=====================================================================
03. HOME (THE FORMER "JOIN" SECTION, NOW THE HOMEPAGE)
=====================================================================

Rename the "Join" section to "Home" everywhere (Screen type, nav label, component name Join -> Home, i18n keys may stay or be renamed consistently). It is the default landing section.

Keep, unchanged in design:
1. The hero: the camp_sahel.jpg photo full-bleed at the top, the navy gradient overlay (from-navy via-navy/60 to-transparent), the "ACAPS" highlight Badge and the Bebas title "Welcome to the ACAPS expert panel".
2. The paragraph directly under the hero: "We'll send you short questions about crises you know well. Each takes about 2 minutes, a few times a month."

Remove from Home:
- The "Language" SectionLabel and the second EN/FR LangToggle that sits directly below that paragraph. The header toggle is the only one left.
- "Your privacy" + PrivacyPicker, "Countries you know" + chips, "Topics" + chips, "How often can we ask?" + select, the "No password needed..." note and the "Join the panel" button. All of these move to Profile (section 06). None of them may appear on Home any more.

Add to Home, in this order, starting exactly where the removed profile questions used to start (immediately below the welcome paragraph):

3. A compact section header: SectionLabel "Where your view is needed" (FR "Là où votre avis compte"), followed by one muted line: "Contexts in this demo snapshot. Tap a red dot to see the risk." (FR equivalent). Keep it to one line on a 390px phone.

4. A compact filter row (Roboto Condensed chips using the existing Chips style: rounded-full, border, selected = bg-navy text-navy-foreground):
   - "All contexts" | "Following" | "My questions" (single-select).
   - A small search button (lucide Search) that opens the context search (section 05.6).
   - A small "List" toggle (lucide List / Globe2) that switches the globe to an accessible list view.
   The chip row must state what is currently shown; "My questions" shows only contexts where THIS expert has an assigned question and never exposes other experts' assignments.

5. THE GLOBE (section 05 has the full specification). It replaces the profile-question block visually, so it is the first big visual element after the welcome text.

6. A small legend and controls row under the globe: a red dot + "Monitored context", a red dot with a thin ring + "Your question", a "Reset view" text button (lucide RotateCcw), and a discreet "Demo snapshot" badge (Badge tone="muted") when the context list is demo data. Never show a "LIVE" indicator.

7. "Your next contribution" card (the earlier build prompt's NextContributionCard, restyled in this app's vocabulary): use the existing Card (white, left blue border). Contents:
   - Eyebrow (condensed, uppercase, tracking-widest, text-muted-foreground): "Your next contribution".
   - Country / risk tag in navy, e.g. "Chad · Risk R1043".
   - The question shortened to two lines (line-clamp-2), full text on the Questions screen.
   - Meta line (condensed, muted): "About 2 minutes · Answer by {response deadline} · Outcome by {event deadline}". Never merge the two dates; if no response deadline exists in the data, omit it rather than inventing one.
   - Status Badge: "Open", "Answered", "Revised" or "Closed".
   - Primary Button (existing navy Bebas style, full width, h-14): "Share your view" -> Questions tab.
   - State changes: after the expert submits, the button becomes "View group insight" -> Group tab; if the question is closed, show "This question has closed" with no primary CTA; if there is no assigned question, the card reads "You're up to date." / "We'll let you know when your perspective is needed." with no button.
   - All values come from the data hook (section 10), never hard-coded.

8. Home stays short: hero, paragraph, globe block, context sheet (when a dot is selected), next-contribution card. No news feed, no extra cards. "How your input was used" stays in Profile (06.F).

Home must render instantly: show hero, paragraph and the next-contribution card immediately while the globe module loads lazily into a fixed-size placeholder (same diameter, bg-secondary rounded-full with a subtle pulse, honouring reduced motion).

=====================================================================
04/05. THE GLOBE (DESIGN TAKEN FROM THE EARLIER MASTER PROMPT, RECOLOURED)
=====================================================================

Build exactly the globe described in the earlier build prompt (sections 06–09 there), with these colour and layout changes for this app:

05.1 Placement and size
- Inside Home, directly under the section header and filter row, where the profile questions used to be.
- Centred, full width of the content column minus padding. On a 390 x 844 phone the visual diameter is about 320–350 px; on 360 px wide phones about 300 px; never wider than the column (no horizontal scroll). The globe sits on the page's light background (#f8fafc) — do not put a black panel or star field behind it. A very soft drop shadow under the sphere (rgba of --navy at ~15%) is allowed to lift it off the page.
- The silhouette must read as a complete sphere: do not crop it with the card edges.

05.2 Appearance — DEEP BLUE GLOBE, RED DOTS
- Sphere / ocean: deep blue. Use a deep navy-blue such as #0A2A5E (define as --globe-ocean). It must read as clearly "deep blue", darker than ACAPS Dark Blue #004b78 so the land shows on top of it.
- Land: a slightly lighter deep blue such as #134A8E (--globe-land), flat-shaded polygons from a lightweight, locally bundled, properly licensed country GeoJSON/TopoJSON (e.g. Natural Earth 110m via world-atlas). No satellite textures, no remote image textures.
- Country borders: thin lines in a pale blue such as rgba(170, 205, 245, 0.45) (--globe-border).
- Atmosphere: a delicate light-blue rim (e.g. #8EC5FF at low altitude ~0.12) so the globe has dimension against the light page. No bloom, no glow halos on the page.
- A soft directional light so the sphere looks three-dimensional. Optional graticule lines at very low opacity only if they improve legibility.
- Markers: RED dots, #E0263C (--globe-marker), defined once. Markers are small (about 6–8 px visually) with a larger tap area. A context where this expert has an assigned question gets a soft translucent red halo (a wider disc, ~35% opacity) under its dot; the selected marker gets a larger halo and a slight scale-up. No pulsing (animated rings proved hard to see on the deep blue).
- Markers must only be visible on the front hemisphere; never draw far-side markers through the Earth.
- No columns, pins, arcs, labels floating across the globe, missile trails, crosshairs or military imagery.

05.3 Interaction (identical to the earlier prompt)
- One-finger drag rotates. Mouse-wheel and pinch zoom are DISABLED on the canvas (they hijack page scrolling); zoom uses two round +/- buttons (44 px, white card, navy symbol) at the bottom-right of the globe, limited to altitude 0.8–3.2 so the user can neither enter the sphere nor lose it.
- Taps are distinguished from drags. Tapping a marker selects the context, smoothly rotates it to the front (short camera transition, ~600–800 ms, instant under reduced motion) and opens the context sheet (05.5).
- Start oriented on Africa with Chad clearly visible: lat 10, lng 22, altitude 1.45 (the whole sphere visible, not cropped). Selecting a context rotates to it without changing the zoom level.
- Gesture capture is scoped to the globe canvas only. Vertical page scrolling must keep working when the finger starts outside the globe, so users can always reach the next-contribution card. Release pointer capture correctly.
- No continuous auto-rotation by default. An optional gentle intro rotation may run for at most ~4 seconds and stops on first interaction. Never rotate while a context sheet is open.
- Preserve camera position and selection when switching tabs or opening/closing the sheet.
- "Reset view" returns to the Africa/Chad starting view and clears the selection.

05.4 Data (what the dots mean)
- The context list comes from the backend: GET /public/contexts?token={expert token} (public, read-only). It is built from data/processed/ranked_risks.json (the Data Peaks pipeline ranking: priority = 0.4 x signal + 0.3 x uncertainty + 0.3 x impact) joined with the ACAPS Risk Radar risks. Per country it returns iso3, country, centre lat/lng (static lookup in backend/app/services/geo.py), up to three top risks (id, title, ACAPS risk level, priority_score) and has_question for this expert. No moderator-only data (p_materialise, score breakdown, alerts) is exposed.
- src/components/datapeaks/contexts.ts only maps that response (plus French country names) via useContexts(); there is no hard-coded country list any more.
- Dots are approximate country centres, not attack or expert locations.
- The context where this expert has an open question (Sudan, risk R1049, in the seeded demo) gets the "Your question" halo. Its ring and sheet CTA reflect the real answered / not answered / closed state from GET /q/{token}.
- The legend badge reads "Ranked by Data Peaks pipeline · {date of ranked_risks.json}".
- A country without a dot means "No monitored context in this dataset", not "no conflict". Say this once in the list view footer.
- Red colour and size never encode severity. Severity, if shown, is the published ACAPS risk level text in the sheet.
- "What's changed" shows the linked ML alert (ACAPS humanitarian access events scored by the LLM), labelled "Related reporting in {country}" with its real date. Alerts are matched to risks by country only, so never present it as proof that a trigger fired. These events have no URL; show no link.

05.5 Context sheet
- Use the existing sheet/drawer primitive (src/components/ui/sheet.tsx or drawer.tsx) as a bottom sheet with rounded top corners, white card surface, a thin top border, a drag handle and a visible close button (lucide X, 44 px target).
- Content: country (Bebas, navy), risk title, "ACAPS risk level: High" as a Badge clearly labelled as the published assessment, "Demo snapshot" or real source/freshness line, a two-line "What's changed" summary (for Chad use the real trigger_update evidence/title from the API when present, otherwise the existing demo report text, labelled as demo), and the count of this expert's open questions there.
- CTAs: primary "Share your view" -> Questions (only if this expert has an open unanswered question there); "View group insight" -> Group (only after answering); otherwise the text "No question assigned to you here." Secondary: "Follow" / "Following" toggle that really updates the Following filter state.
- Before the expert has answered a question, the sheet must not show that question's group median, range, distribution or themes, not even in aria-labels or tooltips.

05.6 Search and list view
- Search: a small sheet/dialog with an input ("Search countries"), results list (country, risk title, "Your question" state), keyboard navigation, a "No contexts match" empty state. Selecting a result focuses the globe on it and opens the same context sheet.
- List view: a fully usable non-3D alternative — a list of Cards (country, risk level badge, "Your question" state), same filters, same sheet. Used automatically when WebGL is unavailable, in low-data mode, or when the user chooses it in Profile (06.E). Show a short muted note when it is the WebGL fallback.

05.7 Technical
- Use react-globe.gl (with three) — one globe library only. Read the installed version's docs.
- Import it client-only (this is TanStack Start with SSR): lazy-load the component (React.lazy + Suspense, or a useEffect-gated dynamic import) so it never runs during server rendering. Do not touch vite.config.ts beyond what @lovable.dev/vite-tanstack-config allows; never set ssr.external.
- Keep point picking working (do not enable merged/optimised point modes that disable clicks). HTML elements or small 3D objects for markers are both fine; whichever is used must hide back-side markers.
- Cap pixel ratio at 2, pause rendering when Home is not the active tab or the page is hidden, dispose renderer resources on unmount, resume correctly when Home becomes active again.
- Respect prefers-reduced-motion and the app's own Reduced motion setting (06.E): no intro spin, no pulse, instant camera moves.
- Handle the "no WebGL" case gracefully (list view + short note), never a blank rectangle.

=====================================================================
06. PROFILE (NEW SECTION: ALL PROFILE QUESTIONS LIVE HERE)
=====================================================================

Profile must look as carefully designed as Home, using this app's existing light ACAPS style. Rebuild the current Profile to follow the earlier master prompt's Profile structure (its section 19), and move every former Join/profile question into it. Order:

06.0 Header block
- A restrained circular avatar with initials or a lucide UserRound in bg-navy text-navy-foreground (no photo upload).
- Display label in Bebas, navy, 4xl: the expert's pseudonym from the API (e.g. "Analyst A"); "Anonymous expert" when the privacy choice is anonymous.
- A subtle condensed muted descriptor: "Expert panel · {country}".
- No follower counts, no public profile, no leaderboard.

06.A Your participation (the moved Join questions)
- "Countries you know" — the existing Chips component, multi-select (Chad, Sudan, South Sudan, Niger, Mali, CAR; FR names as today). The backend stores ONE primary country; the first selected country (or an explicit "Primary" marker) is saved as that country. Other selections may be kept locally and labelled "Saved on this device" until the backend supports several.
- "Topics" — existing Chips (Conflict, Displacement, Protection, Food security, Humanitarian access). Saved as the topics list.
- "How often can we ask?" — the existing select, restyled only as needed. Map: "Only urgent questions" -> 1, "Up to 2 times a month" -> 2, "Up to once a week" -> 4 open questions at a time (max_open_questions 1–5). Show the current saved value on load.
- Optional "Pause participation" switch: only if it can be stored; otherwise omit it (do not show a dead control).
- The note "No password needed. You'll sign in through the links in our emails." stays here, under this group.

06.B Your privacy
- The existing PrivacyPicker with the three choices (Known to ACAPS / Nickname only / Fully anonymous) — keep its design. Update the copy to the accurate versions from the earlier prompt (section 20) in both languages:
  Known to ACAPS: "Authorised ACAPS moderators can associate your contributions with you. Other experts see anonymised group information."
  Nickname only: "Your contributions are displayed under a nickname. ACAPS still keeps your contact details to send you invitations."
  Fully anonymous: "Your name and nickname are not shown with your contributions. You are excluded from shared rankings."
- A "Who sees what?" text button opening a small sheet with four short rows: what other experts see, what ACAPS moderators see, what account administrators keep, what is public (only group figures, never individual answers). Never promise "nobody knows who you are".
- Note under the picker: "Changes apply to your future answers." Do not claim past answers are protected retroactively.

06.C Save action for A + B
- One primary Button "Save preferences" (FR "Enregistrer mes préférences") under sections A and B. While saving: disabled + "Saving…". On success: inline success line in text-success with a Check icon "Preferences saved" (only after the API confirms). On failure: inline text-risk message "Couldn't save. Your choices are still here — try again." and keep the user's selections.
- For a brand-new expert arriving from an invitation link (join token), the same section is the sign-up form and the button reads "Join the panel"; it calls the join endpoint. After joining, the Profile switches to the normal saved state and the app navigates to Home.

06.D Your contribution history
- List of this expert's questions as compact Cards: question (two lines), status Badge (Open / Answered / Revised / Resolved / Practice), "Your first estimate: X%", "Latest: Y%" when revised, outcome when resolved. Tapping an open/answered card routes to Questions or Group for that question.

06.E Your track record (the current track-record block, improved)
- Two stat Cards: "Questions resolved" (count from the API, not answered + 1) and "Average score (Brier)" with the mean from the API, with "Better than guessing" / "Not better than guessing" against the 0.25 baseline.
- The existing help line: "Lower is better. 0 is perfect. 0.25 is what you'd get by always answering 50%."
- Per-question rows (existing style): question text, "You: X%", "It happened / It didn't happen", "Score 0.xx — Better than guessing".
- Label practice questions clearly as "Practice" and add one muted line: "Practice scores use simulated past questions." Never call the Brier score an "accuracy percentage".
- Limited-data state: if fewer than 3 resolved questions, say "Your score becomes meaningful after a few resolved questions."

06.F How your input was used
- Keep the existing Card with the left blue border. Show it only when there is a real or explicitly simulated decision record; label demo content "Simulated example".

06.G App preferences
- "Reduced motion" switch (also respected by the globe), "Show map as list" switch (forces Home list view), and "Low-data mode" switch (skips loading the 3D globe). Stored on this device (localStorage, wrapped in try/catch).
- No language selector here — the header toggle is the only one.

=====================================================================
07. GROUP (GROUP VIEW + COMPLETED + CHANGE ANSWER COMBINED INTO ONE SECTION)
=====================================================================

Delete the separate "Completed" (done) and "Change answer" screens and the separate "Group view" tab. Build one Group section following the earlier master prompt's Group design (its sections 15–18), in this app's styling. It has four states inside the same tab:

07.1 Locked state (before the expert has answered the selected question)
- Centred block: lucide Lock in a navy circle, Bebas title "Share your view first", body "Answer independently before seeing the group's assessment.", primary Button "Go to question" -> Questions.
- Do not fetch or render any group figure in this state. The backend returns 403 here; treat 403 as "locked", never as an error banner.

07.2 Comparison state (after answering)
- Top: a compact context strip — condensed muted line "Chad · Risk R1043 · Open" and the question in two lines with a "Show full question" disclosure. If several answered questions exist, a select above it switches between them.
- Bebas heading: "How does your view compare?"
- Stat grid (reuse the current black stat tiles: rounded-md bg-foreground text-background, Bebas numbers): "Your first estimate", "Group median", and when revised a third tile "Your latest estimate". Under the grid, condensed muted: "{n} experts answered · Range {min}%–{max}%" and one explanatory line: "The median is the middle answer: half the experts gave a lower estimate, half a higher one."
- Shared 0–100 axis (redesign of the current "Range of answers"): a light track (bg-secondary), the group range as a translucent primary band from min to max, a navy tick + label "Median" at the median, and the expert's own estimate as a distinct ring marker (border-navy bg-highlight) labelled "You". When revised, show the first estimate as a hollow marker and the latest as the filled one. Labels must work without colour (text labels "You", "Median", "First").
- Distribution: the five equal bins 0–<20, 20–<40, 40–<60, 60–<80, 80–100% (20% goes in the second bin, 80% and 100% in the last). Render this block ONLY when the data layer supplies a per-bin distribution. The current expert endpoint does not send individual answers or bins, so the block is hidden today; never fake bars from hard-coded numbers.
- Themes: three lists in the current style (SectionLabel + bordered rows): "Where views align", "Where views differ", "Additional context" (map from the API themes agreement / disagreement / new_information). If all three are empty show one muted Card: "A reviewed summary is not available yet." Never invent reasons to fill empty lists.
- Small-group rule: if fewer than 5 experts have answered, hide median, range, axis, distribution and themes; show "Waiting for enough responses" + "Group insights appear once at least five experts have answered." The expert still sees their own estimate. Enforce this in the UI even if the API unexpectedly sends figures.
- Actions (stacked, full width, existing Button styles): primary "Keep my estimate" -> confirmation state; outline "Revise my estimate" -> revise state (hidden and replaced by the muted line "You've used your one revision." once revised); ghost "View context" -> Questions.
- Never pressure convergence: no copy like "you are far from the group".

07.3 Revise state (replaces the old "Change answer" screen, inside Group)
- BackBtn "Back" -> comparison. Bebas "Revise my estimate". The question text (muted). "Your first estimate: X%" in condensed. A line: "Your first answer stays on record. You can revise once."
- Reuse the existing AnswerFields component (same slider and reason field as Questions), prefilled with the expert's first estimate and EMPTY reason labelled "What changed your mind? (optional)". If the backend requires a reason and the field is left empty, send the original reason; never generate text.
- Show "Unchanged" next to the value when it equals the first estimate.
- Primary "Save revision": disabled while sending, then POST revision. On 409 (already revised) refetch and show the comparison with the one-revision note. On error, keep the values and show an inline text-risk message.

07.4 Confirmation state (replaces the old "Completed" screen, inside Group)
- Keep the current design: the round bg-primary circle with the white Check (a short scale-in, none under reduced motion), then Bebas/bold "Your estimate is recorded.", then "First estimate X%" and "Revised estimate Y%" when applicable, then "ACAPS will review the panel's input alongside other evidence." and "We'll tell you what happened after {event deadline}."
- Buttons: "View group" -> comparison, "Back to Home" -> Home tab, ghost "View my profile" -> Profile.
- Never claim the answer was sent by email, changed an official ACAPS rating, or was decisive.

The Questions Submit flow ends here: after a successful first submission the app switches to the Group tab in the comparison state (or the small-group state), exactly as today the old flow went from Question to Group view.

=====================================================================
08. REMOVE THE STATUS SECTION — PUT ITS FUNCTIONS WHERE THEY BELONG
=====================================================================

Delete the "Status" tab, the Errors component and its screen. Re-home each message as a real state driven by API responses:

1. "This link isn't working" (invalid/expired link — API 404 on the token): an app-level state. Home still renders the hero, paragraph and globe, but the next-contribution card becomes a Card with lucide Link2Off: "This link isn't working" / "It may have expired. Ask your ACAPS contact for a new link." Questions and Group show the same Card instead of their content. There is no resend endpoint: do not show "A new link is on its way" and do not offer a fake "Send me a new link" button.

2. "This question has closed" (question status closed/resolved, or API 400 "Question is closed"): in Questions, show a small notice Card with lucide Clock at the top of the existing layout and disable the slider, reason and Submit (the layout itself stays as is). In Group, the context strip shows "Closed" and the revise action is hidden. Home's card shows "This question has closed".

3. "You've already answered" (API reports answered, or 409 on submit): in Questions, show a small notice Card with lucide CircleCheck at the top: "You've already answered" / "Your answer is saved. You can see what other experts think." + Button "See the group's view" -> Group; the inputs show the recorded value read-only. On a 409 during submit, refetch and go to Group.

4. Network/API failure: a single inline Card (lucide WifiOff) with "Couldn't reach ACAPS. Your answer has not been sent yet." and a "Try again" button that retries without losing the slider value or reason. Never turn a failed request into a fake success.

These are the "necessary functions" from the old Status screen. Do not add a new tab for them.

=====================================================================
09. COPY AND I18N
=====================================================================

- Every new string in English and French in src/components/datapeaks/i18n.ts; components read from dict[lang]. Keep the existing French tone and the French percent format (pct()).
- Remove now-unused keys (language, e1C "Send me a new link", sent, status) or leave them unused but do not render them.
- Plain, calm copy: "Share your view", "What's changed", "Your first estimate", "Group median", "Revise my estimate", "Your estimate is recorded.", "Waiting for enough responses", "A reviewed summary is not available yet."

=====================================================================
10. BACKEND WIRING — KEEP IT WORKING
=====================================================================

The app is connected to the team's FastAPI backend through src/lib/api.ts and the useExpert hook. Rules:
- Do not delete, mock out or bypass src/lib/api.ts or useExpert.ts. New sections must read their data from the hook: question + risk + trigger update + similar risks (Questions, Home card, Chad sheet), group view (Group), settings (Profile A/B), track record (Profile E), and must call its actions: submitAnswer, submitRevision, saveSettings, refresh.
- Probabilities are sent as 0–1 and displayed as 0–100%. Reasons are 1–280 characters, whitespace-only is rejected.
- HTTP status handling: 403 on group = locked state; 409 on submit/revision = refetch; 404 on token = invalid link state; 400 "closed" = closed state; network error = retry state.
- The expert link token is a credential: never print it in the UI, titles, logs or analytics.
- The API base URL comes from VITE_API_URL (empty = same origin, proxied to the backend in development). Do not hard-code localhost URLs in components.
- The globe context list (section 05.4) is live data from GET /public/contexts (pipeline ranking + Risk Radar); only the expert's own question context is linked to GET /q/{token}.
- If Lovable's preview cannot reach the backend, show the network-failure state from section 08.4; do not silently replace live data with fixtures.

=====================================================================
11. RESPONSIVE, ACCESSIBILITY, MOTION
=====================================================================

- Test at 360 x 740, 390 x 844, 430 x 932, a tablet and a desktop browser (the phone column stays centred at max-w-[420px] with the current border frame on sm+ screens). No horizontal page scroll at any size; the four tabs fit without scrolling.
- Touch targets >= 44 px; visible focus rings (ring token); every icon button has an aria-label; the tab row is a proper tablist with aria-selected; the globe has an accessible list alternative and the canvas has an aria-label describing it ("Interactive globe of monitored contexts. Use the list view for a text alternative.").
- Text equivalents for the group axis and any chart (e.g. "Your estimate 75%, group median 65%, range 45% to 80%, 7 experts").
- Respect prefers-reduced-motion and the Profile Reduced motion switch everywhere (globe, sheet transitions, check animation).

=====================================================================
12. DO NOT
=====================================================================

- Do not change any colour token or font, and do not adopt the black/neon theme of the earlier prompt.
- Do not redesign the Questions section.
- Do not keep a second language toggle anywhere.
- Do not keep the Join, Completed, Change answer or Status tabs, and do not add tabs beyond Profile, Home, Questions, Group.
- Do not add a floating bottom dock — navigation stays in the header tab row.
- Do not add moderator screens, leaderboards, a news feed, chat, payments or marketing pages.
- Do not hard-code group medians, counts or bars; do not show group data before the expert answers; do not show figures below 5 responses.
- Do not claim emails, links or notifications were sent.
- Do not remove the API layer or replace live data with fixtures.

=====================================================================
13. ACCEPTANCE CHECKLIST
=====================================================================

Navigation
[ ] The header tab row shows exactly Profile, Home, Questions, Group, in that order, in both languages.
[ ] Home opens by default.
[ ] Only one EN/FR toggle exists (header), and it translates all new copy.
[ ] No Status, Completed, Change answer or Join tab remains.

Home
[ ] Hero photo, ACAPS badge, welcome title and the "We'll send you short questions…" paragraph are unchanged.
[ ] No language selector, privacy, countries, topics, frequency or join button on Home.
[ ] A deep-blue interactive globe with red dots sits where the profile questions used to be.
[ ] Drag rotates, zoom is limited, tap opens the right context sheet, back-side dots are hidden, reset works, search and list view work, no WebGL -> list.
[ ] Chad's dot and the next-contribution card reflect the real question state (open / answered / closed).

Questions
[ ] Visually identical to before apart from the tab label and the closed / already-answered / network notices.
[ ] Submitting sends to the API and opens Group.

Group
[ ] Locked before answering (403 handled), comparison after, small-group state below 5.
[ ] Median, range and count come from the API; distribution hidden unless bins are supplied.
[ ] Revise works once, keeps the first estimate, and the confirmation shows first and revised values.
[ ] Themes or "A reviewed summary is not available yet."

Profile
[ ] All former Join questions (privacy, countries, topics, frequency) are here with the earlier prompt's Profile structure.
[ ] Saved values load from and save to the API; success only shown after the API confirms.
[ ] Track record uses the API's resolved count and mean Brier; practice labelled.
[ ] App preferences (reduced motion, list view, low data) work.

Colour and type
[ ] src/styles.css :root tokens are unchanged; only --globe-* variables were added.
[ ] Bebas Neue, Roboto and Roboto Condensed are still the only fonts.

END EDIT PROMPT

SHORT KICKOFF MESSAGE IF YOU ATTACH THIS FILE INSTEAD OF PASTING IT

Apply the attached edit brief to this existing project. Keep the current ACAPS colours and fonts exactly. Make the header navigation exactly Profile, Home, Questions, Group, with Home as the default. Turn Join into Home, remove its second language selector and move all profile questions into a new Profile section designed like the attached earlier master prompt's Profile. Add the earlier prompt's interactive globe on Home where the profile questions were, coloured deep blue with red dots. Leave Questions as is. Merge Group view, Change answer and Completed into one Group section designed like the earlier prompt's Group. Delete the Status section and re-home its messages as real states. Keep src/lib/api.ts and the useExpert hook wired to the backend.
