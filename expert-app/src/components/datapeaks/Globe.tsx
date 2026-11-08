/**
 * Interactive 3D globe (react-globe.gl + three). Client-only: import it lazily (see GlobeBlock in PhoneApp).
 * Deep-blue Earth with red context markers. Colours come from the --globe-* variables in styles.css.
 * Pressing a dot zooms in on that country and shows its neighbourhood: the country in red, countries sharing
 * a border in a lighter tint, two borders away fainter, and rings pulsing out to ~1,000 km (left out if the
 * expert asked for reduced motion). Geography only, not a modelled spillover.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { MeshPhongMaterial, Color } from "three";
import { feature, neighbors } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { START_VIEW, type ConflictContext } from "./contexts";

const cssVar = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** ISO3 (from the API) → ISO numeric (world-atlas feature ids) for the monitored contexts. */
const ISO_NUMERIC: Record<string, string> = {
  AFG: "004", CMR: "120", COL: "170", ETH: "231", IDN: "360", KEN: "404", MDG: "450", MLI: "466", MMR: "104",
  MOZ: "508", NER: "562", NGA: "566", PHL: "608", PSE: "275", SDN: "729", SSD: "728", SYR: "760", TCD: "148", YEM: "887",
};
/** How far the rings reach, in degrees of arc (about 1,000 km). */
const RING_REACH_DEG = 9;
/** Altitude the camera zooms to when a dot is pressed (START_VIEW is 1.45). */
const FOCUS_ALTITUDE = 0.95;

type Zone = 0 | 1 | 2; // the country itself, shares a border, two borders away

export interface GlobeProps {
  size: number;
  contexts: ConflictContext[];
  assignedIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  resetSignal: number;
  /** n increments on each press; dir 1 = zoom in, -1 = zoom out. */
  zoomSignal: { n: number; dir: 1 | -1 };
  reducedMotion: boolean;
  active: boolean;
}

