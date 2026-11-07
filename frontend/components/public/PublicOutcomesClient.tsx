'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/primitives';
import { toPercent } from '@/lib/probability';
import { strings as s } from '@/lib/strings';
import { toPublicOutcome } from '@/lib/adapters';
import type { PublicOutcome } from '@/lib/types';
import type { ApiPublicQuestion } from '@/lib/types';

const p = s.public;

export function PublicOutcomesClient({ initialItems }: { initialItems: PublicOutcome[] }) {
  const [items, setItems] = useState(initialItems);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Auto-refresh every 60 seconds (also runs once on mount to initialize lastRefresh)
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch('/api/demo/public/questions');
        if (!res.ok) return;
        const data = (await res.json()) as ApiPublicQuestion[];
        const transformed = data.map(toPublicOutcome);
        const refreshed = transformed.sort((a, b) => Number(a.simulated) - Number(b.simulated));
        setItems(refreshed);
        setLastRefresh(new Date());
      } catch (e) {
        // Silent fail on refresh — page still shows previous data
        console.debug('Public outcomes auto-refresh failed', e);
      }
    };

    // Refresh immediately on mount
    refresh();

    // Then refresh every 60 seconds
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, []);


  if (items.length === 0) {
    return <p className="mt-4 rounded-xl border border-border-default bg-surface-card p-5 text-ink-muted">{p.empty}</p>;
  }

  return (
    <>
      <ul className="mt-4 grid gap-3">
        {items.map((q) => (
          <li key={q.questionId}>
            <Link
              href={`/outcomes/${encodeURIComponent(q.questionId)}`}
              className="block rounded-lg border border-border-default bg-surface-card p-4 transition-colors hover:border-primary-500"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
                <span>{q.country}</span>
                {q.simulated && <Chip variant="gray">{p.practiceTag}</Chip>}
              </div>
              <p className="mt-1 text-ink">{q.riskTitle}</p>
              <p className="mt-2 text-sm text-ink-500">
                {q.outcome !== null && p.outcome(q.outcome)}
                {q.group && ` · ${p.median} ${toPercent(q.group.median)}%`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {lastRefresh && (
        <p className="mt-3 text-xs text-ink-500">Last refreshed: {lastRefresh.toLocaleTimeString()}</p>
      )}
    </>
  );
}
