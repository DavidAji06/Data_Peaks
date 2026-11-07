/**
 * Monitored contexts shown as red dots on the Home globe.
 * DEMO SNAPSHOT: illustrative context centres, not attack locations and not a complete conflict inventory.
 * Only Chad (R1043) is linked to the live question from the backend (GET /q/{token}).
 */
export interface ConflictContext {
  id: string;
  name: { en: string; fr: string };
  iso: string;
  lat: number;
  lng: number;
  riskTitle: string;
  riskLevel: string;
  /** Risk id of the live backend question this context belongs to, if any. */
  liveRiskId?: string;
  isDemo: true;
}

export const CONTEXTS: ConflictContext[] = [
  { id: "chad", name: { en: "Chad", fr: "Tchad" }, iso: "TCD", lat: 15.45, lng: 18.73, riskTitle: "Escalating cross-border insecurity linked to the Sudan conflict increases protection risks and humanitarian needs in eastern Chad", riskLevel: "High", liveRiskId: "R1043", isDemo: true },
  { id: "sudan", name: { en: "Sudan", fr: "Soudan" }, iso: "SDN", lat: 12.86, lng: 30.22, riskTitle: "Conflict spreads to new states, increasing displacement and access constraints", riskLevel: "High", isDemo: true },
  { id: "south-sudan", name: { en: "South Sudan", fr: "Soudan du Sud" }, iso: "SSD", lat: 6.88, lng: 31.31, riskTitle: "Renewed subnational violence disrupts aid delivery during the lean season", riskLevel: "Medium", isDemo: true },
  { id: "drc", name: { en: "DR Congo", fr: "RD Congo" }, iso: "COD", lat: -4.04, lng: 21.76, riskTitle: "Armed group offensives in the east trigger new displacement", riskLevel: "High", isDemo: true },
  { id: "somalia", name: { en: "Somalia", fr: "Somalie" }, iso: "SOM", lat: 5.15, lng: 46.2, riskTitle: "Drought and conflict combine to raise displacement above seasonal levels", riskLevel: "Medium", isDemo: true },
  { id: "yemen", name: { en: "Yemen", fr: "Yémen" }, iso: "YEM", lat: 15.55, lng: 48.52, riskTitle: "Frontline escalation worsens food insecurity and access", riskLevel: "Medium", isDemo: true },
  { id: "myanmar", name: { en: "Myanmar", fr: "Myanmar" }, iso: "MMR", lat: 21.92, lng: 95.96, riskTitle: "Intensified fighting increases protection needs and displacement", riskLevel: "High", isDemo: true },
  { id: "ukraine", name: { en: "Ukraine", fr: "Ukraine" }, iso: "UKR", lat: 48.38, lng: 31.17, riskTitle: "Attacks on energy infrastructure increase winter humanitarian needs", riskLevel: "High", isDemo: true },
];

export const START_VIEW = { lat: 10, lng: 22, altitude: 1.45 };
