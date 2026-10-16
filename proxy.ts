import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get("session")?.value;
  const session = await decrypt(token);
  const isLogin = path === "/login";

  if (!isLogin && !session) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  if (isLogin && session) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)"],
};
