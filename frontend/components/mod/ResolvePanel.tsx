'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { resolveQuestion } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource, QuestionStatus, ResolveResult } from '@/lib/types';
import { fmtBrier } from './parts';

const t = mod.question;

/** Resolve Yes/No with a confirm step; shows the Briers the backend returns. Stays mounted across refresh. */
export function ResolvePanel({
  questionId,
  status,
  source,
}: {
  questionId: string;
  status: QuestionStatus;
  source: DataSource;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveResult | null>(null);

  async function resolve(yes: boolean) {
    setBusy(true);
    setError(null);
    try {
      setResult(await resolveQuestion(source, questionId, yes ? 1 : 0));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'conflict') {
        setError(t.alreadyResolved);
        router.refresh();
      } else {
        setError(e instanceof ApiError && e.kind === 'validation' ? e.detail : mod.errorHelp);
      }
    } finally {
      setBusy(false);
      setChoice(null);
    }
  }

  if (result) {
    return (
      <Card>
        <Notice>
          <p className="font-medium">{t.resolved(result.outcome)}</p>
          <p className="mt-1 text-sm">{result.scored > 0 ? t.resolvedScores(result.scored) : t.noneScored}</p>
        </Notice>
        {result.scored > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {result.meanExpertBrier !== null && (
              <div>
                <dt className="text-ink-muted">{t.meanExpert}</dt>
                <dd className="text-lg font-semibold text-ink">{fmtBrier(result.meanExpertBrier)}</dd>
              </div>
            )}
            {result.groupMedianBrier !== null && (
              <div>
                <dt className="text-ink-muted">{t.groupBrier}</dt>
                <dd className="text-lg font-semibold text-ink">{fmtBrier(result.groupMedianBrier)}</dd>
              </div>
            )}
            {result.baselineBrier !== null && (
              <p className="col-span-2 text-ink-muted">{t.baseline(fmtBrier(result.baselineBrier))}</p>
            )}
          </dl>
        )}
      </Card>
    );
  }

  if (status === 'resolved') {
    return error ? <Notice tone="warning">{error}</Notice> : null;
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.resolveTitle}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t.resolveHelp}</p>
      {error && (
        <div className="mt-3">
          <Notice tone="warning">{error}</Notice>
        </div>
      )}
      {choice === null ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={buttonClass.secondary} onClick={() => setChoice(true)}>
            {t.happened}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => setChoice(false)}>
            {t.didntHappen}
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-line-strong p-3">
          <p className="text-ink">{t.confirm(questionId, choice)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={buttonClass.primary} disabled={busy} onClick={() => void resolve(choice)}>
              {busy ? t.resolving : t.confirmYes}
            </button>
            <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => setChoice(null)}>
              {mod.alert.cancel}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
