import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
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
  };
}

function Block({ block }: { block: TutorialBlock }) {
  if (block.kind === "text") {
    return (
      <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
        {block.body}
      </p>
    );
  }

  if (block.kind === "list") {
    return (
      <ol className="space-y-2">
        {block.items.map((item, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm leading-relaxed text-[var(--foreground)] lg:text-base"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[2px] border-[var(--card-shell)] bg-[var(--accent-green)] font-mono text-[10px] font-black text-[var(--ink-dark)]">
              {i + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <figure className="space-y-2">
      {block.caption && (
        <figcaption className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          {block.caption}
        </figcaption>
      )}
      {/* Code stays scrollable inside its own box so the page itself never
          scrolls sideways on a phone. */}
      <div className="overflow-x-auto rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] shadow-[4px_4px_0_var(--shadow-deep)]">
        <pre className="p-4 text-[12px] leading-relaxed text-[var(--card-fill)] lg:text-[13px]">
          <code>{block.body}</code>
        </pre>
      </div>
    </figure>
  );
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
              <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                {tutorial.context}
              </p>
            </div>
          </div>

          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              What you need
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {tutorial.requirements.map((r) => (
                <li
                  key={r}
                  className="flex gap-2 text-sm leading-relaxed text-[var(--foreground)]"
                >
                  <span className="text-[var(--accent-green)]">▸</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Steps */}
        {tutorial.steps.map((step) => (
          <section key={step.marker} className="card-panel p-6 lg:p-10">
            <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] font-mono text-lg font-black text-[var(--ink-dark)]">
                    {step.marker}
                  </span>
                  <h2 className="text-xl font-black uppercase leading-tight tracking-tight text-[var(--ink-dark)] lg:text-2xl">
                    {step.title}
                  </h2>
                </div>
              </div>
              <div className="space-y-5 lg:col-span-8">
                {step.blocks.map((block, i) => (
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
