import type { ReactNode } from "react";

/**
 * Section titles used to be 10px pill chips — smaller than the body text they
 * introduced, which inverted the hierarchy. They are real headings now, with the
 * accent bar carrying the brutalist vocabulary the chip used to.
 */
function SectionTitle({ title, as }: { title: string; as: "h1" | "h2" }) {
  // 1.75rem for h2, not 2rem: the 4-col heading column is ~368px and
  // "Why low-threshold" wraps at its hyphen above that. The h1 gets a wider
  // column (see headingSpan), so it can afford to be larger.
  const className =
    as === "h1"
      ? "text-3xl font-black uppercase leading-[1.05] tracking-tight text-[var(--ink-dark)] sm:text-4xl lg:text-[2.75rem]"
      : "text-2xl font-black uppercase leading-[1.1] tracking-tight text-[var(--ink-dark)] lg:text-[1.75rem]";

  return (
    <div className="space-y-3">
      <span className="block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
      {as === "h1" ? (
        <h1 className={className}>{title}</h1>
      ) : (
        <h2 className={className}>{title}</h2>
      )}
    </div>
  );
}

export function SectionPanel({
  id,
  title,
  children,
  /** Full-width content placed above the split — a lead image, say. */
  above,
  /** Full-width content placed under the split — grids, images, stat rows. */
  below,
  /**
   * "split" puts the heading in its own column beside the prose, so the text
   * fills the panel at a readable measure instead of stopping mid-panel.
   * "stacked" is for sections whose body is itself full-width.
   */
  layout = "split",
  as = "h2",
  /** Columns (of 12) given to the heading. A larger h1 needs more room. */
  headingSpan = 4,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  above?: ReactNode;
  below?: ReactNode;
  layout?: "split" | "stacked";
  as?: "h1" | "h2";
  headingSpan?: 4 | 5;
}) {
  if (layout === "stacked") {
    return (
      <section id={id} className="card-panel scroll-mt-24 space-y-8 p-6 lg:p-10">
        {above}
        <SectionTitle title={title} as={as} />
        {children}
      </section>
    );
  }

  // Written out rather than interpolated — Tailwind only ships classes it can
  // see as complete strings at build time.
  const headingCols = headingSpan === 5 ? "lg:col-span-5" : "lg:col-span-4";
  const bodyCols = headingSpan === 5 ? "lg:col-span-7" : "lg:col-span-8";

  return (
    <section id={id} className="card-panel scroll-mt-24 space-y-8 p-6 lg:p-10">
      {above}
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
        <div className={headingCols}>
          <SectionTitle title={title} as={as} />
        </div>
        <div className={`space-y-5 ${bodyCols}`}>{children}</div>
      </div>
      {below}
    </section>
  );
}
