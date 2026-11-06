import { strings } from '@/lib/strings';

export default function OutcomeNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{strings.public.notFound}</h1>
      </div>
    </main>
  );
}
