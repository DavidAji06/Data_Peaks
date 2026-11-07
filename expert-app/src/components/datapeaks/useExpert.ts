import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  getToken,
  type ApiExpertQuestion,
  type ApiGroupView,
  type ApiSettings,
  type ApiTrackRecord,
} from "@/lib/api";

/** "invalid" = 404 on the link, "offline" = backend unreachable. */
export type LoadState = "loading" | "ready" | "invalid" | "offline";

/** The expert's own estimates (0–100). The backend does not echo them back, so we keep them for this tab. */
export interface OwnAnswer {
  first: number | null;
  latest: number | null;
  firstReason: string;
}

const ownKey = (questionId: string) => `dp-own-${questionId}`;

function readOwn(questionId: string): OwnAnswer {
  try {
    const raw = sessionStorage.getItem(ownKey(questionId));
    if (raw) return JSON.parse(raw) as OwnAnswer;
  } catch {
    /* storage unavailable */
  }
  return { first: null, latest: null, firstReason: "" };
}

function writeOwn(questionId: string, own: OwnAnswer) {
  try {
    sessionStorage.setItem(ownKey(questionId), JSON.stringify(own));
  } catch {
    /* storage unavailable */
  }
}

export function useExpert() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ApiExpertQuestion | null>(null);
  const [group, setGroup] = useState<ApiGroupView | null>(null);
  const [groupLocked, setGroupLocked] = useState(true);
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [track, setTrack] = useState<ApiTrackRecord | null>(null);
  const [own, setOwn] = useState<OwnAnswer>({ first: null, latest: null, firstReason: "" });

  // Token is read on the client only (SSR has no window).
  useEffect(() => setToken(getToken()), []);

  const loadGroup = useCallback(async (tk: string) => {
    try {
      setGroup(await api.getGroup(tk));
      setGroupLocked(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setGroup(null);
        setGroupLocked(true);
      } else throw e;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const q = await api.getQuestion(token);
      setData(q);
      setOwn(readOwn(q.question.id));
      const [s, t] = await Promise.all([
        api.getSettings(token).catch(() => null),
        api.getTrackRecord(token).catch(() => null),
      ]);
      setSettings(s);
      setTrack(t);
      if (q.answered) await loadGroup(token);
      else {
        setGroup(null);
        setGroupLocked(true);
      }
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? "invalid" : "offline");
    }
  }, [token, loadGroup]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** answer is 0–100. Throws ApiError on failure (409 is treated as already answered). */
  const submitAnswer = useCallback(
    async (answer: number, reason: string) => {
      if (!token || !data) return;
      try {
        await api.submitAnswer(token, answer / 100, reason.trim());
        const next = { first: answer, latest: answer, firstReason: reason.trim() };
        writeOwn(data.question.id, next);
        setOwn(next);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
      }
      await refresh();
      // The backend writes the AI summary of reasons in the background; look again shortly.
      for (const delay of [8000, 20000]) {
        setTimeout(() => void loadGroup(token).catch(() => undefined), delay);
      }
    },
    [token, data, refresh, loadGroup],
  );

  const submitRevision = useCallback(
    async (answer: number, reason: string) => {
      if (!token || !data) return;
      // The backend requires a reason; reuse the original one rather than inventing text.
      const why = reason.trim() || own.firstReason || "No change in reasoning";
      try {
        await api.submitRevision(token, answer / 100, why);
        const next = { ...own, latest: answer };
        writeOwn(data.question.id, next);
        setOwn(next);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
      }
      await refresh();
    },
    [token, data, own, refresh],
  );

  const saveSettings = useCallback(
    async (body: Parameters<typeof api.updateSettings>[1]) => {
      if (!token) return;
      setSettings(await api.updateSettings(token, body));
    },
    [token],
  );

  return useMemo(
    () => ({ token, state, data, group, groupLocked, settings, track, own, refresh, submitAnswer, submitRevision, saveSettings }),
    [token, state, data, group, groupLocked, settings, track, own, refresh, submitAnswer, submitRevision, saveSettings],
  );
}

export type Expert = ReturnType<typeof useExpert>;
