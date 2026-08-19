import { NextRequest, NextResponse } from "next/server";
import { hasSessionCookie, resolveAuthRedirect } from "@/lib/auth/route-gate";
import { buildContentSecurityPolicy } from "@/lib/csp";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce);

  const redirectTo = resolveAuthRedirect({
    pathname: request.nextUrl.pathname,
    hasSessionCookie: hasSessionCookie(request.cookies)
  });

  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  // Forward the nonce and the assembled policy on the request: server
  // components read `x-nonce` via headers(), and Next parses the CSP request
  // header to apply the nonce to its own framework scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/",
    "/(api|trpc)(.*)"
  ]
};
