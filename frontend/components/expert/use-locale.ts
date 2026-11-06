'use client';

import { useCallback, useEffect, useState } from 'react';
import { KEYS, readLocale, writeJSON } from '@/lib/storage';
import { t } from '@/lib/strings';
import type { Locale } from '@/lib/types';

/**
 * EN/FR choice, remembered on this device. Starts as English on the server and in the first render
 * (no hydration mismatch), then switches to the stored choice. Keeps <html lang> in step.
 */
export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = readLocale();
    // Sync from device storage after hydration (storage isn't readable during the server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeJSON(KEYS.locale, next);
  }, []);

  return { locale, setLocale, s: t(locale) };
}
