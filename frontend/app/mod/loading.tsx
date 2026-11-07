export function ModSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-surface-muted" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-surface-muted" />
      <div className="mt-6 grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return <ModSkeleton />;
}
