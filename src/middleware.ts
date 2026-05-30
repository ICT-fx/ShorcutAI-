import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, updateSession } from "@/lib/supabase/middleware";

// Pages reachable without a session.
const PUBLIC_PATHS = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  // Auth off (no Supabase configured) → don't lock anyone out (local/free path).
  if (!isSupabaseConfigured()) return NextResponse.next();

  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api");

  // Unauthenticated page request → redirect to login. API routes enforce their
  // own 401 (better than a redirect for fetch()).
  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Run on everything except Next internals, static files, and the media upload
  // endpoint. Middleware buffers the request body with a ~10MB cap, which
  // truncates large video uploads and breaks multipart parsing; that route
  // enforces its own auth via requireProject, so it doesn't need the middleware.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/projects/[^/]+/media|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)",
  ],
};
