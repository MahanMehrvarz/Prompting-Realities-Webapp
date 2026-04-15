"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { useAnalysisBreadcrumb } from "./AnalysisBreadcrumbContext";

export default function AnalysisShell({
  children,
  headerRight,
  fullBleed = false,
}: {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  fullBleed?: boolean;
}) {
  const { crumbs } = useAnalysisBreadcrumb();

  return (
    <div className={`${fullBleed ? "h-screen" : "min-h-screen"} bg-[var(--background)] text-[var(--foreground)] flex flex-col`}>
      {/* Persistent header */}
      <header className="sticky top-0 z-30 border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[0_4px_0_var(--card-shell)]">
        <div className="w-full max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Left: nav + breadcrumb */}
          <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
            <Link href="/" className="text-[var(--ink-muted)] hover:text-[var(--ink-dark)] transition flex-shrink-0">
              Dashboard
            </Link>
            <span className="text-[var(--ink-muted)] flex-shrink-0">/</span>
            <Link
              href="/admin/analysis"
              className="flex items-center gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-dark)] transition flex-shrink-0"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span className="font-semibold">Analysis</span>
            </Link>
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--ink-muted)] flex-shrink-0">/</span>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-[var(--ink-muted)] hover:text-[var(--ink-dark)] transition truncate max-w-[200px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[var(--ink-dark)] font-semibold truncate max-w-[200px]">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Right: page-specific actions */}
          {headerRight && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerRight}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      {fullBleed ? (
        <div className="flex-1 flex flex-col overflow-hidden w-full">
          {children}
        </div>
      ) : (
        <main className="flex-1 w-full max-w-screen-2xl mx-auto px-6 py-8">
          {children}
        </main>
      )}
    </div>
  );
}
