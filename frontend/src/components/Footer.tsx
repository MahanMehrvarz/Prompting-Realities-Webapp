"use client";

type Logo = {
  src: string;
  alt: string;
  href?: string;
};

const logos: Logo[] = [
  { src: "/logos/logo-01.png", alt: "AI Futures Lab" },
  { src: "/logos/AIFUTURESLAB.png", alt: "Design United" },
  { src: "/logos/DDW.png", alt: "Dutch Design Week" },
  { src: "/logos/TUDelft_logo_black.png", alt: "TU Delft" },
];

export function Footer() {
  return (
    <footer className="border-t-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-12 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:gap-12">
          {/* Links */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Links
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="/about"
                  className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline decoration-2 underline-offset-2"
                >
                  About Prompting Realities
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/MahanMehrvarz/PromptingRealities"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline decoration-2 underline-offset-2"
                >
                  Project GitHub
                </a>
              </li>
            </ul>
            <a
              href="mailto:mahan.mehrvarz@hotmail.com?subject=Workshop%20Request%20-%20Prompting%20Realities"
              className="mt-4 inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
            >
              Request a Workshop
            </a>
          </div>

          {/* Partners */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Partners
            </h3>
            <div className="flex items-center gap-6">
              {logos.map((logo) => (
                <img
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  title={logo.alt}
                  className="h-10 w-auto object-contain opacity-60"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t-2 border-[var(--card-shell)]/20 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-[var(--ink-muted)]">
              © {new Date().getFullYear()} Prompting Realities. All rights reserved.
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              For questions and inquiries, contact{" "}
              <a
                href="mailto:mahan.mehrvarz@hotmail.com"
                className="underline underline-offset-2 transition hover:text-[var(--ink-dark)]"
              >
                Mahan Mehrvarz
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
