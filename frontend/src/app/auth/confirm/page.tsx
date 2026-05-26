"use client";

import { Suspense, useEffect, useState } from "react";
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
function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = searchParams.get("next") ?? "/";

    const handleVerifyError = (msg: string) => {
      console.error("Auth confirm error:", msg);
      setError(
        msg.includes("expired")
          ? "This link has expired. Please request a new one."
          : "Unable to confirm. Please try again."
      );
    };

    // Flow A — PKCE code exchange: /auth/confirm?code=...
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) return handleVerifyError(err.message);
        router.replace(next);
      });
      return;
    }

    // Flow B — OTP token_hash: /auth/confirm?token_hash=...&type=...
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as
      | "signup"
      | "magiclink"
      | "recovery"
      | "invite"
      | "email"
      | null;
    if (tokenHash && type) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: err }) => {
        if (err) return handleVerifyError(err.message);
        router.replace(next);
      });
      return;
    }

    // Flow C — implicit hash fragment: /auth/confirm#access_token=...&refresh_token=...
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      const hashError = hash.get("error_description") || hash.get("error");
      if (hashError) {
        handleVerifyError(hashError);
        return;
      }
      if (access && refresh) {
        supabase.auth
          .setSession({ access_token: access, refresh_token: refresh })
          .then(({ error: err }) => {
            if (err) return handleVerifyError(err.message);
            router.replace(next);
          });
        return;
      }
    }

    setError("Invalid confirmation link.");
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

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="card-panel max-w-md w-full p-6 text-center">
            <p className="text-sm text-[var(--ink-muted)]">Confirming...</p>
          </div>
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  );
}
