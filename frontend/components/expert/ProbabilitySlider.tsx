'use client';

import type React from 'react';
import { bandLabel, fromPercent } from '@/lib/probability';
import type { Strings } from '@/lib/strings';

/**
 * 0–100 probability slider that starts UNSET: no thumb and "Not set yet" until the expert moves it,
 * so there's no anchor at 50. Native range input for keyboard and screen readers. Value is whole percent.
 */
export function ProbabilitySlider({
  id,
  value,
  onChange,
  s,
}: {
  id: string;
  value: number | null;
  onChange: (percent: number) => void;
  s: Strings;
}) {
  const unset = value === null;
  const shown = unset ? s.estimate.sliderNotSet : s.estimate.sliderValue(value, bandLabel(fromPercent(value)));
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-ink">
        {s.estimate.sliderLabel}
      </label>
      <p className={`mt-1 text-2xl font-semibold ${unset ? 'text-ink-muted text-base font-normal' : 'text-ink'}`} aria-hidden="true">
        {shown}
      </p>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value ?? 50}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={(e) => {
          // A tap on an unset slider sets it where the finger is, even without dragging.
          if (unset) {
            const rect = e.currentTarget.getBoundingClientRect();
            onChange(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * 100));
          }
        }}
        className={`probability-range mt-2 w-full ${unset ? 'is-unset' : ''}`}
        style={{ '--fill': `${value ?? 0}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
