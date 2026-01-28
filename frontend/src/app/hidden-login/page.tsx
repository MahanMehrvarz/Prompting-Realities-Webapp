"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TOKEN_STORAGE_KEY = "pr-auth-token";

export default function HiddenLoginPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    
    // Check for redirect parameter in URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      if (redirect) {
        setRedirectPath(redirect);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    // Check for existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && isMounted) {
        setAuthToken(session.access_token);
        window.localStorage.setItem(TOKEN_STORAGE_KEY, session.access_token);
        if (session.user.email) {
          window.localStorage.setItem("pr-auth-email", session.user.email);
        }
        // Redirect to main page or specified redirect path
        if (redirectPath) {
          router.push(redirectPath);
        } else {
          router.push("/");
        }
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      
      if (session) {
        setAuthToken(session.access_token);
        window.localStorage.setItem(TOKEN_STORAGE_KEY, session.access_token);
        if (session.user.email) {
          window.localStorage.setItem("pr-auth-email", session.user.email);
        }
        // Redirect to main page or specified redirect path
        if (redirectPath) {
          router.push(redirectPath);
        } else {
          router.push("/");
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [redirectPath, router]);

  const handleAuthSubmit = async () => {
    setAuthError(null);
    setAuthSuccess(false);
    
    if (!authEmail || !authEmail.includes('@')) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    
    if (!authPassword || authPassword.length < 6) {
      setAuthError("Password must be at least 6 characters long.");
      return;
    }
    
    if (authMode === "signin") {
      // Sign in with email and password
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        
        if (error) throw error;
        
        // Password sign-in is immediate, the auth state change listener will handle the redirect
      } catch (error: any) {
        logger.error("Password sign-in error:", error);
        setAuthError(error?.message || "Invalid email or password. Please try again.");
      }
    } else {
      // Sign up with email and password
      try {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            emailRedirectTo: redirectPath 
              ? `${window.location.origin}${redirectPath}`
              : window.location.origin,
          },
        });
        
        if (error) throw error;
        
        // Check if email confirmation is required
        if (data.user && !data.session) {
          setAuthSuccess(true);
          setAuthError(null);
        }
        // If session exists, user is automatically signed in (email confirmation disabled)
        // The auth state change listener will handle the redirect
      } catch (error: any) {
        logger.error("Sign up error:", error);
        setAuthError(error?.message || "Unable to create account. Please try again.");
      }
    }
  };

  if (!hydrated) {
    return null;
  }

  if (authToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05c46b] p-6 text-[var(--foreground)]">
        <div className="card-panel max-w-md w-full space-y-4 p-6">
          <p className="text-center text-sm text-[var(--ink-muted)]">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05c46b] p-6 text-[var(--foreground)]">
      <div className="card-panel max-w-md w-full space-y-4 p-6">
        <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em] text-[var(--card-fill)]">
          Prompting Realities
        </p>
        <h1 className="text-2xl font-semibold text-[var(--ink-dark)]">
          {authMode === "signin" ? "Sign in with password" : "Create account"}
        </h1>
        {redirectPath && (
          <p className="text-sm text-[var(--ink-muted)]">
            {authMode === "signin" ? "Sign in to access the chat session" : "Create an account to continue"}
          </p>
        )}
        {authError && (
          <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#ff6b6b] bg-[#ffe6e6] px-4 py-3 text-sm text-[#4a0000]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{authError}</span>
          </div>
        )}
        {authSuccess && (
          <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#00d692] bg-[#e6fff5] px-4 py-3 text-sm text-[#013022]">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>Account created! Please check your email to confirm your account.</span>
          </div>
        )}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="email@example.com"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAuthSubmit();
              }
            }}
            disabled={authSuccess}
            className="w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white px-4 py-3 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <input
            type="password"
            placeholder="Password (min. 6 characters)"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAuthSubmit();
              }
            }}
            disabled={authSuccess}
            className="w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white px-4 py-3 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={handleAuthSubmit}
            disabled={authSuccess || !authEmail || !authPassword}
            className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-3 text-sm font-semibold text-[var(--card-fill)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {authSuccess 
              ? "Check your email" 
              : authMode === "signin" 
                ? "Sign in" 
                : "Create account"}
          </button>
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--ink-muted)]">
            <span>
              {authMode === "signin" ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "signin" ? "signup" : "signin");
                setAuthError(null);
                setAuthSuccess(false);
              }}
              className="underline hover:text-[var(--foreground)]"
            >
              {authMode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
          <p className="text-xs text-[var(--ink-muted)] text-center pt-2">
            <a href="/" className="underline hover:text-[var(--foreground)]">
              Back to magic link login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
