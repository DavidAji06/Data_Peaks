import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Join } from "@/components/datapeaks/Join";
import { PhoneApp } from "@/components/datapeaks/PhoneApp";
import { SignIn } from "@/components/datapeaks/SignIn";
import { clearJoinToken, clearToken, getToken, takeJoinToken } from "@/lib/api";
import type { Lang } from "@/components/datapeaks/shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ACAPS expert panel app" },
      {
        name: "description",
        content:
          "ACAPS expert panel mobile app: experts answer short questions on emerging humanitarian crises in under 2 minutes.",
      },
      { property: "og:title", content: "ACAPS expert panel app" },
      {
        property: "og:description",
        content:
          "Experts answer short questions on emerging humanitarian crises in under 2 minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [lang, setLang] = useState<Lang>("en");
  // An activation link (?join=) shows the join screen first; the URL is read on the client only.
  const [joinToken, setJoinToken] = useState<string | null | undefined>(undefined);
  // The signed-in expert (from ?token= or this device), null = show the sign-in screen
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setJoinToken(takeJoinToken());
    setTokenState(getToken());
  }, []);
  const signOut = useCallback((why?: string) => {
    clearToken();
    setNotice(why ?? null);
    setTokenState(null);
  }, []);
  if (joinToken === undefined || token === undefined)
    return <div className="min-h-screen bg-muted" />;

  return (
    <div className="min-h-screen bg-muted sm:py-8">
      {joinToken ? (
        <Join
          joinToken={joinToken}
          lang={lang}
          setLang={setLang}
          onDone={() => {
            clearJoinToken();
            setJoinToken(null);
            setTokenState(getToken());
          }}
        />
      ) : token ? (
        <PhoneApp key={token} lang={lang} setLang={setLang} onSignOut={signOut} />
      ) : (
        <SignIn lang={lang} setLang={setLang} notice={notice} />
      )}
    </div>
  );
}
