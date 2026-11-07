'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { decideAlert } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { AlertStatus, DataSource, DecisionResult } from '@/lib/types';

const t = mod.alert;

interface Props {
  alertId: string;
  status: AlertStatus; // the server's current status; the form stays mounted across router.refresh()
  source: DataSource;
  country: string;
  today: string; // YYYY-MM-DD (UTC), from the server; the backend needs a deadline after today
  minDeadline: string; // today + 1 day
  defaults: { text: string; criteria: string; deadline: string };
}

/** Edit the draft question, then approve (sends it to experts) or reject. Only shown for pending alerts. */
export function AlertDecisionForm({ alertId, status: serverStatus, source, country, today, minDeadline, defaults }: Props) {
  const router = useRouter();
  const [text, setText] = useState(defaults.text);
  const [criteria, setCriteria] = useState(defaults.criteria);
  const [deadline, setDeadline] = useState(defaults.deadline);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);

  async function send(status: 'approved' | 'rejected') {
    setError(null);
    if (status === 'approved') {
      if (!text.trim() || !criteria.trim() || !deadline) return setError(t.required);
      if (deadline <= today) return setError(t.past);
    }
    setBusy(status === 'approved' ? 'approve' : 'reject');
    try {
      const body =
        status === 'approved'
          ? { status, question_text: text.trim(), resolution_criteria: criteria.trim(), deadline }
          : { status };
      setResult(await decideAlert(source, alertId, body));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'conflict') {
        setError(t.alreadyDecided);
        router.refresh();
      } else if (e instanceof ApiError && e.kind === 'validation') {
        setError(e.detail);
      } else {
        setError(mod.errorHelp);
      }
    } finally {
      setBusy(null);
      setConfirmReject(false);
    }
  }

  if (result) {
    return (
      <Card>
        <Notice>
          <p className="font-medium">
            {result.status === 'approved' ? t.approved(result.questionId, result.expertsInvited) : t.rejected}
          </p>
          {result.status === 'approved' && <p className="mt-1 text-sm">{t.notifyNote}</p>}
        </Notice>
        <div className="mt-4 flex flex-wrap gap-3">
          {result.status === 'approved' && (
            <Link href={`/mod/questions/${encodeURIComponent(result.questionId)}`} className={buttonClass.primary}>
              {t.toQuestion(result.questionId)}
            </Link>
          )}
          <Link href="/mod" className={buttonClass.secondary}>
            {t.toQueue}
          </Link>
        </div>
      </Card>
    );
  }

  if (serverStatus !== 'pending') {
    return (
      <Card>
        {error && (
          <div className="mb-3">
            <Notice tone="warning">{error}</Notice>
          </div>
        )}
        <p className="text-ink">{t.decided(serverStatus)}</p>
        <Link href={`/mod?status=${serverStatus}`} className={`${buttonClass.secondary} mt-3`}>
          {t.toQueue}
        </Link>
      </Card>
    );
  }

  const field = 'mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink';

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.draftTitle}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t.draftHelp}</p>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send('approved');
        }}
      >
        <label className="block">
          <span className="font-medium text-ink">{t.questionText}</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="font-medium text-ink">{t.criteria}</span>
          <span className="block text-sm text-ink-muted">{t.criteriaHelp}</span>
          <textarea rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="font-medium text-ink">{t.deadline}</span>
          <span className="block text-sm text-ink-muted">{t.deadlineHelp}</span>
          <input
            type="date"
            min={minDeadline}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={`${field} min-h-11 sm:w-56`}
          />
        </label>
        <p className="text-sm text-ink-muted">{t.routing(country)}</p>

        {error && <Notice tone="warning">{error}</Notice>}

        {confirmReject ? (
          <div className="rounded-lg border border-line-strong p-3">
            <p className="text-ink">{t.rejectConfirm}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className={buttonClass.primary} disabled={busy !== null} onClick={() => void send('rejected')}>
                {busy === 'reject' ? t.rejecting : t.rejectYes}
              </button>
              <button type="button" className={buttonClass.secondary} onClick={() => setConfirmReject(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass.primary} disabled={busy !== null}>
              {busy === 'approve' ? t.approving : t.approve}
            </button>
            <button type="button" className={buttonClass.secondary} disabled={busy !== null} onClick={() => setConfirmReject(true)}>
              {t.reject}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}
