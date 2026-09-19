"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Handles Supabase email confirmation & magic-link callbacks.
 *
 * The email links here with:
 *   /auth/confirm?token_hash=<hash>&type=<signup|magiclink|recovery|email>
 *
 * IMPORTANT — nothing is redeemed on mount. Microsoft Defender Safe Links
 * detonates the URL in a real, JS-executing headless browser before the
 * recipient ever clicks (auth logs: a 303 Login from a Microsoft IP with
 * referer /auth/confirm, ~80s ahead of the user, who then gets "One-time
 * token not found"). So the token is only redeemed from a click handler,
 * and only for a trusted event — a scanner that loads and runs the page
 * burns nothing.
 *
 * The implicit hash flow is exempt: by the time Supabase redirects here with
 * tokens in the fragment the one-time token is already spent, and the
 * fragment never leaves the browser.
 */
type OtpType = "signup" | "magiclink" | "recovery" | "invite" | "email";

const OTP_TYPES: OtpType[] = ["signup", "magiclink", "recovery", "invite", "email"];

function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const next = searchParams.get("next") ?? "/login";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = OTP_TYPES.includes(rawType as OtpType) ? (rawType as OtpType) : null;

  const handleVerifyError = (msg: string) => {
    console.error("Auth confirm error:", msg);
    setPending(false);
    setError(
      msg.includes("expired")
        ? "This link has expired. Please request a new one."
        : "Unable to confirm. Please try again."
    );
  };

  useEffect(() => {
    // Implicit hash fragment: /auth/confirm#access_token=...&refresh_token=...
    if (code || (tokenHash && type)) {
      setReady(true);
      return;
    }

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
  }, [code, tokenHash, type, next, router]);

  const confirm = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // A programmatic click from a scanner is untrusted; a real click,
    // including keyboard activation, is not.
    if (!event.nativeEvent.isTrusted || pending) return;
    setPending(true);
    setError(null);

    if (code) {
      const { error: err } = await supabase.auth.exchangeCodeForSession(code);
      if (err) return handleVerifyError(err.message);
      router.replace(next);
      return;
    }

    if (tokenHash && type) {
      const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (err) return handleVerifyError(err.message);
      router.replace(next);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="card-panel max-w-md w-full space-y-4 p-6 text-center">
          <p className="text-sm text-[#4a0000]">{error}</p>
          <a
            href="/login"
            className="inline-block text-sm underline text-[var(--ink-muted)] hover:text-[var(--foreground)]"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  if (ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="card-panel max-w-md w-full space-y-4 px-6 py-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--ink-dark)]">
            One last step
          </h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Press the button to finish signing in.
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-3 text-sm font-semibold text-[var(--card-fill)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Signing in..." : "Sign me in"}
          </button>
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
