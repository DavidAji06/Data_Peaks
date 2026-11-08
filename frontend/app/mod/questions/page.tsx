import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/mod/parts';
import { QuestionList, type QuestionRow } from '@/components/mod/QuestionList';
import { getModeratorQuestions, getRankedRisks, getRisk } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { splitCountries } from '@/lib/region';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Questions' };

const t = mod.questions;

export default function QuestionsPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Questions />
    </Suspense>
  );
}

/** Country per risk id, for the country filter. Ranked risks first, then the risk record; unknown stays empty. */
async function countriesByRisk(riskIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ranked = await getRankedRisks().catch(() => null);
  for (const r of ranked?.data.items ?? []) out.set(r.riskId, splitCountries(r.country));
  const missing = riskIds.filter((id) => !out.has(id));
  const looked = await Promise.all(missing.map((id) => getRisk(id).then((r) => r.data).catch(() => null)));
  missing.forEach((id, i) => out.set(id, splitCountries(looked[i]?.country)));
  return out;
}

async function Questions() {
  const { data, source } = await getModeratorQuestions();
  const byRisk = await countriesByRisk([...new Set(data.map((q) => q.riskId))]);
  const rows: QuestionRow[] = data.map((q) => ({ ...q, countries: byRisk.get(q.riskId) ?? [] }));

  return (
    <>
      <PageHeader title={t.title} intro={t.intro} source={source} />
      <QuestionList items={rows} />
    </>
  );
}
