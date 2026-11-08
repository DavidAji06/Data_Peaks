'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import { fetchGroupView, fetchProgress, submitAnswer, submitRevision } from '@/lib/client-api';
import { bandLabel, fromPercent, toPercent } from '@/lib/probability';
import { readJSON, writeJSON } from '@/lib/storage';
import { formatDate, strings, type Strings } from '@/lib/strings';
import type { AnonymityLevel, DataSource, ExpertQuestion, GroupView } from '@/lib/types';
import { buttonClass, Card, Chip, DemoBadge, Notice, RiskChip } from '@/components/ui/primitives';
import { GroupAxis } from './GroupAxis';
import { ProbabilitySlider } from './ProbabilitySlider';

type Step = 'context' | 'estimate' | 'group' | 'revise' | 'receipt';
const MAX_REASON = 280;

/** Where to land, from the server's flags (no device storage needed). */
const stepFromFlags = (answered: boolean, revised: boolean): Step => (revised ? 'receipt' : answered ? 'group' : 'context');

/** This device's own answer, only to draw "your mark" and prefill a revision. Never sent anywhere. */
const myAnswerKey = (questionId: string) => `gt:my-answer:${questionId}`;
type MyAnswer = { first: number; revised?: number }; // 0–1

export function ExpertFlow({ token, data, source }: { token: string; data: ExpertQuestion; source: DataSource }) {
  const s = strings;
  const [step, setStep] = useState<Step>(stepFromFlags(data.answered, data.revised));
  const [percent, setPercent] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'warning'; retry?: () => void } | null>(null);
  const [group, setGroup] = useState<GroupView | null>(null);
  const [mine, setMine] = useState<MyAnswer | null>(null);
  const sliderId = useId();
  const reasonId = useId();

  useEffect(() => {
    // Device storage can only be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(readJSON<MyAnswer>(myAnswerKey(data.question.id)));
  }, [data.question.id]);

  const saveMine = (next: MyAnswer) => {
    setMine(next);
    writeJSON(myAnswerKey(data.question.id), next);
  };

  const loadGroup = useCallback(async () => {
    setNotice(null);
    try {
      const g = await fetchGroupView(source, token);
      if (g === 'locked') {
        setStep('estimate'); // the server says this expert hasn't answered yet
        return;
      }
      setGroup(g);
    } catch (e) {
      const network = e instanceof ApiError && e.kind === 'network';
      setNotice({ text: network ? s.errors.network : s.errors.generic, tone: 'warning', retry: () => void loadGroup() });
    }
  }, [source, token, s]);

  useEffect(() => {
    // Fetch the group view only once this expert has answered (i.e. we are on that step).
    if (step === 'group' && group === null) void loadGroup();
  }, [step, group, loadGroup]);

  /** Shared error handling for the two POSTs. */
  async function handleError(e: unknown, retry: () => void) {
    if (!(e instanceof ApiError)) throw e;
    if (e.kind === 'conflict') {
      setNotice({ text: s.errors.alreadySubmitted, tone: 'info' });
      try {
        const flags = await fetchProgress(source, token);
        setStep(stepFromFlags(flags.answered, flags.revised));
      } catch {
        setStep('group');
      }
    } else if (e.kind === 'closed') {
      setNotice({ text: s.errors.closed, tone: 'warning' });
    } else if (e.kind === 'locked') {
      setStep('estimate');
    } else if (e.kind === 'validation') {
      setNotice({ text: e.detail, tone: 'warning' });
    } else if (e.kind === 'network') {
      setNotice({ text: s.errors.network, tone: 'warning', retry });
    } else if (e.kind === 'not_found') {
      setNotice({ text: s.errors.invalidLink, tone: 'warning' });
    } else {
      setNotice({ text: s.errors.generic, tone: 'warning', retry });
    }
  }

  async function submit() {
    if (percent === null) return setNotice({ text: s.estimate.needProbability, tone: 'warning' });
    if (!reason.trim()) return setNotice({ text: s.estimate.needReason, tone: 'warning' });
    setBusy(true);
    setNotice(null);
    try {
      await submitAnswer(source, token, { probability: fromPercent(percent), reason: reason.trim() });
      saveMine({ first: fromPercent(percent) });
      setReason('');
      setStep('group');
    } catch (e) {
      await handleError(e, () => void submit());
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (percent === null) return setNotice({ text: s.estimate.needProbability, tone: 'warning' });
    if (!reason.trim()) return setNotice({ text: s.estimate.needReason, tone: 'warning' });
    setBusy(true);
    setNotice(null);
    try {
      await submitRevision(source, token, { probability: fromPercent(percent), reason: reason.trim() });
      saveMine({ first: mine?.first ?? fromPercent(percent), revised: fromPercent(percent) });
      setStep('receipt');
    } catch (e) {
      await handleError(e, () => void revise());
    } finally {
      setBusy(false);
    }
  }

  const go = (next: Step) => {
    setNotice(null);
    if (next === 'revise') {
      const latest = mine?.revised ?? mine?.first;
      setPercent(latest === undefined ? null : toPercent(latest));
      setReason('');
    }
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const stepIndex = { context: 1, estimate: 2, group: 3, revise: 3, receipt: 4 }[step];
  const stepName = { context: s.steps.context, estimate: s.steps.estimate, group: s.steps.group, revise: s.steps.group, receipt: s.steps.done }[step];
  const closed = data.question.status !== 'open';

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">{s.common.appName}</span>
        {source === 'demo' && <DemoBadge>{s.common.demoOffline}</DemoBadge>}
      </header>

      <p className="mt-4 text-sm text-ink-muted">
        {s.steps.stepOf(stepIndex, 4)} · {stepName}
      </p>

      {notice && (
        <div className="mt-4">
          <Notice tone={notice.tone}>
            <p>{notice.text}</p>
            {notice.retry && (
              <button type="button" onClick={notice.retry} className={`${buttonClass.secondary} mt-2`}>
                {s.common.tryAgain}
              </button>
            )}
          </Notice>
        </div>
      )}

      {(step === 'context' || step === 'estimate') && <ContextHeader data={data} s={s} />}

      {step === 'context' && (
        <>
          <TriggerUpdate data={data} s={s} />
          <SimilarRisks data={data} s={s} />
          <button type="button" onClick={() => go('estimate')} className={`${buttonClass.primary} mt-6 w-full`}>
            {s.context.start}
          </button>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <Link href={`/q/${encodeURIComponent(token)}/record`} className={buttonClass.link}>
              {s.record.link}
            </Link>
            {data.anonymityLevel && (
              <Link href={`/q/${encodeURIComponent(token)}/settings`} className={buttonClass.link}>
                {s.settings.link}
              </Link>
            )}
          </div>
        </>
      )}

      {(step === 'estimate' || step === 'revise') && (
        <Card className="mt-4">
          {step === 'revise' && (
            <div>
              <h2 className="text-lg font-semibold text-ink">{s.revise.title}</h2>
              <div className="mt-2 rounded-lg bg-surface-muted p-3 text-sm">
                <p className="font-semibold text-ink">
                  {percent !== null && mine?.first !== undefined && percent === toPercent(mine.first)
                    ? 'Delphi Round 2: Maintaining your evaluation'
                    : 'Delphi Round 2: Adjusting your evaluation'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {group?.median !== null && percent !== null && Math.abs(percent - toPercent(group.median)) >= 15
                    ? 'Your evaluation differs from the group median. If you maintain this stance, explaining what factors the consensus underweights provides crucial ground truth.'
                    : 'Review peer statistics and arguments to finalize your consensus submission.'}
                </p>
              </div>
            </div>
          )}
          {step === 'estimate' && closed ? (
            <Notice tone="warning">{s.estimate.closed}</Notice>
          ) : (
            <form
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void (step === 'estimate' ? submit() : revise());
              }}
            >
              {step === 'estimate' && <p className="text-sm text-ink-muted">{s.estimate.independentNote}</p>}
              <ProbabilitySlider id={sliderId} value={percent} onChange={setPercent} s={s} />
              <div>
                <label htmlFor={reasonId} className="block font-medium text-ink">
                  {step === 'estimate'
                    ? s.estimate.reasonLabel
                    : percent !== null && mine?.first !== undefined && percent === toPercent(mine.first)
                    ? 'Why do you maintain your evaluation against the consensus? (required)'
                    : s.revise.changedMind}
                </label>
                {step === 'estimate' && <p className="text-sm text-ink-muted">{s.estimate.reasonHint}</p>}
                <textarea
                  id={reasonId}
                  value={reason}
                  maxLength={MAX_REASON}
                  rows={3}
                  required
                  placeholder={step === 'estimate' ? s.estimate.reasonPlaceholder : ''}
                  onChange={(e) => setReason(e.target.value)}
                  aria-describedby={`${reasonId}-count`}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-surface p-3 text-ink"
                />
                <p id={`${reasonId}-count`} className="text-right text-xs text-ink-muted">
                  {s.estimate.reasonCount(reason.length, MAX_REASON)}
                </p>
              </div>
              {step === 'estimate' && <WhoSees s={s} level={data.anonymityLevel} token={token} />}
              {step === 'revise' && <p className="text-sm text-ink-muted">{s.revise.firstAnswerKept}</p>}
              <div className="grid gap-2">
                <button type="submit" disabled={busy} className={buttonClass.primary}>
                  {busy
                    ? step === 'estimate' ? s.estimate.submitting : s.revise.saving
                    : step === 'estimate' ? s.estimate.submit : s.revise.save}
                </button>
                {step === 'revise' && (
                  <button type="button" onClick={() => go('group')} className={buttonClass.secondary}>
                    {s.revise.cancel}
                  </button>
                )}
              </div>
            </form>
          )}
        </Card>
      )}

      {step === 'group' && (
        <Card className="mt-4">
          <h1 className="text-lg font-semibold text-ink">{s.group.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{data.question.text}</p>
          {group === null ? (
            <p className="mt-4 text-ink-muted" aria-busy="true">
              {s.group.loading}
            </p>
          ) : (
            <>
              <p className="mt-4 text-ink">{s.group.answered(group.responseCount)}</p>
              {group.suppressed ? (
                <div className="mt-3">
                  <Notice>{s.group.suppressed}</Notice>
                </div>
              ) : (
                <GroupAxis median={group.median} min={group.min} max={group.max} mine={mine?.revised ?? mine?.first ?? null} s={s} />
              )}
              <Themes group={group} s={s} />
            </>
          )}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                const firstVal = mine?.first;
                setPercent(firstVal === undefined ? null : toPercent(firstVal));
                setReason('');
                setStep('revise');
              }}
              className={buttonClass.primary}
            >
              {s.group.keep}
            </button>
            <button
              type="button"
              onClick={() => {
                const latest = mine?.revised ?? mine?.first;
                setPercent(latest === undefined ? null : toPercent(latest));
                setReason('');
                setStep('revise');
              }}
              className={buttonClass.secondary}
            >
              {s.group.revise}
            </button>
          </div>
        </Card>
      )}

      {step === 'receipt' && (
        <Card className="mt-4">
          <h1 className="text-xl font-semibold text-ink">{s.receipt.title}</h1>
          {mine && (
            <p className="mt-2 text-ink">
              {s.receipt.yourAnswer(toPercent(mine.revised ?? mine.first), bandLabel(mine.revised ?? mine.first))}
            </p>
          )}
          <p className="mt-2 text-ink-muted">{s.receipt.reviewNote}</p>
          <p className="mt-1 text-ink-muted">{s.receipt.seeHowUsed}</p>
          <Link href={`/q/${encodeURIComponent(token)}/record`} className={`${buttonClass.link} mt-3`}>
            {s.receipt.toRecord}
          </Link>
        </Card>
      )}
    </div>
  );
}

