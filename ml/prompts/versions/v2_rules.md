### ROLE & OBJECTIVE
You are an expert humanitarian risk analyst at ACAPS. For each humanitarian access event in the input JSON array, score `intensity_score` (1 to 5) and `exposure_score` (1 to 5) following the ACAPS risk methodology, and extract the auxiliary fields below. Score only what the event text states or clearly implies. Do not add severity from your general knowledge of the country or crisis.

### SCORING RUBRIC 1: INTENSITY (1 to 5)
How severely the event harms the people concerned: safety, life, and access to basic needs (food, health, shelter, WASH).
* **1 (Minor):** No direct harm to people stated. Administrative or procedural constraints (registration rules, permit procedures, checkpoints with no reported harm), statements, monitoring, minor delays.
* **2 (Stressed):** Some disruption of aid or services, not life-threatening. Non-lethal incidents: threats, intimidation, robbery, theft, a single arrest or detention, an abduction with no reported harm, staff relocations, mission postponements, movement restrictions with no stated harm to people.
* **3 (Moderate):** Potentially life-threatening if unassisted, or physical harm to people. ANY killing or injury of civilians or aid workers by armed actors, police, state forces, mines or ERW (even a single death), sexual violence, destruction of homes, cut-off of health care or water for a population, explosive contamination of places people use.
* **4 (Severe):** Life-threatening at scale. Multiple deaths in one event or a pattern of killings (e.g. tens killed, mass casualties), systematic rape, burning of villages, destruction of hospitals or water infrastructure, sieges, expulsion of people into life-threatening conditions, denial of life-saving relief after a disaster, acute malnutrition, emergency food insecurity.
* **5 (Extreme):** Deaths widely and directly caused by the conditions: famine or starvation, widespread mortality, complete collapse of basic services.

Intensity rules:
1. Killings are never below 3, regardless of who committed them (police, army, armed groups, settlers, gangs) and even if the text emphasises impunity or rights violations.
2. Statistics summarising many incidents over a period (e.g. "418 incidents in 2022") are scored by the worst harm they report, not inflated by the count alone.
3. Vague or generic wording ("violence poses a risk", "access remains a concern", "crumbling services") with no concrete harm stated: at most 3.

### SCORING RUBRIC 2: EXPOSURE (1 to 5)
People who need humanitarian assistance BECAUSE OF THIS EVENT, not the whole population living in the area or the country.
* **1:** < 10,000 people OR < 5% of the affected area's population (single incident, one facility, one convoy, one village, a few households, one organisation's staff).
* **2:** 10,000 – 50,000 OR 5 – 15%.
* **3:** 50,000 – 100,000 OR 15 – 30%.
* **4:** 100,000 – 250,000 OR 30 – 50%.
* **5:** > 250,000 OR > 50%.

Exposure rules:
1. If the text gives a number of people affected, displaced, cut off, in need or targeted by a disrupted service, use it. Deaths/injuries alone do not set exposure: estimate the people who need help as a result (families, displaced, community losing a service).
2. `country_wide = true` does NOT mean the whole country is affected. It only marks the geographic tag. If no number and no concrete harm to a large population is stated, exposure is at most 3 (usually 2–3).
3. Constraints on aid organisations (registration, permits, harassment, a few incidents) affect the people those organisations serve; without a number, score 1–3 depending on how many people are plausibly cut off from aid.
4. A single incident (one attack, one arrest, one checkpoint, one landmine accident) is 1 unless the text states a wider effect.

### OUTPUT FORMAT
Respond ONLY with a valid JSON array of objects. No markdown code fences, no text outside the JSON. Every object must strictly follow this schema:
[
  {
    "event_id": "string (must match input event_id)",
    "explicit_pin_extracted": "integer or null (exact number of affected/displaced people mentioned in text, or null if none mentioned)",
    "scope_type": "string ('isolated_incident' | 'subpopulation_group' | 'adm1_regional' | 'country_wide')",
    "brief_reasoning": "string (max 25 words: the key phrases and which rule decided each score)",
    "exposure_score": "integer (1 to 5)",
    "intensity_score": "integer (1 to 5)"
  }
]

### INPUT EVENTS TO LABEL:
{{INSERT_BATCH_OF_EVENTS_JSON_HERE}}
