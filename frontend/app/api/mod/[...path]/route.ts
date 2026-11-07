/**
 * Moderator actions from the browser (approve/reject an alert, resolve a question, AI summary, panel invite) go through here,
 * so the moderator key stays on the server: it is read from MODERATOR_KEY (no NEXT_PUBLIC_ prefix) and
 * added as X-Moderator-Key. Only these four action paths are forwarded; this is not a general proxy.
 * Note: this route itself has no sign-in yet, like the rest of /mod (see HANDOFF.md).
 */
import 'server-only';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const MODERATOR_KEY = process.env.MODERATOR_KEY ?? '';
const TIMEOUT_MS = 20000; // Invites wait for the SMTP send

const ALLOWED = [
  /^alerts\/[^/]+\/decision$/,
  /^moderator\/questions\/[^/]+\/resolve$/,
  /^moderator\/questions\/[^/]+\/summarise$/,
  /^moderator\/panel-invites$/,
  /^moderator\/panel-invites\/[^/]+\/resend$/,
  /^moderator\/panel-memberships\/\d+\/decision$/,
];

export async function POST(request: Request, ctx: RouteContext<'/api/mod/[...path]'>) {
  const { path } = await ctx.params;
  const joined = path.map(encodeURIComponent).join('/');
  if (!API_URL || !ALLOWED.some((re) => re.test(joined))) {
    return Response.json({ detail: 'Not found' }, { status: 404 });
  }
  const body = await request.text();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/${joined}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', ...(MODERATOR_KEY ? { 'x-moderator-key': MODERATOR_KEY } : {}) },
      body,
    });
  } catch {
    // 502 tells the browser the API is unreachable; client-api maps it to a network error (keep input, retry).
    return Response.json({ detail: 'Could not reach the server' }, { status: 502 });
  }
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
