'use client';

import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { submitRiskDecision } from '@/lib/client-api';
import { ApiError, NetworkError } from '@/lib/api-error';
import { en } from '@/lib/i18n/en';
import { mod } from '@/lib/i18n/mod';
import type { DecisionKind, ParsedTrigger, RiskDecision } from '@/lib/types';

const t = mod.risk;
const KINDS = Object.keys(en.decisions) as DecisionKind[];

/**
 * The moderator's decision on a risk. Submissions go to POST /risks/{id}/decide.
 * This component is server-passed the riskId and source (api | demo).
 */
export function RiskDecisionPanel({ riskId, source, triggers, decisions = [] }: { riskId: string; source: 'api' | 'demo'; triggers: ParsedTrigger[]; decisions?: RiskDecision[] }) {
  const [decision, setDecision] = useState<DecisionKind>('keep');
  const [triggerId, setTriggerId] = useState('');
  const [completion, setCompletion] = useState(50);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trigger = triggers.find((tr) => tr.id === triggerId) ?? null;

  async function submit() {
    setError(null);
    if (decision === 'update_trigger' && !trigger) return setError(t.needTrigger);
    if (decision === 'add_trigger' && !trigger) return setError(t.needTrigger);
    if (!note.trim()) return setError(t.needNote);

    setSubmitting(true);
    try {
      await submitRiskDecision(source, riskId, {
        decision,
        question_id: '',  // Will come from frontend context once API is finalized
        note: note.trim(),
        ...(decision === 'update_trigger' || decision === 'add_trigger' ? { trigger_id: triggerId } : {}),
      });
      setNote('');
    } catch (e) {
      if (e instanceof NetworkError) {
        setError('Could not reach the server. Check your connection.');
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2.5 text-ink';

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.decisionTitle}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t.decisionHelp}</p>

      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
                  checked={decision === k}
                  onChange={() => setDecision(k)}
                  disabled={submitting}
                  className="h-5 w-5 accent-primary-600"
                />
                <span className="text-ink">{en.decisions[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {(decision === 'update_trigger' || decision === 'add_trigger') && (
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
                disabled={submitting}
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
            {decision === 'update_trigger' && (
              <label className="block">
                <span className="font-medium text-ink">{t.newCompletion}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={10}
                  value={completion}
                  onChange={(e) => setCompletion(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  disabled={submitting}
                  className={`${field} min-h-11`}
                />
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="font-medium text-ink">{t.note}</span>
          <textarea
            rows={3}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            className={field}
          />
        </label>

        {error && <Notice tone="warning">{error}</Notice>}
        <div>
          <button type="submit" disabled={submitting} className={buttonClass.primary}>
            {submitting ? 'Saving…' : t.save}
          </button>
        </div>
      </form>

      <h3 className="mt-6 text-sm font-semibold text-ink">{t.audit}</h3>
      {decisions.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">{t.auditEmpty}</p>
      ) : (
        <ul className="mt-2 grid gap-2" aria-live="polite">
          {decisions.map((d) => {
            const at = new Date(d.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return (
              <li key={d.id} className="rounded-lg border border-border-default p-3 text-sm">
                <p className="font-medium text-ink">{en.decisions[d.decision]}</p>
                {d.triggerId && <p className="text-ink">{t.completionChange(d.triggerId, null, 0)}</p>}
                <p className="mt-1 text-ink">{d.note}</p>
                <p className="mt-1 text-xs text-ink-muted">{t.auditEntry(at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
