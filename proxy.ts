import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function proxy(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  // Protect everything except: login page, next internals, static assets, PWA files
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|workbox).*)",
  ],
};
