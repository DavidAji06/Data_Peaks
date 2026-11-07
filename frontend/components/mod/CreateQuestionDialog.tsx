'use client';

import { useState } from 'react';
import { buttonClass } from '@/components/ui/primitives';
import { AlertDecisionForm } from './AlertDecisionForm';
import type { AlertStatus, DataSource } from '@/lib/types';

interface Props {
  alertId: string;
  status: AlertStatus;
  source: DataSource;
  country: string;
  today: string;
  minDeadline: string;
  defaults: { text: string; criteria: string; deadline: string };
}

/**
 * Dialog for creating a question from an alert.
 * Opens in a modal overlay with escape/backdrop close.
 * Used on M1 (alerts list) for quick access to question creation.
 */
export function CreateQuestionDialog({
  alertId,
  status,
  source,
  country,
  today,
  minDeadline,
  defaults,
}: Props) {
  const [open, setOpen] = useState(false);

  if (status !== 'pending') {
    return null; // Dialog only for pending alerts
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonClass.secondary} text-xs sm:text-sm font-bold rounded-xl px-3 py-2.5 border border-primary-100/30 text-primary-600 hover:border-primary-600 hover:bg-gradient-to-r hover:from-primary-600/10 hover:to-primary-500/5 transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/10`}
        aria-label={`Create question from alert ${alertId}`}
      >
        ✦ Create question
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="presentation"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-surface-card to-surface-white/10 p-6 shadow-2xl shadow-primary-500/20 border border-primary-100/30 backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-ink">Create question</h2>
                <p className="text-xs sm:text-sm text-ink-muted mt-1">From alert <span className="font-mono font-semibold">{alertId}</span></p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-muted hover:text-ink transition-colors p-1 hover:bg-surface-muted rounded-lg"
                aria-label="Close dialog"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <AlertDecisionForm
              alertId={alertId}
              status={status}
              source={source}
              country={country}
              today={today}
              minDeadline={minDeadline}
              defaults={defaults}
            />
          </div>
        </div>
      )}
    </>
  );
}
