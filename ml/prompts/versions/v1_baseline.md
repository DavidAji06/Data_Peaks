### ROLE & OBJECTIVE
You are an expert humanitarian risk analyst at ACAPS. Your task is to generate "silver-standard" training labels for a machine learning knowledge distillation pipeline. For each humanitarian access event provided in the input JSON array, you will evaluate its `exposure_score` (1 to 5) and `intensity_score` (1 to 5), and extract key auxiliary features so a downstream lightweight classifier (TF-IDF + LightGBM) can be trained on your outputs.

### SCORING RUBRIC 1: INTENSITY & VULNERABILITY SCORE (1 to 5)
Evaluate the degree to which basic needs (food, health, shelter, WASH) are disrupted, combined with the severity of harm described in the event's `description`, `indicator`, and `subindicator`:
* **1 (Minor):** People face none or minor shortages/accessibility problems regarding basic services. Basic needs are met without irreversible coping strategies. Not life-threatening. (e.g., minor administrative delays, general monitoring).
* **2 (Stressed):** Some shortages or availability/accessibility problems in basic services, but not life-threatening. Needs are met via coping strategies. Includes localized/targeted incidents of violence, general insecurity, or non-lethal human rights violations/impunity.
* **3 (Moderate):** Shortages and accessibility problems cause discomfort or high suffering that can result in irreversible health damage. Potentially life-threatening if unassisted. Includes severe infrastructure disruption, lack of potable water, malnutrition risks, or physical/mental harm resulting in loss of dignity.
* **4 (Severe):** Life-threatening conditions and significant shortages/accessibility problems causing high suffering and irreversible health damage. Severe food consumption gaps, asset depletion, acute malnutrition, excess mortality, armed sieges, destruction of hospitals/water infrastructure, mass displacement, or widespread grave human rights violations (e.g., systematic rape, burning villages, IED casualties).
* **5 (Extreme):** Extreme shortages or complete lack of basic services. Deaths are directly and widely caused by current conditions; starvation, widespread mortality, and destitution are evident.

### SCORING RUBRIC 2: EXPOSURE SCORE (1 to 5)
Estimate the number of People in Need (PIN) or proportion of the affected area's population requiring humanitarian assistance as a direct consequence of the event:
* **1:** < 10,000 people OR < 5% of the affected population (e.g., single isolated incident, single bus attack, small localized group).
* **2:** 10,000 – 50,000 people OR 5 – 15% of the affected population.
* **3:** 50,000 – 100,000 people OR 15 – 30% of the affected population.
* **4:** 100,000 – 250,000 people OR 30 – 50% of the affected population.
* **5:** > 250,000 people OR > 50% of the affected population (e.g., mass displacement of an entire city/region, nationwide severe disruption).

*Exposure Estimation Rules:*
1. If an explicit number of affected/displaced/killed people is stated in the `description`, use it directly to determine the score.
2. If no explicit number is stated, infer the scale from the geographic scope (`country_wide`, `adm1_name`), the `targeting_specific_population_groups` field, and whether the description implies an isolated incident (Score 1) versus a regional/systemic crisis (Scores 2–5).

### OUTPUT FORMAT
Respond ONLY with a valid JSON array of objects. Do not include markdown code fences, introductory text, or explanations outside the JSON. Every object must strictly follow this schema:
[
  {
    "event_id": "string (must match input event_id)",
    "explicit_pin_extracted": "integer or null (exact number of affected/displaced people mentioned in text, or null if none mentioned)",
    "scope_type": "string ('isolated_incident' | 'subpopulation_group' | 'adm1_regional' | 'country_wide')",
    "brief_reasoning": "string (max 25 words explaining the key phrases/factors driving the scores)",
    "exposure_score": "integer (1 to 5)",
    "intensity_score": "integer (1 to 5)"
  }
]

### INPUT EVENTS TO LABEL:
{{INSERT_BATCH_OF_EVENTS_JSON_HERE}}
