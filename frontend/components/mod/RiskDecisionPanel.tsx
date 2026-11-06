'use client';

import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { en } from '@/lib/i18n/en';
import { mod } from '@/lib/i18n/mod';
import type { DecisionKind, ParsedTrigger } from '@/lib/types';

const t = mod.risk;
const KINDS = Object.keys(en.decisions) as DecisionKind[];

interface Entry {
  kind: DecisionKind;
  detail: string | null;
  note: string;
  at: string;
}

/**
 * The moderator's decision on a risk. The backend has no endpoint for this yet, so entries live in
 * this component's state only (lost on reload) and every entry says so. Requested in HANDOFF.md.
 */
export function RiskDecisionPanel({ triggers }: { triggers: ParsedTrigger[] }) {
  const [kind, setKind] = useState<DecisionKind>('keep');
  const [triggerId, setTriggerId] = useState('');
  const [completion, setCompletion] = useState(50);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<Entry[]>([]);

  const trigger = triggers.find((tr) => tr.id === triggerId) ?? null;

  function record() {
    setError(null);
    if (kind === 'update_trigger' && !trigger) return setError(t.needTrigger);
    if (!note.trim()) return setError(t.needNote);
    const detail = kind === 'update_trigger' && trigger ? t.completionChange(trigger.id, trigger.completionRate, completion) : null;
    const at = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    setLog((l) => [{ kind, detail, note: note.trim(), at }, ...l]);
    setNote('');
  }

  const field = 'mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink';

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.decisionTitle}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t.decisionHelp}</p>
      <div className="mt-3">
        <Notice tone="warning">{t.notSaved}</Notice>
      </div>

      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          record();
        }}
      >
        <fieldset>
          <legend className="font-medium text-ink">{t.kind}</legend>
          <div className="mt-1 grid gap-1">
            {KINDS.map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-muted">
                <input
                  type="radio"
                  name="decision-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="h-5 w-5 accent-accent"
                />
                <span className="text-ink">{en.decisions[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === 'update_trigger' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-medium text-ink">{t.trigger}</span>
              <select
                value={triggerId}
                onChange={(e) => {
                  setTriggerId(e.target.value);
                  const tr = triggers.find((x) => x.id === e.target.value);
                  if (tr?.completionRate != null) setCompletion(tr.completionRate);
                }}
                className={`${field} min-h-11`}
              >
                <option value="">—</option>
                {triggers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.id} · {tr.completionRate ?? '?'}%
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-medium text-ink">{t.newCompletion}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={10}
                value={completion}
                onChange={(e) => setCompletion(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className={`${field} min-h-11`}
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="font-medium text-ink">{t.note}</span>
          <textarea
            rows={3}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
            className={field}
          />
        </label>

        {error && <Notice tone="warning">{error}</Notice>}
        <div>
          <button type="submit" className={buttonClass.primary}>
            {t.save}
          </button>
        </div>
      </form>

      <h3 className="mt-6 text-sm font-semibold text-ink">{t.audit}</h3>
      {log.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">{t.auditEmpty}</p>
      ) : (
        <ul className="mt-2 grid gap-2" aria-live="polite">
          {log.map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium text-ink">{en.decisions[e.kind]}</p>
              {e.detail && <p className="text-ink">{e.detail}</p>}
              <p className="mt-1 text-ink">{e.note}</p>
              <p className="mt-1 text-xs text-ink-muted">{t.auditEntry(e.at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
