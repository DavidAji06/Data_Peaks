'use client';

/**
 * The expert app's 3D globe (react-globe.gl + three) for the moderator map. Client-only: loaded with
 * next/dynamic in RiskMap. Same look and behaviour as expert-app/src/components/datapeaks/Globe.tsx:
 * deep-blue Earth, dots coloured by ACAPS impact, and pressing a dot zooms in and shows the neighbourhood
 * (the country, countries sharing a border, two borders away, rings out to ~1,000 km). Geography only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import GlobeGL, { type GlobeMethods } from 'react-globe.gl';
import { Color, MeshPhongMaterial } from 'three';
import { feature, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import type { MapContext } from '@/lib/types';
import { getImpactColor } from './RegionMap';

export const START_VIEW = { lat: 10, lng: 22, altitude: 1.45 };

const COLOURS = { ocean: '#0A2A5E', land: '#134A8E', border: 'rgba(170, 205, 245, 0.45)', atmosphere: '#8EC5FF' };

/** ISO3 (from the API) → ISO numeric (world-atlas feature ids) for the monitored contexts. */
const ISO_NUMERIC: Record<string, string> = {
  AFG: '004', CMR: '120', COL: '170', ETH: '231', IDN: '360', KEN: '404', MDG: '450', MLI: '466', MMR: '104',
  MOZ: '508', NER: '562', NGA: '566', PHL: '608', PSE: '275', SDN: '729', SSD: '728', SYR: '760', TCD: '148', YEM: '887',
};
const RING_REACH_DEG = 9; // about 1,000 km
const FOCUS_ALTITUDE = 0.95;

type Zone = 0 | 1 | 2;

const rgba = (hex: string, a: number) => {
  const c = new Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
};

export interface ModGlobeProps {
  size: number;
  contexts: MapContext[];
  selectedIso: string | null;
  onSelect: (iso: string) => void;
  resetSignal: number;
  zoomSignal: { n: number; dir: 1 | -1 };
  reducedMotion: boolean;
}

export default function ModGlobe({ size, contexts, selectedIso, onSelect, resetSignal, zoomSignal, reducedMotion }: ModGlobeProps) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const { land, adjacency } = useMemo(() => {
    const topo = countries110m as unknown as Topology<{ countries: GeometryCollection }>;
    const features = (feature(topo, topo.objects.countries) as unknown as { features: { id?: string; properties: { name: string } }[] }).features;
    return { land: features, adjacency: neighbors(topo.objects.countries.geometries as never) as number[][] };
  }, []);

  const selected = contexts.find((c) => c.iso === selectedIso) ?? null;
  const zones = useMemo(() => {
    const out = new Map<object, Zone>();
    if (!selected) return out;
    const num = ISO_NUMERIC[selected.iso];
    const start = land.findIndex((f) => (num && f.id === num) || f.properties.name.toLowerCase() === selected.name.toLowerCase());
    if (start < 0) return out;
    const ring1 = new Set((adjacency[start] ?? []).filter((i) => i !== start));
    const ring2 = new Set<number>();
    for (const i of ring1) for (const j of adjacency[i] ?? []) if (j !== start && !ring1.has(j)) ring2.add(j);
    out.set(land[start]!, 0);
    for (const i of ring1) out.set(land[i]!, 1);
    for (const i of ring2) out.set(land[i]!, 2);
    return out;
  }, [selected, land, adjacency]);

  const rings = useMemo(() => (selected && !reducedMotion ? [{ lat: selected.lat, lng: selected.lng }] : []), [selected, reducedMotion]);

  // Neighbourhood tint: the selected country's impact colour blended into the land blue
  const selectedColour = getImpactColor(selected?.impactScore);
  const zoneColours = useMemo(() => {
    const mix = (t: number) => '#' + new Color(COLOURS.land).lerp(new Color(selectedColour), t).getHexString();
    return [mix(0.62), mix(0.36), mix(0.16)] as const;
  }, [selectedColour]);

  const material = useMemo(() => new MeshPhongMaterial({ color: new Color(COLOURS.ocean), shininess: 8, specular: new Color('#1d3f7a') }), []);

  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    const c = g.controls() as { enableZoom: boolean; enablePan: boolean; minDistance: number; maxDistance: number; autoRotate: boolean };
    c.enableZoom = false; // wheel keeps scrolling the page; use the +/- buttons
    c.enablePan = false;
    c.minDistance = 170;
    c.maxDistance = 480;
    c.autoRotate = false;
    g.pointOfView(START_VIEW, 0);
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }, [ready]);

  useEffect(() => {
    if (ready && resetSignal > 0) ref.current?.pointOfView(START_VIEW, reducedMotion ? 0 : 700);
  }, [resetSignal, ready, reducedMotion]);

  useEffect(() => {
    if (!ready || !selected) return;
    const alt = Math.min(ref.current?.pointOfView().altitude ?? START_VIEW.altitude, FOCUS_ALTITUDE);
    ref.current?.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: alt }, reducedMotion ? 0 : 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIso, ready]);

  useEffect(() => {
    const g = ref.current;
    if (!ready || !g || zoomSignal.n === 0) return;
    const pov = g.pointOfView();
    const altitude = Math.min(3.2, Math.max(0.8, pov.altitude * (zoomSignal.dir > 0 ? 0.8 : 1.25)));
    g.pointOfView({ ...pov, altitude }, reducedMotion ? 0 : 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomSignal, ready]);

  // The selected dot gets a soft halo in its own colour
  type Pt = MapContext & { halo?: boolean };
  const points: Pt[] = [...(selected ? [{ ...selected, halo: true }] : []), ...contexts];

  return (
    <GlobeGL
      ref={ref}
      width={size}
      height={size}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={material}
      showAtmosphere
      atmosphereColor={COLOURS.atmosphere}
      atmosphereAltitude={0.12}
      polygonsData={land}
      polygonCapColor={(d) => { const z = zones.get(d as object); return z === undefined ? COLOURS.land : zoneColours[z]; }}
      polygonSideColor={(d) => { const z = zones.get(d as object); return z === undefined ? COLOURS.land : zoneColours[z]; }}
      polygonStrokeColor={() => COLOURS.border}
      polygonAltitude={(d) => { const z = zones.get(d as object); return z === 0 ? 0.014 : z === 1 ? 0.008 : 0.004; }}
      polygonsTransitionDuration={reducedMotion ? 0 : 400}
      ringsData={rings}
      ringColor={() => (t: number) => rgba(selectedColour, Math.max(0, 1 - t))}
      ringMaxRadius={RING_REACH_DEG}
      ringAltitude={0.016}
      ringPropagationSpeed={5}
      ringRepeatPeriod={700}
      ringResolution={96}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d) => { const p = d as Pt; const c = getImpactColor(p.impactScore); return p.halo ? rgba(c, 0.4) : c; }}
      pointAltitude={(d) => ((d as Pt).halo ? 0.008 : (d as Pt).iso === selectedIso ? 0.035 : 0.02)}
      pointRadius={(d) => ((d as Pt).halo ? 2.6 : (d as Pt).iso === selectedIso ? 1.5 : 1.1)}
      pointResolution={16}
      pointsMerge={false}
      pointsTransitionDuration={reducedMotion ? 0 : 250}
      pointLabel={(d) => { const c = d as MapContext; return `${c.name} (Impact ${c.impactScore ?? '—'}/5)`; }}
      onPointClick={(d) => onSelect((d as MapContext).iso)}
      onGlobeReady={() => setTimeout(() => setReady(true), 0)}
    />
  );
}
