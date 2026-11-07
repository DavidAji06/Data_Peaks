import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  getToken,
  type ApiExpertQuestion,
  type ApiGroupView,
  type ApiQuestionSummary,
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
const SELECTED_KEY = "dp-selected-question";

function readSelected(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

/** The question to show: the one already picked if still there, else the first open unanswered, else the newest. */
function pickQuestion(list: ApiQuestionSummary[], wanted: string | null): string | null {
  if (wanted && list.some((q) => q.question_id === wanted)) return wanted;
  return (list.find((q) => q.status === "open" && !q.answered) ?? list[0])?.question_id ?? null;
}

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
  /** Every question this expert was invited to. A new question never hides an older one. */
  const [questions, setQuestions] = useState<ApiQuestionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState<ApiGroupView | null>(null);
  const [groupLocked, setGroupLocked] = useState(true);
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [track, setTrack] = useState<ApiTrackRecord | null>(null);
  const [own, setOwn] = useState<OwnAnswer>({ first: null, latest: null, firstReason: "" });

  // Token is read on the client only (SSR has no window).
  useEffect(() => {
    setToken(getToken());
    setSelectedId(readSelected());
  }, []);

  const loadGroup = useCallback(async (tk: string, questionId: string) => {
    try {
      setGroup(await api.getGroup(tk, questionId));
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
      // Settings first: a 404 here means the link itself is unknown ("invalid").
      const [s, list, t] = await Promise.all([
        api.getSettings(token),
        api.getQuestions(token),
        api.getTrackRecord(token).catch(() => null),
      ]);
      setSettings(s);
      setQuestions(list);
      setTrack(t);
      const id = pickQuestion(list, selectedId);
      if (!id) {
        // No question yet: the expert exists, so show "You're up to date".
        setData(null);
        setGroup(null);
        setGroupLocked(true);
        setState("ready");
        return;
      }
      const q = await api.getQuestion(token, id);
      setData(q);
      // The server's record wins; the browser copy only covers an older backend.
      const o = q.own;
      setOwn(
        o && o.first !== null
          ? { first: Math.round(o.first * 100), latest: o.latest === null ? null : Math.round(o.latest * 100), firstReason: o.first_reason }
          : readOwn(q.question.id),
      );
      if (q.answered) await loadGroup(token, id);
      else {
        setGroup(null);
        setGroupLocked(true);
      }
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? "invalid" : "offline");
    }
  }, [token, selectedId, loadGroup]);

  /** Show another of the expert's questions. */
  const selectQuestion = useCallback((questionId: string) => {
    try {
      sessionStorage.setItem(SELECTED_KEY, questionId);
    } catch {
      /* storage unavailable */
    }
    setSelectedId(questionId);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** answer is 0–100. Throws ApiError on failure (409 is treated as already answered). */
  const submitAnswer = useCallback(
    async (answer: number, reason: string) => {
      if (!token || !data) return;
      try {
        await api.submitAnswer(token, data.question.id, answer / 100, reason.trim());
        const next = { first: answer, latest: answer, firstReason: reason.trim() };
        writeOwn(data.question.id, next);
        setOwn(next);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
      }
      await refresh();
      // The backend writes the AI summary of reasons in the background; look again shortly.
      for (const delay of [8000, 20000]) {
        setTimeout(() => void loadGroup(token, data.question.id).catch(() => undefined), delay);
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
        await api.submitRevision(token, data.question.id, answer / 100, why);
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
    () => ({ token, state, data, questions, group, groupLocked, settings, track, own, refresh, selectQuestion, submitAnswer, submitRevision, saveSettings }),
    [token, state, data, questions, group, groupLocked, settings, track, own, refresh, selectQuestion, submitAnswer, submitRevision, saveSettings],
  );
}

export type Expert = ReturnType<typeof useExpert>;
