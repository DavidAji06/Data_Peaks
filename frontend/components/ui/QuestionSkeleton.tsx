export function QuestionSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-4" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-32 rounded bg-surface-muted" />
      <div className="mt-6 grid gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-24 rounded bg-surface-muted" />
        <div className="h-6 w-full rounded bg-surface-muted" />
        <div className="h-6 w-3/4 rounded bg-surface-muted" />
        <div className="h-8 w-40 rounded-full bg-surface-muted" />
      </div>
      <div className="mt-4 h-40 rounded-xl border border-line bg-surface" />
    </div>
  );
}

