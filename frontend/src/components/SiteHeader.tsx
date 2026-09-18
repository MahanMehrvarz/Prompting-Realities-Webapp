"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type NavLink = { label: string; href: string; external?: boolean };

const navLinks: NavLink[] = [
  { label: "Projects", href: "/#projects" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Tutorials", href: "/tutorials" },
  { label: "Research", href: "/research" },
  {
    label: "GitHub",
    href: "https://github.com/MahanMehrvarz/PromptingRealities",
    external: true,
  },
];

export function SiteHeader() {
  const [hasSession, setHasSession] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Signed in, the button is a way back into the app rather than an invitation.
  const ctaLabel = hasSession ? "Control Hub" : "Log in";

  return (
    <header className="sticky top-0 z-40 border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[0_6px_0_var(--card-shell)]">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-10">
        <Link
          href="/"
          className="text-lg font-black uppercase tracking-[0.1em] text-[var(--ink-dark)] transition hover:text-[var(--ink-muted)] sm:text-2xl"
        >
          Prompting Realities
        </Link>

        {/* gap-2 is the mobile spacing between the CTA and the hamburger. From lg
            the hamburger is gone and this gap separates the nav group from the
            CTA, so it has to exceed the 24px gap between the links themselves. */}
        <div className="flex items-center gap-2 lg:gap-9">
          <nav className="hidden items-center gap-6 lg:flex">
            {navLinks.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[var(--ink-dark)] transition hover:text-[var(--ink-muted)] hover:underline decoration-2 underline-offset-4"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm font-semibold text-[var(--ink-dark)] transition hover:text-[var(--ink-muted)] hover:underline decoration-2 underline-offset-4"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {/* Stays outside the hamburger at every width. */}
          <Link
            href="/login"
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-xs font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)] sm:px-5 sm:text-sm"
          >
            {ctaLabel}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)] shadow-[3px_3px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 lg:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t-2 border-[var(--card-shell)]/20 bg-[var(--card-fill)] px-4 py-3 lg:hidden">
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-sm font-semibold text-[var(--ink-dark)]"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-sm font-semibold text-[var(--ink-dark)]"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
