/**
 * A contextual icon for what a risk, alert or trigger is about (strikes, conflict, food, flood…), picked from
 * keywords in its own text. Decorative help for scanning: the label is in the tooltip and for screen readers,
 * and the text it came from is always shown next to it. Server-safe (no hooks).
 */
import {
  Ban,
  Biohazard,
  Bomb,
  Flame,
  Footprints,
  PackageX,
  ShieldAlert,
  Sun,
  Swords,
  TriangleAlert,
  Waves,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';

interface Hazard {
  label: string;
  Icon: LucideIcon;
  words: RegExp;
}

// Order breaks ties between hazards named at the same spot: most specific first
const HAZARDS: Hazard[] = [
  { label: 'Strikes and bombing', Icon: Bomb, words: /\b(drones?|air ?strikes?|strikes|bomb\w*|shell\w*|missiles?|explosi\w*)\b/ },
  { label: 'Infrastructure damage', Icon: Zap, words: /\b(dam|power grid|electricity)\b/ },
  { label: 'Armed conflict', Icon: Swords, words: /\b(attacks?|clash\w*|armed|violence|offensive|fighting|military|siege|insurgen\w*|(?<!food )insecurity|war|hostilities|militia\w*|mutiny|conflict)\b/ },
  { label: 'Drought', Icon: Sun, words: /\b(drought|dry|below-average|el ni.o|heatwaves?|water shortages?)\b/ },
  { label: 'Flooding', Icon: Waves, words: /\b(flood\w*|heavy rain\w*|rainfall|rains|cyclone\w*|storm\w*)\b/ },
  { label: 'Fire and haze', Icon: Flame, words: /\b(fires?|haze|wildfire\w*)\b/ },
  { label: 'Food insecurity', Icon: Wheat, words: /\b(famine|food|malnutrition|hunger|ipc|crop\w*|harvest\w*|livelihood\w*)\b/ },
  { label: 'Disease outbreak', Icon: Biohazard, words: /\b(cholera|outbreak\w*|epidemic\w*|disease\w*|measles)\b/ },
  { label: 'Displacement', Icon: Footprints, words: /\b(displac\w*|returns?|returnees?|refugees?|idps?|deport\w*|evictions?|demolitions?)\b/ },
  { label: 'Shortages', Icon: PackageX, words: /\b(shortages?|fuel|prices?|markets?|trade|imports?|supply|resources)\b/ },
  { label: 'Access constraints', Icon: Ban, words: /\b(access|blockades?|checkpoints?|restrict\w*|closures?)\b/ },
  { label: 'Protection risks', Icon: ShieldAlert, words: /\b(protection|abduct\w*|persecution|detention)\b/ },
];
const GENERAL: Omit<Hazard, 'words'> = { label: 'Humanitarian risk', Icon: TriangleAlert };

/** The hazard whose keyword appears first in the text (the lead topic); ties go to the more specific one. */
export function hazardOf(...texts: (string | null | undefined)[]): Omit<Hazard, 'words'> {
  const text = texts.filter(Boolean).join(' ').toLowerCase();
  let best: Hazard | null = null;
  let bestAt = Infinity;
  for (const h of HAZARDS) {
    const at = text.search(h.words);
    if (at >= 0 && at < bestAt) {
      best = h;
      bestAt = at;
    }
  }
  return best ?? GENERAL;
}

/** Round soft-blue badge, sized for a card's top-right corner. */
export function HazardBadge({ text, className = '' }: { text: (string | null | undefined)[]; className?: string }) {
  const { label, Icon } = hazardOf(...text);
  return (
    <span title={label} className={`hazard-badge ${className}`}>
      <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Small inline icon, e.g. next to a trigger title. */
export function HazardInline({ text }: { text: (string | null | undefined)[] }) {
  const { label, Icon } = hazardOf(...text);
  return (
    <span title={label} className="hazard-inline">
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
