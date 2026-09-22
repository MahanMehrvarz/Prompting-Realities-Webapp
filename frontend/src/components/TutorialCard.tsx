import Link from "next/link";
import type { Tutorial } from "@/lib/tutorials";

/**
 * Landscape card: image on the left, text on the right, one per row. A tutorial
 * has more to say than a project card does — duration, level, a summary — and
 * stacking that under a 16:9 image made a tall portrait block with a lot of
 * empty space beside it.
 */
export function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_var(--shadow-deep)] sm:flex-row">
      <Link
        href={`/tutorials/${tutorial.slug}`}
        className="relative block shrink-0 border-b-[3px] border-[var(--card-shell)] sm:w-[46%] sm:border-b-0 sm:border-r-[3px]"
      >
        {/* Fixed ratio on mobile where it sits above the text; on wider screens
            it stretches to whatever height the text column needs. */}
        <div className="relative aspect-[16/9] w-full sm:h-full sm:aspect-auto">
          <img
            src={tutorial.image}
            alt={tutorial.imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5 lg:p-7">
        <div className="flex flex-wrap gap-2">
          <span className="pill-chip">{tutorial.duration}</span>
          <span className="pill-chip">{tutorial.level}</span>
        </div>

        <h3 className="text-xl font-black leading-tight text-[var(--ink-dark)] lg:text-2xl">
          <Link
            href={`/tutorials/${tutorial.slug}`}
            className="decoration-2 underline-offset-4 hover:underline"
          >
            {tutorial.title}
          </Link>
        </h3>

        <p className="flex-1 text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
          {tutorial.blurb}
        </p>

        <Link
          href={`/tutorials/${tutorial.slug}`}
          className="mt-1 inline-flex items-center gap-2 self-start rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2.5 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
        >
          Start the tutorial →
        </Link>
      </div>
    </article>
  );
}
