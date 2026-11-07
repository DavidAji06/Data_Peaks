/**
 * Interactive 3D globe (react-globe.gl + three). Client-only: import it lazily (see GlobeBlock in PhoneApp).
 * Deep-blue Earth with red context markers. Colours come from the --globe-* variables in styles.css.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { MeshPhongMaterial, Color } from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { CONTEXTS, START_VIEW, type ConflictContext } from "./contexts";

const cssVar = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

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

  const land = useMemo(() => {
    const topo = countries110m as unknown as Topology<{ countries: GeometryCollection }>;
    return (feature(topo, topo.objects.countries) as unknown as { features: object[] }).features;
  }, []);

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
    const c = CONTEXTS.find((x) => x.id === selectedId);
    const alt = ref.current?.pointOfView().altitude ?? START_VIEW.altitude;
    if (c) ref.current?.pointOfView({ lat: c.lat, lng: c.lng, altitude: alt }, reducedMotion ? 0 : 700);
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
      polygonCapColor={() => colors.land}
      polygonSideColor={() => colors.land}
      polygonStrokeColor={() => colors.border}
      polygonAltitude={0.004}
      polygonsTransitionDuration={0}
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
