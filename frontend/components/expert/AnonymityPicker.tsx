'use client';

import { strings as s } from '@/lib/strings';
import type { AnonymityLevel } from '@/lib/types';

const LEVELS: readonly AnonymityLevel[] = ['known_to_acaps', 'pseudonymous', 'anonymous'];

/**
 * The expert's own choice of anonymity level (a Must in the brief). Each option says plainly
 * what ACAPS sees and whether the expert is ranked; nothing is preselected on sign-up.
 */
export function AnonymityPicker({
  value,
  onChange,
  name,
}: {
  value: AnonymityLevel | null;
  onChange: (level: AnonymityLevel) => void;
  name: string;
}) {
  const p = s.privacy;
  return (
    <fieldset>
      <legend className="text-base font-semibold text-ink">{p.levelTitle}</legend>
      <p className="mt-1 text-sm text-ink-muted">{p.levelHelp}</p>
      <div className="mt-3 grid gap-2">
        {LEVELS.map((level) => {
          const info = s.anonymity.levels[level];
          const checked = value === level;
          return (
            <label
              key={level}
              className={`block cursor-pointer rounded-lg border p-3 ${
                checked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-surface-muted'
              }`}
            >
              <span className="flex items-start gap-3">
                <input
                  type="radio"
                  name={name}
                  value={level}
                  checked={checked}
                  onChange={() => onChange(level)}
                  className="mt-1 h-5 w-5 shrink-0 accent-accent"
                />
                <span className="grid gap-1">
                  <span className="font-medium text-ink">{info.label}</span>
                  <span className="text-sm text-ink-muted">{info.description}</span>
                  <span className="mt-1 grid gap-0.5 text-sm text-ink">
                    <span>
                      <span className="text-ink-muted">{p.matrix.acaps}: </span>
                      {p.sees[level]}
                    </span>
                    <span>
                      <span className="text-ink-muted">{p.matrix.ranked}: </span>
                      {p.ranked[level]}
                    </span>
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-muted">{p.always}</p>
    </fieldset>
  );
}
