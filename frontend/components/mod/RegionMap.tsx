'use client';

/**
 * 2D map of an alert's or risk's country (or countries) with its spillover zone: countries sharing a border,
 * countries two borders away, and distance rings from the centre of the affected area.
 * Offline: Natural Earth 1:110m boundaries from world-atlas, drawn as SVG with d3-geo. No tiles, no API key.
 * Geography only, never a modelled probability (the caption says so).
 */
import { geoCentroid, geoCircle, geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { feature, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import { mod } from '@/lib/i18n/mod';
import { findPlaces } from '@/lib/places';

const t = mod.regionMap;

type Country = Feature<Geometry, { name: string }>;

const topo = countries110m as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const FEATURES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as Country[];
const NEIGHBOURS = neighbors(topo.objects.countries.geometries as never) as number[][];

/** ACAPS / Risk Radar names that differ from Natural Earth's short names. */
const ALIASES: Record<string, string> = {
  'South Sudan': 'S. Sudan',
  'Central African Republic': 'Central African Rep.',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'Dominican Republic': 'Dominican Rep.',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Equatorial Guinea': 'Eq. Guinea',
  'Western Sahara': 'W. Sahara',
  'Solomon Islands': 'Solomon Is.',
  "Côte d'Ivoire": "Côte d'Ivoire",
  'Czech Republic': 'Czechia',
  'Eswatini': 'eSwatini',
  'Syrian Arab Republic': 'Syria',
  'State of Palestine': 'Palestine',
  'occupied Palestinian territory': 'Palestine',
};
const INDEX = new Map(FEATURES.map((f, i) => [f.properties.name.toLowerCase(), i]));
const indexOf = (name: string) => INDEX.get((ALIASES[name] ?? name).toLowerCase());

const W = 640;
const H = 400;
const KM_PER_DEGREE = 111.32;
const RINGS_KM = [250, 500, 1000];

const COLOURS = {
  land: '#e2e8f0',
  border: '#ffffff',
  affected: 'var(--acaps-navy, #004b78)',
  ring1: 'rgba(0, 150, 186, 0.55)',
  ring2: 'rgba(0, 150, 186, 0.2)',
  ring: 'var(--acaps-blue, #0096ba)',
  sea: '#f8fafc',
};

type Zone = 'affected' | 'ring1' | 'ring2';

const noop = () => () => {};

/**
 * Drawn in the browser only: server and client round the projected coordinates slightly differently,
 * which would break hydration. A same-size placeholder holds the space meanwhile.
 */
interface Props {
  countries: string[];
  /** Text naming where the risk is (the risk title). The first known place in it becomes the rings' centre. */
  focusText?: string | null;
  /** Report text on alert pages: known places in it are marked too. */
  reportText?: string | null;
}

export function RegionMap(props: Props) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div className="aspect-[8/5] w-full animate-pulse rounded-lg border border-line bg-surface-muted" />;
  return <RegionMapInner {...props} />;
}

function RegionMapInner({ countries, focusText, reportText }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [show, setShow] = useState({ ring1: true, ring2: true, distance: true });

  const model = useMemo(() => {
    const affected = new Set<number>();
    const missing: string[] = [];
    for (const name of countries) {
      const i = indexOf(name);
      if (i === undefined) missing.push(name);
      else affected.add(i);
    }
    const ring1 = new Set<number>();
    for (const i of affected) for (const n of NEIGHBOURS[i] ?? []) if (!affected.has(n)) ring1.add(n);
    const ring2 = new Set<number>();
    for (const i of ring1) for (const n of NEIGHBOURS[i] ?? []) if (!affected.has(n) && !ring1.has(n)) ring2.add(n);
    if (affected.size === 0) return { affected, ring1, ring2, missing, focus: null, paths: null };

    // Centre on the place the risk names; else the first place the report names; else the country's centre
    const riskPlaces = findPlaces(focusText, countries);
    const reportPlaces = findPlaces(reportText, countries);
    const focus = riskPlaces[0] ?? reportPlaces[0] ?? null;
    const others = reportPlaces.filter((p) => p !== focus).slice(0, 3);

    const core: FeatureCollection = { type: 'FeatureCollection', features: [...affected].map((i) => FEATURES[i]!) };
    const centre = focus?.at ?? geoCentroid(core);
    const circles = RINGS_KM.map((km) => geoCircle().center(centre).radius(km / KM_PER_DEGREE)());
    // Frame the affected countries plus the 1,000 km ring, so huge neighbours (Russia, China) don't shrink the view
    const frame: FeatureCollection = {
      type: 'FeatureCollection',
      features: [...core.features, { type: 'Feature', properties: {}, geometry: circles[circles.length - 1]! }],
    };
    const projection = geoMercator().fitExtent([[16, 16], [W - 16, H - 16]], frame);
    const path = geoPath(projection);
    return {
      affected,
      ring1,
      ring2,
      missing,
      focus,
      paths: {
        countries: FEATURES.map((f) => path(f) ?? ''),
        rings: circles.map((c) => path(c) ?? ''),
        labels: [...affected].map((i) => ({ i, at: path.centroid(FEATURES[i]!) })),
        centre: projection(centre as [number, number]) ?? [W / 2, H / 2],
        markers: [...(focus ? [{ place: focus, main: true }] : []), ...others.map((place) => ({ place, main: false }))]
          .map((m) => ({ ...m, xy: projection(m.place.at) }))
          .filter((m): m is typeof m & { xy: [number, number] } => !!m.xy),
      },
    };
  }, [countries, focusText, reportText]);

  const zoneOf = (i: number): Zone | null =>
    model.affected.has(i) ? 'affected' : model.ring1.has(i) ? 'ring1' : model.ring2.has(i) ? 'ring2' : null;
  const fillOf = (i: number) => {
    const z = zoneOf(i);
    if (z === 'affected') return COLOURS.affected;
    if (z === 'ring1' && show.ring1) return COLOURS.ring1;
    if (z === 'ring2' && show.ring2) return COLOURS.ring2;
    return COLOURS.land;
  };
  const zoneLabel = (i: number) => {
    const z = zoneOf(i);
    return z ? t[z] : null;
  };

  const names = (s: Set<number>) => [...s].map((i) => FEATURES[i]!.properties.name).sort();
  const affectedNames = names(model.affected);
  const ring1Names = names(model.ring1);

  if (!model.paths) {
    return <p className="text-sm text-ink-muted">{countries.map((c) => t.notMapped(c)).join(' ')}</p>;
  }

  // Zoom in on the rings' centre (the named place), kept inside the map
  const vw = W / zoom;
  const vh = H / zoom;
  const [cx, cy] = model.paths.centre;
  const vx = Math.min(Math.max(cx - vw / 2, 0), W - vw);
  const vy = Math.min(Math.max(cy - vh / 2, 0), H - vh);
  const viewBox = `${vx} ${vy} ${vw} ${vh}`;

  const button =
    'inline-flex h-9 min-w-9 items-center justify-center rounded border border-line-strong bg-surface px-2 font-condensed text-sm font-bold text-accent hover:bg-accent-soft';

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line" style={{ background: COLOURS.sea }}>
        <svg
          viewBox={viewBox}
          className="block h-auto w-full touch-manipulation"
          role="img"
          aria-label={t.aria(affectedNames.join(', '), ring1Names.join(', '))}
          onMouseLeave={() => setHover(null)}
        >
          {model.paths.countries.map((d, i) =>
            d ? (
              <path
                key={i}
                d={d}
                style={{
                  fill: fillOf(i),
                  stroke: hover === i ? 'var(--acaps-ink, #0f172a)' : COLOURS.border,
                  strokeWidth: (hover === i ? 1.5 : 0.6) / zoom,
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            ) : null,
          )}
          {show.distance &&
            model.paths.rings.map((d, k) => (
              <path
                key={`r${k}`}
                d={d}
                style={{ fill: 'none', stroke: COLOURS.ring, strokeWidth: 1.25 / zoom, strokeDasharray: `${5 / zoom} ${4 / zoom}`, pointerEvents: 'none' }}
              />
            ))}
          {model.paths.labels.map(({ i, at }) =>
            Number.isFinite(at[0]) ? (
              <text
                key={`l${i}`}
                x={at[0]}
                y={at[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fill: '#ffffff', fontFamily: 'var(--font-condensed)', fontWeight: 700, fontSize: 12 / zoom, pointerEvents: 'none', textTransform: 'uppercase' }}
              >
                {FEATURES[i]!.properties.name}
              </text>
            ) : null,
          )}
          {model.paths.markers.map(({ place, main, xy }) => (
            <g key={place.name} style={{ pointerEvents: 'none' }}>
              <circle
                cx={xy[0]}
                cy={xy[1]}
                r={(main ? 5.5 : 4) / zoom}
                style={{ fill: main ? COLOURS.ring : 'var(--acaps-ink, #0f172a)', stroke: '#ffffff', strokeWidth: 1.75 / zoom }}
              />
              <text
                x={xy[0] + 8 / zoom}
                y={xy[1]}
                dominantBaseline="middle"
                style={{
                  fill: 'var(--acaps-ink, #0f172a)',
                  stroke: '#ffffff',
                  strokeWidth: 3 / zoom,
                  paintOrder: 'stroke',
                  fontFamily: 'var(--font-condensed)',
                  fontWeight: 700,
                  fontSize: (main ? 12 : 11) / zoom,
                }}
              >
                {place.name}
              </text>
            </g>
          ))}
        </svg>

        <div className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded bg-surface/95 px-2 py-1 font-condensed text-sm shadow-sm" aria-live="polite">
          {hover !== null ? (
            <>
              <span className="font-bold text-ink">{FEATURES[hover]!.properties.name}</span>
              {zoneLabel(hover) && <span className="text-ink-muted"> · {zoneLabel(hover)}</span>}
            </>
          ) : (
            <span className="text-ink-muted">{model.focus ? t.centredOn(model.focus.name) : t.centredOnCountry}</span>
          )}
        </div>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button type="button" className={button} onClick={() => setZoom((z) => Math.min(z * 1.5, 6))} aria-label={t.zoomIn}>+</button>
          <button type="button" className={button} onClick={() => setZoom((z) => Math.max(z / 1.5, 1))} aria-label={t.zoomOut}>−</button>
          <button type="button" className={button} onClick={() => setZoom(1)} aria-label={t.reset} title={t.reset}>⟲</button>
        </div>
      </div>

      <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-condensed text-sm">
        <legend className="sr-only">{t.show}</legend>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: COLOURS.affected }} aria-hidden="true" />
          {t.affected}
        </span>
        <Toggle on={show.ring1} onChange={(v) => setShow((s) => ({ ...s, ring1: v }))} swatch={COLOURS.ring1} label={t.ring1} />
        <Toggle on={show.ring2} onChange={(v) => setShow((s) => ({ ...s, ring2: v }))} swatch={COLOURS.ring2} label={t.ring2} />
        <Toggle on={show.distance} onChange={(v) => setShow((s) => ({ ...s, distance: v }))} dashed label={t.distance} />
      </fieldset>

      {model.missing.length > 0 && <p className="mt-1 text-xs text-ink-muted">{model.missing.map((c) => t.notMapped(c)).join(' ')}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label, swatch, dashed }: { on: boolean; onChange: (v: boolean) => void; label: string; swatch?: string; dashed?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#004b78]" />
      {dashed ? (
        <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: COLOURS.ring }} aria-hidden="true" />
      ) : (
        <span className="inline-block h-3 w-4 rounded-sm" style={{ background: swatch }} aria-hidden="true" />
      )}
      {label}
    </label>
  );
}
