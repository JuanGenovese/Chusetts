import type { NextRequest } from "next/server";
import { updateSession } from "@/shared/infrastructure/auth/proxy-session";

/** Next 16 proxy (formerly middleware): refreshes the Supabase session and gates anonymous visitors. See proxy-session. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
