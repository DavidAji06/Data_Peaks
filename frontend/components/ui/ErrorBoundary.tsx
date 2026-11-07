'use client';

import { useEffect } from 'react';
import { buttonClass, Card, Notice } from './primitives';

export function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log error for debugging (don't send to server in production)
    console.error('[Ground Truth] Unhandled error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-full w-full flex-col items-center justify-center bg-surface-page px-4 py-16">
      <Card className="max-w-md">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-muted">
          An unexpected error occurred. Try refreshing the page, or go back and try again.
        </p>
        {error.message && (
          <div className="mt-4">
            <Notice tone="warning">
              <p className="text-sm font-mono">{error.message}</p>
            </Notice>
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button onClick={() => window.location.reload()} className={buttonClass.secondary}>
            Refresh page
          </button>
          <button onClick={reset} className={buttonClass.primary}>
            Try again
          </button>
        </div>
      </Card>
    </div>
  );
}