export default function Globe({ size, contexts, assignedIds, selectedId, onSelect, resetSignal, zoomSignal, reducedMotion, active }: GlobeProps) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const colors = useMemo(
    () => ({
      ocean: cssVar("--globe-ocean", "#0A2A5E"),
      land: cssVar("--globe-land", "#134A8E"),
      border: cssVar("--globe-border", "rgba(170, 205, 245, 0.45)"),
      atmosphere: cssVar("--globe-atmosphere", "#8EC5FF"),
      marker: cssVar("--globe-marker", "#E0263C"),
    }),
    [],
  );

  const { land, adjacency } = useMemo(() => {
    const topo = countries110m as unknown as Topology<{ countries: GeometryCollection }>;
    const features = (feature(topo, topo.objects.countries) as unknown as { features: { id?: string; properties: { name: string } }[] }).features;
    return { land: features, adjacency: neighbors(topo.objects.countries.geometries) };
  }, []);

  // Country, neighbours and second ring of the pressed dot, keyed by feature object
  const selected = contexts.find((x) => x.id === selectedId) ?? null;
  const zones = useMemo(() => {
    const out = new Map<object, Zone>();
    if (!selected) return out;
    const num = ISO_NUMERIC[selected.iso];
    const start = land.findIndex((f) => (num && f.id === num) || f.properties.name.toLowerCase() === selected.name.en.toLowerCase());
    if (start < 0) return out;
    const ring1 = new Set((adjacency[start] ?? []).filter((i) => i !== start));
    const ring2 = new Set<number>();
    for (const i of ring1) for (const j of adjacency[i] ?? []) if (j !== start && !ring1.has(j)) ring2.add(j);
    out.set(land[start]!, 0);
    for (const i of ring1) out.set(land[i]!, 1);
    for (const i of ring2) out.set(land[i]!, 2);
    return out;
  }, [selected, land, adjacency]);

  // Same array while the selection holds, so re-renders don't restart the ring animation
  const rings = useMemo(
    () => (selected && !reducedMotion ? [{ lat: selected.lat, lng: selected.lng }] : []),
    [selected, reducedMotion],
  );

  // Zone colours: the marker red blended into the land blue, strongest at the country itself
  const zoneColors = useMemo(() => {
    const mix = (t: number) => "#" + new Color(colors.land).lerp(new Color(colors.marker), t).getHexString();
    return [mix(0.62), mix(0.36), mix(0.16)] as const;
  }, [colors.land, colors.marker]);

  const material = useMemo(
    () => new MeshPhongMaterial({ color: new Color(colors.ocean), shininess: 8, specular: new Color("#1d3f7a") }),
    [colors.ocean],
  );

  // Initial camera, zoom limits, no auto-rotation.
  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    const c = g.controls() as { enableZoom: boolean; minDistance: number; maxDistance: number; autoRotate: boolean; enablePan: boolean };
    // Wheel/pinch zoom is off so the page keeps scrolling over the globe; use the +/- buttons.
    c.enableZoom = false;
    c.enablePan = false;
    c.minDistance = 170;
    c.maxDistance = 480;
    c.autoRotate = false;
    g.pointOfView(START_VIEW, 0);
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }, [ready]);

  // Reset view.
  useEffect(() => {
    if (ready && resetSignal > 0) ref.current?.pointOfView(START_VIEW, reducedMotion ? 0 : 700);
  }, [resetSignal, ready, reducedMotion]);

  // Bring the selected context to the front.
  useEffect(() => {
    if (!ready || !selectedId) return;
    const c = contexts.find((x) => x.id === selectedId);
    // Zoom in on the region (never out, if the expert is already closer)
    const alt = Math.min(ref.current?.pointOfView().altitude ?? START_VIEW.altitude, FOCUS_ALTITUDE);
    if (c) ref.current?.pointOfView({ lat: c.lat, lng: c.lng, altitude: alt }, reducedMotion ? 0 : 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  // +/- zoom buttons, limited so the globe can't be entered or lost.
  useEffect(() => {
    const g = ref.current;
    if (!ready || !g || zoomSignal.n === 0) return;
    const pov = g.pointOfView();
    const altitude = Math.min(3.2, Math.max(0.8, pov.altitude * (zoomSignal.dir > 0 ? 0.8 : 1.25)));
    g.pointOfView({ ...pov, altitude }, reducedMotion ? 0 : 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomSignal, ready]);

  // Stop rendering when Home is not visible.
  useEffect(() => {
    if (!ready) return;
    if (active) ref.current?.resumeAnimation();
    else ref.current?.pauseAnimation();
  }, [active, ready]);

  // A context with a question for this expert gets a soft red halo (a wider, translucent disc under its dot).
  type Pt = ConflictContext & { halo?: boolean };
  const points: Pt[] = [
    ...contexts.filter((c) => assignedIds.includes(c.id) || c.id === selectedId).map((c) => ({ ...c, halo: true })),
    ...contexts,
  ];

  return (
    <GlobeGL
      ref={ref}
      width={size}
      height={size}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={material}
      showAtmosphere
      atmosphereColor={colors.atmosphere}
      atmosphereAltitude={0.12}
      polygonsData={land}
      polygonCapColor={(d) => { const z = zones.get(d as object); return z === undefined ? colors.land : zoneColors[z]; }}
      polygonSideColor={(d) => { const z = zones.get(d as object); return z === undefined ? colors.land : zoneColors[z]; }}
      polygonStrokeColor={() => colors.border}
      polygonAltitude={(d) => { const z = zones.get(d as object); return z === 0 ? 0.014 : z === 1 ? 0.008 : 0.004; }}
      polygonsTransitionDuration={reducedMotion ? 0 : 400}
      ringsData={rings}
      ringColor={() => (t: number) => `rgba(255, 92, 110, ${Math.max(0, 1 - t)})`}
      ringMaxRadius={RING_REACH_DEG}
      ringAltitude={0.016}
      ringPropagationSpeed={5}
      ringRepeatPeriod={700}
      ringResolution={96}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d) => ((d as Pt).halo ? "rgba(224, 38, 60, 0.35)" : colors.marker)}
      pointAltitude={(d) => ((d as Pt).halo ? 0.008 : (d as Pt).id === selectedId ? 0.035 : 0.02)}
      pointRadius={(d) => ((d as Pt).halo ? ((d as Pt).id === selectedId ? 2.6 : 2.1) : (d as Pt).id === selectedId ? 1.5 : 1.1)}
      pointResolution={16}
      pointsMerge={false}
      pointsTransitionDuration={reducedMotion ? 0 : 250}
      pointLabel={(d) => (d as ConflictContext).name.en}
      onPointClick={(d) => onSelect((d as ConflictContext).id)}
      onGlobeReady={() => setTimeout(() => setReady(true), 0)}
    />
  );
}
