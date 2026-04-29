import { NextRequest, NextResponse } from "next/server";

/**
 * Handles Supabase email confirmation & magic-link callbacks.
 *
 * Supabase (PKCE flow) redirects to:
 *   /auth/confirm?token_hash=<hash>&type=<signup|magiclink|recovery>&next=<path>
 *
 * We redirect to the root page with hash params so the Supabase JS client
 * (which holds the PKCE code_verifier in localStorage) can exchange the token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  const origin = request.nextUrl.origin;

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/?error=missing_token", origin));
  }

  // Forward token params to the client page via hash fragment.
  // The Supabase JS SDK on the client automatically processes these.
  const redirectUrl = new URL(next, origin);
  redirectUrl.searchParams.set("token_hash", token_hash);
  redirectUrl.searchParams.set("type", type);

  return NextResponse.redirect(redirectUrl);
}
