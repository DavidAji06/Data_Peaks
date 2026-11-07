/**
 * Monitored contexts shown as red dots on the Home globe.
 * Loaded from GET /public/contexts: countries with active risks ranked by the Data Peaks pipeline
 * (data/processed/ranked_risks.json joined with the ACAPS Risk Radar). Dots sit at approximate
 * country centres, not at event locations.
 */
import { useEffect, useState } from "react";
import { api, type ApiContext } from "@/lib/api";

export interface ContextRisk {
  id: string;
  title: string;
  riskLevel: string;
  priority: number | null;
}

export interface ConflictContext {
  id: string;
  name: { en: string; fr: string };
  iso: string;
  lat: number;
  lng: number;
  /** Highest-priority risk in this country. */
  riskTitle: string;
  riskLevel: string;
  /** Up to three ranked risks, highest priority first. */
  risks: ContextRisk[];
  /** True when the expert behind this link has an open question here. */
  hasQuestion: boolean;
}

// French country names for the UI only; the data comes from the backend.
const FR: Record<string, string> = {
  AFG: "Afghanistan", CMR: "Cameroun", COL: "Colombie", ETH: "Éthiopie", IDN: "Indonésie",
  KEN: "Kenya", MDG: "Madagascar", MLI: "Mali", MMR: "Myanmar", MOZ: "Mozambique",
  NER: "Niger", NGA: "Nigeria", PHL: "Philippines", PSE: "Palestine", SDN: "Soudan",
  SSD: "Soudan du Sud", SYR: "Syrie", TCD: "Tchad", YEM: "Yémen",
};

function toContext(c: ApiContext): ConflictContext {
  const risks = c.risks.map((r) => ({ id: r.id, title: r.title, riskLevel: r.risk_level ?? "—", priority: r.priority_score }));
  return {
    id: c.iso3.toLowerCase(),
    name: { en: c.country, fr: FR[c.iso3] ?? c.country },
    iso: c.iso3,
    lat: c.lat,
    lng: c.lng,
    riskTitle: risks[0]?.title ?? "",
    riskLevel: risks[0]?.riskLevel ?? "—",
    risks,
    hasQuestion: c.has_question,
  };
}

/** Fetches the globe contexts once. `rankedAt` is the date of the ranking file. */
export function useContexts(token: string | null) {
  const [contexts, setContexts] = useState<ConflictContext[]>([]);
  const [rankedAt, setRankedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getContexts(token)
      .then((res) => {
        if (cancelled) return;
        setContexts(res.contexts.map(toContext));
        setRankedAt(res.ranked_at);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { contexts, rankedAt, failed };
}

export const START_VIEW = { lat: 10, lng: 22, altitude: 1.45 };
