'use client';

/**
 * Moderator risk map: the expert app's interactive globe with its dots coloured by ACAPS impact, plus a side
 * panel for the pressed country (its ranked risks, each linking to the risk page) and a country list.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Card, RiskChip } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';
import type { MapContext } from '@/lib/types';
import { getImpactColor } from './RegionMap';

const ModGlobe = dynamic(() => import('./ModGlobe'), { ssr: false, loading: () => <GlobeSpinner /> });

const t = mod.map;
const LEVELS = [1, 2, 3, 4, 5] as const;
const LAND = '#134A8E';

function GlobeSpinner() {
  return <div className="aspect-square w-full animate-pulse rounded-full bg-[#0A2A5E]/20" aria-hidden="true" />;
}

const noop = () => () => {};
function useHasWebgl() {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        return false;
      }
    },
    () => true,
  );
}

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

function ImpactPill({ score }: { score: number | null }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-condensed text-xs font-bold text-white"
      style={{ background: getImpactColor(score) }}
    >
      {t.impactOf(score)}
    </span>
  );
}

export function RiskMap({ contexts }: { contexts: MapContext[] }) {
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const [size, setSize] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const webgl = useHasWebgl();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selected = contexts.find((c) => c.iso === selectedIso) ?? null;
  const sorted = [...contexts].sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0) || a.name.localeCompare(b.name));
  const select = (iso: string) => setSelectedIso((cur) => (cur === iso ? null : iso));

  const btn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded border border-line bg-surface px-2 font-condensed text-sm font-bold text-ink hover:bg-accent-soft';

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        {webgl ? (
          <>
            <div ref={box} className="relative w-full">
              {size > 0 && (
                <ModGlobe
                  size={size}
                  contexts={contexts}
                  selectedIso={selectedIso}
                  onSelect={select}
                  resetSignal={reset}
                  zoomSignal={zoom}
                  reducedMotion={reducedMotion}
                />
              )}
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                <button type="button" className={btn} aria-label={t.zoomIn} onClick={() => setZoom((z) => ({ n: z.n + 1, dir: 1 }))}>+</button>
                <button type="button" className={btn} aria-label={t.zoomOut} onClick={() => setZoom((z) => ({ n: z.n + 1, dir: -1 }))}>−</button>
                <button
                  type="button"
                  className={btn}
                  aria-label={t.reset}
                  title={t.reset}
                  onClick={() => {
                    setSelectedIso(null);
                    setReset((r) => r + 1);
                  }}
                >
                  ⟲
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t.noWebgl}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-condensed text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              {LEVELS.map((n) => (
                <span key={n} className="h-2.5 w-2.5 rounded-full" style={{ background: getImpactColor(n) }} title={`${n}/5`} />
              ))}
            </span>
            {t.impact}
          </span>
          {selected &&
            webgl &&
            ([
              [0.62, t.selected],
              [0.36, t.ring1],
              [0.16, t.ring2],
            ] as const).map(([w, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-3.5 rounded-sm"
                  style={{ background: `color-mix(in srgb, ${getImpactColor(selected.impactScore)} ${w * 100}%, ${LAND})` }}
                />
                {label}
              </span>
            ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          {selected ? (
            <div aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-ink">{selected.name}</h2>
                <ImpactPill score={selected.impactScore} />
              </div>
              <p className="mt-1 font-condensed text-xs font-bold uppercase tracking-widest text-ink-muted">{t.risksIn(selected.name)}</p>
              <ul className="mt-2 space-y-2">
                {selected.risks.map((r) => (
                  <li key={r.id} className="rounded border border-line p-2.5">
                    <p className="text-sm leading-snug text-ink">{r.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <RiskChip level={r.riskLevel} label={`${t.level}: ${r.riskLevel ?? '—'}`} />
                      {r.impact != null && <ImpactPill score={r.impact} />}
                      <Link href={`/mod/risks/${encodeURIComponent(r.id)}`} className="ml-auto text-sm font-medium text-primary-600 underline underline-offset-4 hover:text-primary-700">
                        {t.openRisk} {r.id} →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t.pick}</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-base font-semibold text-ink">{t.countries}</h2>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {sorted.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => select(c.iso)}
                  aria-pressed={c.iso === selectedIso}
                  className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm hover:bg-accent-soft ${c.iso === selectedIso ? 'bg-accent-soft font-semibold' : ''}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getImpactColor(c.impactScore) }} aria-hidden="true" />
                  <span className="flex-1 text-ink">{c.name}</span>
                  <span className="font-condensed text-xs text-ink-muted">{t.impactOf(c.impactScore)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
