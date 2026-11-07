/**
 * The offline demo backend over HTTP, for browser-side actions when a page fell back to demo data.
 * Same paths and responses as the real API (see lib/server/mock-backend.ts). Only enabled when the
 * demo fallback or mock mode is on.
 */
import { DEMO_FALLBACK, USE_MOCK } from '@/lib/api';
import { mockRequest } from '@/lib/server/mock-backend';

const enabled = () => DEMO_FALLBACK || USE_MOCK;

async function handle(request: Request, ctx: RouteContext<'/api/demo/[...path]'>, method: 'GET' | 'POST' | 'PATCH') {
  if (!enabled()) return Response.json({ detail: 'Demo backend is off' }, { status: 404 });
  const { path } = await ctx.params;
  const search = new URL(request.url).search;
  const body = method !== 'GET' ? await request.json().catch(() => null) : undefined;
  const res = mockRequest(method, `/${path.map(encodeURIComponent).join('/')}${search}`, body);
  return Response.json(res.body, { status: res.status });
}

export function GET(request: Request, ctx: RouteContext<'/api/demo/[...path]'>) {
  return handle(request, ctx, 'GET');
}

export function POST(request: Request, ctx: RouteContext<'/api/demo/[...path]'>) {
  return handle(request, ctx, 'POST');
}

export function PATCH(request: Request, ctx: RouteContext<'/api/demo/[...path]'>) {
  return handle(request, ctx, 'PATCH');
}
