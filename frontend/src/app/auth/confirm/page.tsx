"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Handles Supabase email confirmation & magic-link callbacks (PKCE flow).
 *
 * Supabase redirects here with:
 *   /auth/confirm?token_hash=<hash>&type=<signup|magiclink|recovery|email>
 *
 * We call verifyOtp client-side so the session is created in the browser.
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as
      | "signup"
      | "magiclink"
      | "recovery"
      | "invite"
      | "email"
      | null;
    const next = searchParams.get("next") ?? "/";

    if (!tokenHash || !type) {
      setError("Invalid confirmation link.");
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          console.error("Auth confirm error:", verifyError.message);
          setError(
            verifyError.message.includes("expired")
              ? "This link has expired. Please request a new one."
              : "Unable to confirm. Please try again."
          );
          return;
        }
        // Session is now active — redirect
        router.replace(next);
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="card-panel max-w-md w-full space-y-4 p-6 text-center">
          <p className="text-sm text-[#4a0000]">{error}</p>
          <a
            href="/"
            className="inline-block text-sm underline text-[var(--ink-muted)] hover:text-[var(--foreground)]"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="card-panel max-w-md w-full p-6 text-center">
        <p className="text-sm text-[var(--ink-muted)]">Confirming...</p>
      </div>
    </div>
  );
}
