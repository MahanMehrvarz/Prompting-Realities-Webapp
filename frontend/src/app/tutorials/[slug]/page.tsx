import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { CodeBlock } from "@/components/CodeBlock";
import { RichText } from "@/components/RichText";
import { getTutorial, tutorials, type TutorialBlock } from "@/lib/tutorials";

export function generateStaticParams() {
  return tutorials.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) return { title: "Tutorial — Prompting Realities" };
  return {
    title: `${tutorial.title} — Prompting Realities`,
    description: tutorial.blurb,
    openGraph: {
      title: `${tutorial.title} — Prompting Realities`,
      description: tutorial.blurb,
      images: [tutorial.image],
    },
  };
}

function Figure({
  src,
  alt,
  caption,
  maxWidth,
}: {
  src: string;
  alt: string;
  caption?: string;
  maxWidth?: number;
}) {
  return (
    <figure
      className="space-y-2"
      // min(100%, Npx): cap at the image's natural width so it is never
      // upscaled, but never wider than the column either.
      style={maxWidth ? { maxWidth: `min(100%, ${maxWidth}px)` } : undefined}
    >
      {/* Unframed: these are documentation screenshots, many with their own
          window chrome and white backgrounds, so the site's stroke-and-shadow
          frame was drawing a box around a box. */}
      <img src={src} alt={alt} loading="lazy" className="block h-auto w-full" />
      {caption && (
        <figcaption className="text-xs italic text-[var(--ink-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Block({ block }: { block: TutorialBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
          <RichText body={block.body} />
        </p>
      );

    case "subheading":
      return (
        <h3 className="pt-2 text-base font-black text-[var(--ink-dark)] lg:text-lg">
          {block.body}
        </h3>
      );

    case "numbered":
      return (
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[2px] border-[var(--card-shell)] bg-[var(--accent-green)] font-mono text-[11px] font-black text-[var(--ink-dark)]">
            {block.n}
          </span>
          <p className="min-w-0 text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            <RichText body={block.body} />
          </p>
        </div>
      );

    case "list": {
      const ordered = block.ordered !== false;
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm leading-relaxed text-[var(--foreground)] lg:text-base"
            >
              <span
                aria-hidden="true"
                className={
                  ordered
                    ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[2px] border-[var(--card-shell)] bg-white font-mono text-[10px] font-black text-[var(--ink-dark)]"
                    : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]"
                }
              >
                {ordered ? i + 1 : null}
              </span>
              <span>
                <RichText body={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    }

    case "code":
      return <CodeBlock body={block.body} caption={block.caption} />;

    case "image":
      return (
        <Figure
          src={block.src}
          alt={block.alt}
          caption={block.caption}
          maxWidth={block.maxWidth}
        />
      );

    case "callout":
      return (
        <div className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)]/15 p-5">
          <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-dark)]">
            {block.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            <RichText body={block.body} />
          </p>
        </div>
      );
  }
}

export default async function TutorialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) notFound();

  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 lg:px-10">
        {/* Intro */}
        <section className="card-panel space-y-8 p-6 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
            <div className="space-y-3 lg:col-span-5">
              <span className="block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
              <h1 className="text-3xl font-black uppercase leading-[1.05] tracking-tight text-[var(--ink-dark)] sm:text-4xl lg:text-[2.75rem]">
                {tutorial.title}
              </h1>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="pill-chip">{tutorial.duration}</span>
                <span className="pill-chip">{tutorial.level}</span>
              </div>
            </div>
            <div className="space-y-5 lg:col-span-7">
              <p className="text-base font-semibold leading-relaxed text-[var(--ink-dark)] lg:text-lg">
                {tutorial.summary}
              </p>

              <div className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-white p-5">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Requirements
                </h2>
                <ul className="mt-3 space-y-2">
                  {tutorial.requirements.map((r) => (
                    <li
                      key={r}
                      className="flex gap-2 text-sm leading-relaxed text-[var(--foreground)]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]"
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                {tutorial.context}
              </p>
            </div>
          </div>

          {/* On this page — the source page opens with this, and it doubles as
              a progress map on a long document. */}
          <nav
            aria-label="On this page"
            className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-white p-5"
          >
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              On this page
            </h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {tutorial.sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex items-baseline gap-2 text-sm font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-4 transition [overflow-wrap:anywhere] hover:text-[var(--accent-green)]"
                  >
                    {s.marker && (
                      <span className="font-mono text-[var(--ink-muted)]">
                        {s.marker}
                      </span>
                    )}
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </section>

        {/* Sections, in the source page's own order */}
        {tutorial.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="card-panel scroll-mt-24 p-6 lg:p-10"
          >
            <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-4">
                <div className="flex min-w-0 items-start gap-3 lg:sticky lg:top-28">
                  {section.marker && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] font-mono text-lg font-black text-[var(--ink-dark)]">
                      {section.marker}
                    </span>
                  )}
                  <h2 className="min-w-0 text-lg font-black uppercase leading-tight tracking-tight text-[var(--ink-dark)] [overflow-wrap:anywhere] lg:text-xl">
                    {section.title}
                  </h2>
                </div>
              </div>
              <div className="space-y-5 lg:col-span-8">
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* Resources */}
        <section className="card-panel space-y-5 p-6 lg:p-10">
          <div className="space-y-3">
            <span className="block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
            <h2 className="text-2xl font-black uppercase leading-[1.1] tracking-tight text-[var(--ink-dark)] lg:text-[1.75rem]">
              Resources
            </h2>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tutorial.resources.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-4 transition hover:text-[var(--accent-green)]"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-6 py-3 text-sm font-semibold text-[var(--ink-dark)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              Open the Control Hub →
            </Link>
            <Link
              href="/tutorials"
              className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-6 py-3 text-sm font-semibold text-[var(--foreground)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              All tutorials
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
