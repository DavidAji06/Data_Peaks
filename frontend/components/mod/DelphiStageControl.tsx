'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { advanceQuestionRound, closeQuestion } from '@/lib/client-api';
import type { DataSource, QuestionStatus } from '@/lib/types';

export function DelphiStageControl({
  questionId,
  status,
  phase,
  delphiRound = 1,
  answeredCount,
  invitedCount,
  source,
}: {
  questionId: string;
  status: QuestionStatus;
  phase?: string;
  delphiRound?: number;
  answeredCount: number;
  invitedCount: number;
  source: DataSource;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'resolved') {
    return null;
  }

  const completionPct = invitedCount > 0 ? Math.round((answeredCount / invitedCount) * 100) : 0;

  async function handleAdvance() {
    setBusy(true);
    setError(null);
    try {
      await advanceQuestionRound(source, questionId);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not advance to Round 2.');
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError(null);
    try {
      await closeQuestion(source, questionId);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not close Delphi round.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'closed') {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <h2 className="text-base font-semibold text-ink">Delphi Finalised (Closed)</h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Delphi elicitation rounds have finished. Expert responses are finalised and ready for resolution.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Delphi Process Control</h2>
        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
          {delphiRound === 2 ? 'ROUND 2 ACTIVE' : 'ROUND 1 ACTIVE'}
        </span>
      </div>

      {delphiRound === 1 && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border border-line bg-surface-muted/40 p-3 text-sm">
            <div className="flex justify-between text-xs text-ink-muted">
              <span>Round 1 Progress</span>
              <span>{completionPct}% (80% threshold required)</span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.min(100, completionPct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {answeredCount} of {invitedCount} regional experts have answered. Auto-advances to Round 2 when 80% is reached.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAdvance}
            disabled={busy}
            className={`${buttonClass.primary} w-full`}
          >
            {busy ? 'Advancing…' : 'Advance to Round 2 (Consensus) Now'}
          </button>
        </div>
      )}

      {delphiRound === 2 && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-muted leading-relaxed">
            Experts are currently reviewing peer answers, distributions, and AI themes in the Delphi app. They can maintain or adjust their estimates.
          </p>

          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className={`${buttonClass.secondary} w-full`}
          >
            {busy ? 'Closing…' : 'Close Delphi & Finalize Results'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <Notice tone="warning">{error}</Notice>
        </div>
      )}
    </Card>
  );
}