function ContextHeader({ data, s }: { data: ExpertQuestion; s: Strings }) {
  return (
    <Card className="mt-4">
      <p className="text-sm text-ink-muted">
        {data.risk.country} · {data.risk.id}
      </p>
      <h1 className="mt-1 text-lg font-semibold leading-snug text-ink">{data.risk.title}</h1>
      {data.risk.riskLevel && (
        <div className="mt-3">
          <RiskChip level={data.risk.riskLevel} label={s.context.acapsRiskLevel(data.risk.riskLevel)} />
        </div>
      )}
      <h2 className="mt-5 text-sm font-medium uppercase tracking-wide text-ink-muted">{s.estimate.questionLabel}</h2>
      <p className="mt-1 font-medium text-ink">{data.question.text}</p>
      <p className="mt-2 text-sm text-ink-muted">{s.context.resolvesBy(formatDate(data.question.deadline))}</p>
      <details className="mt-3 rounded-lg bg-surface-muted p-3">
        <summary className="min-h-11 cursor-pointer content-center font-medium text-ink">{s.context.howResolves}</summary>
        <p className="mt-2 text-ink">{data.question.resolutionCriteria}</p>
      </details>
    </Card>
  );
}

function TriggerUpdate({ data, s }: { data: ExpertQuestion; s: Strings }) {
  const u = data.triggerUpdate;
  return (
    <Card className="mt-4">
      <h2 className="text-base font-semibold text-ink">{s.context.whatChanged}</h2>
      {!u ? (
        <p className="mt-2 text-ink-muted">{s.context.noUpdate}</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {u.report.url ? (
            <a href={u.report.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">
              {u.report.title} <span className="sr-only">{s.common.opensInNewTab}</span>
            </a>
          ) : (
            <p className="font-medium text-ink">{u.report.title}</p>
          )}
          <p className="text-sm text-ink-muted">
            {s.context.reportMeta(u.report.source ?? '—', u.report.publishedAt ? formatDate(u.report.publishedAt) : '—')}
          </p>
          <div className="flex flex-wrap gap-2">
            {u.direction && <Chip>{/escalat/i.test(u.direction) && !/de-?escalat/i.test(u.direction) ? s.direction.escalating : s.direction.easing}</Chip>}
            {u.strengthWord && <Chip>{s.strength[u.strengthWord]}</Chip>}
            {u.triggerId && <Chip>{s.context.matchedTrigger(u.triggerId)}</Chip>}
          </div>
          {u.evidence && (
            <p className="text-ink">
              <span className="font-medium">{s.context.whyFlagged}: </span>
              {u.evidence}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function SimilarRisks({ data, s }: { data: ExpertQuestion; s: Strings }) {
  if (data.similarRisks.length === 0) return null;
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{s.context.similarTitle}</h2>
        {data.similarRisksAreDemo && <DemoBadge>{s.common.demoUntilMl}</DemoBadge>}
      </div>
      <ul className="mt-3 grid gap-3">
        {data.similarRisks.map((r) => (
          <li key={r.riskId} className="rounded-lg border border-line p-3">
            <p className="text-sm text-ink-muted">
              {r.country} · {r.riskId}
            </p>
            <p className="mt-1 font-medium text-ink">{r.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  r.outcome === 'materialised' ? 'bg-ink text-on-accent' : 'border border-line-strong text-ink'
                }`}
              >
                {s.outcomes[r.outcome]}
              </span>
              {r.acapsProbability && <Chip>{s.context.ratedThen(r.acapsProbability)}</Chip>}
            </div>
            <p className="mt-2 text-sm text-ink">{r.whatHappened}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WhoSees({ s, level, token }: { s: Strings; level: AnonymityLevel | null; token: string }) {
  // The level comes from GET /q/{token}/settings. On a backend without that endpoint it is null,
  // and the ACAPS line stays generic (true for every level).
  const info = level ? s.anonymity.levels[level] : null;
  return (
    <div className="rounded-lg bg-surface-muted p-3 text-sm">
      <p className="font-medium text-ink">{s.whoSees.title}</p>
      {info && <p className="mt-1 text-ink">{s.whoSees.yourLevel(info.label)}</p>}
      <ul className="mt-1 grid gap-0.5 text-ink-muted">
        <li>{info ? info.description : s.whoSees.acaps}</li>
        <li>{s.whoSees.peers}</li>
        <li>{s.whoSees.public}</li>
      </ul>
      {/* Only offered when this backend has the settings endpoint (level known). */}
      {level && (
        <Link href={`/q/${encodeURIComponent(token)}/settings`} className={`${buttonClass.link} text-sm`}>
          {s.whoSees.change}
        </Link>
      )}
    </div>
  );
}

function Themes({ group, s }: { group: GroupView; s: Strings }) {
  // Never fabricate reasons on the expert side: show only what the API sends.
  const t = group.themes;
  const sections = [
    { title: s.group.themes.agreement, items: t.agreement },
    { title: s.group.themes.disagreement, items: t.disagreement },
    { title: s.group.themes.newInformation, items: t.newInformation },
  ].filter((x) => x.items.length > 0);
  if (group.suppressed || sections.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">{s.group.noThemes}</p>;
  }
  return (
    <div className="mt-4 grid gap-3">
      {sections.map((sec) => (
        <div key={sec.title}>
          <h3 className="font-medium text-ink">{sec.title}</h3>
          <ul className="mt-1 list-disc pl-5 text-ink">
            {sec.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
