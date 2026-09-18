import { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { tutorials } from "@/lib/tutorials";

export const metadata: Metadata = {
  title: "Tutorials — Prompting Realities",
  description:
    "Step-by-step guides for building LLM-powered tangible interactions: wire a microcontroller to a language model and give a physical object a character it can answer for.",
};

export default function TutorialsPage() {
  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 lg:px-10">
        <section className="card-panel space-y-8 p-6 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-4">
              <div className="space-y-3">
                <span className="block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
                <h1 className="text-2xl font-black uppercase leading-[1.1] tracking-tight text-[var(--ink-dark)] lg:text-[1.75rem]">
                  Tutorials
                </h1>
              </div>
            </div>
            <div className="space-y-5 lg:col-span-8">
              <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
                Start-to-finish guides for building an LLM thing. Each one takes
                you from a bare board to an object you can hold a conversation
                with — the description, the schema, and the wiring in between.
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {tutorials.map((t) => (
              <article
                key={t.slug}
                className="flex flex-col gap-3 rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-5 shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_var(--shadow-deep)] lg:p-6"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="pill-chip">{t.duration}</span>
                  <span className="pill-chip">{t.level}</span>
                </div>
                <h2 className="text-xl font-black leading-tight text-[var(--ink-dark)]">
                  <Link href={`/tutorials/${t.slug}`} className="hover:underline decoration-2 underline-offset-4">
                    {t.title}
                  </Link>
                </h2>
                <p className="flex-1 text-sm leading-relaxed text-[var(--foreground)]">
                  {t.blurb}
                </p>
                <Link
                  href={`/tutorials/${t.slug}`}
                  className="mt-2 inline-flex items-center gap-2 self-start rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
                >
                  Start the tutorial →
                </Link>
              </article>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            More tutorials are on the way. If you would like this run as a
            hands-on workshop with your group,{" "}
            <a
              href="mailto:mahan.mehrvarz@hotmail.com?subject=Workshop%20Request%20-%20Prompting%20Realities"
              className="font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-2 transition hover:text-[var(--accent-green)]"
            >
              get in touch
            </a>
            .
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
