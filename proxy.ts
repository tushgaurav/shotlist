import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

// Optimistic check only: it looks for a session cookie, not a valid session.
// Real authorization happens in lib/dal.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  const signIn = new URL("/sign-in", request.url);
  if (pathname !== "/") signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
