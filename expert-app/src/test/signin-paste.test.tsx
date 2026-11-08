import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return { ...real, api: { ...real.api, requestLoginLink: vi.fn().mockResolvedValue({}) }, setToken: vi.fn() };
});

import { setToken } from "@/lib/api";
import { SignIn } from "@/components/datapeaks/SignIn";

function withUserAgent(ua: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
}

async function sendEmail() {
  render(<SignIn lang="en" setLang={() => {}} />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "expert@example.org" } });
  fireEvent.click(screen.getByText("Email me a sign-in link"));
  await screen.findByText("Check your email");
}

describe("SignIn paste-link fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is hidden in a normal browser", async () => {
    withUserAgent("Mozilla/5.0 Chrome/140");
    await sendEmail();
    expect(screen.queryByText(/paste it here/)).not.toBeInTheDocument();
  });

  it("signs in with a pasted link inside the Android app", async () => {
    withUserAgent("Mozilla/5.0 Chrome/140 DataPeaksApp/1.0");
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, replace } as Location);
    await sendEmail();
    const box = screen.getByLabelText(/paste it here/);
    fireEvent.change(box, { target: { value: "not a link" } });
    fireEvent.click(screen.getByText("Sign in with this link"));
    expect(await screen.findByText(/doesn't look like the sign-in link/)).toBeInTheDocument();

    fireEvent.change(box, { target: { value: "https://data-peaks-expert.onrender.com/?token=abc123DEF_-xyz" } });
    fireEvent.click(screen.getByText("Sign in with this link"));
    await waitFor(() => expect(setToken).toHaveBeenCalledWith("abc123DEF_-xyz"));
    expect(replace).toHaveBeenCalledWith("/");
  });
});
