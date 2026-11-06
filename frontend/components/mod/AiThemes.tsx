'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { summariseQuestion } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource, Themes } from '@/lib/types';
import { StatusTag } from './parts';

const t = mod.question;

/**
 * Agreement / disagreement / new information, as an AI draft for moderators.
 * Generated on request by the backend (POST …/summarise); never invented here.
 */
export function AiThemes({
  questionId,
  themes: initial,
  canShow,
  source,
}: {
  questionId: string;
  themes: Themes;
  canShow: boolean; // 5+ answers
  source: DataSource;
}) {
  const router = useRouter();
  const [themes, setThemes] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const groups = [
    [t.themes.agreement, themes.agreement],
    [t.themes.disagreement, themes.disagreement],
    [t.themes.newInformation, themes.newInformation],
  ] as const;
  const empty = groups.every(([, items]) => items.length === 0);

  async function generate() {
    setBusy(true);
    setNote(null);
    try {
      const r = await summariseQuestion(source, questionId);
      setThemes(r.themes);
      const nothing = [r.themes.agreement, r.themes.disagreement, r.themes.newInformation].every((x) => x.length === 0);
      if (nothing) setNote(t.aiEmpty(r.reasonCount));
      router.refresh();
    } catch {
      setNote(mod.errorHelp);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-ink">{t.themesTitle}</h2>
        <StatusTag>{t.aiLabel}</StatusTag>
      </div>
      {!canShow ? (
        <p className="mt-2 text-ink-muted">{t.suppressed}</p>
      ) : (
        <>
          {empty ? (
            <p className="mt-2 text-ink-muted">{t.aiPending}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              <Notice>{t.aiReview}</Notice>
              {groups.map(([label, items]) =>
                items.length ? (
                  <div key={label}>
                    <h3 className="text-sm font-medium text-ink-muted">{label}</h3>
                    <ul className="mt-1 list-disc pl-5 text-ink">
                      {items.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
          {note && (
            <div className="mt-3">
              <Notice tone="warning">{note}</Notice>
            </div>
          )}
          <button type="button" className={`${buttonClass.secondary} mt-3`} disabled={busy} onClick={() => void generate()}>
            {busy ? t.aiGenerating : empty ? t.aiGenerate : t.aiRegenerate}
          </button>
          <p className="mt-2 text-xs text-ink-muted">{t.aiExpertsSee}</p>
        </>
      )}
    </Card>
  );
}
