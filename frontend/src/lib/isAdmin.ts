"use client";

import { supabase } from "./supabase";

/**
 * Per-session admin-status cache.
 *
 * Admin membership is decided by the `admin_emails` table in Supabase. It does
 * not change during a session, so we answer once per email and cache the
 * result in `sessionStorage`. This removes a blocking Supabase round-trip
 * from every analysis-page mount effect.
 *
 * The cache is keyed by email so signing in as a different user in the same
 * tab still returns the correct answer.
 */

const CACHE_PREFIX = "pr-is-admin:";

function cacheGet(email: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + email);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function cacheSet(email: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + email, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export async function isAdmin(email: string): Promise<boolean> {
  if (!email) return false;
  const cached = cacheGet(email);
  if (cached !== null) return cached;

  const { data } = await supabase
    .from("admin_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  const result = !!data;
  cacheSet(email, result);
  return result;
}

export function clearAdminCache() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    for (const k of keys) window.sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
