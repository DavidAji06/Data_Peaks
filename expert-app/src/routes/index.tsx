import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Join } from "@/components/datapeaks/Join";
import { PhoneApp } from "@/components/datapeaks/PhoneApp";
import { clearJoinToken, takeJoinToken } from "@/lib/api";
import type { Lang } from "@/components/datapeaks/shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ACAPS expert panel app" },
      { name: "description", content: "ACAPS expert panel mobile app: experts answer short questions on emerging humanitarian crises in under 2 minutes." },
      { property: "og:title", content: "ACAPS expert panel app" },
      { property: "og:description", content: "Experts answer short questions on emerging humanitarian crises in under 2 minutes." },
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
  useEffect(() => setJoinToken(takeJoinToken()), []);
  if (joinToken === undefined) return <div className="min-h-screen bg-muted" />;
  return (
    <div className="min-h-screen bg-muted sm:py-8">
      {joinToken ? (
        <Join joinToken={joinToken} lang={lang} setLang={setLang} onDone={() => { clearJoinToken(); setJoinToken(null); }} />
      ) : (
        <PhoneApp lang={lang} setLang={setLang} />
      )}
    </div>
  );
}
