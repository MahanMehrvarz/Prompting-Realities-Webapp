"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ListTabStrip({ listId }: { listId: string }) {
  const pathname = usePathname();
  const codesHref = `/admin/analysis/lists/${listId}/codes`;
  const listHref = `/admin/analysis/lists/${listId}`;
  const onCodes = pathname.startsWith(codesHref);

  return (
    <div className="flex gap-1 mb-6 border-b-[3px] border-[var(--card-shell)]">
      <Link
        href={listHref}
        className={`px-4 py-2 text-sm font-bold transition rounded-t-[10px] -mb-[3px] border-[3px] border-b-0 ${
          !onCodes
            ? "border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)]"
            : "border-transparent text-[var(--card-fill)]/70 hover:text-[var(--card-fill)]"
        }`}
      >
        LLM Things
      </Link>
      <Link
        href={codesHref}
        className={`px-4 py-2 text-sm font-bold transition rounded-t-[10px] -mb-[3px] border-[3px] border-b-0 ${
          onCodes
            ? "border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)]"
            : "border-transparent text-[var(--card-fill)]/70 hover:text-[var(--card-fill)]"
        }`}
      >
        Codes &amp; Quotations
      </Link>
    </div>
  );
}
