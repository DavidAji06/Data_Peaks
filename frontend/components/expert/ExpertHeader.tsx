import { DemoBadge } from '@/components/ui/primitives';
import { strings as s } from '@/lib/strings';
import type { DataSource } from '@/lib/types';

/** Top bar for expert screens outside the question flow. */
export function ExpertHeader({ source }: { source: DataSource }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-semibold text-ink">{s.common.appName}</span>
      {source === 'demo' && <DemoBadge>{s.common.demoOffline}</DemoBadge>}
    </header>
  );
}
