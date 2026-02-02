"use client";

type LinkItem = {
  label: string;
  href: string;
};

type Collaborator = {
  name: string;
  href?: string;
};

type Publication = {
  title: string;
  href: string;
};

type Logo = {
  src: string;
  alt: string;
  href?: string;
};

const links: LinkItem[] = [
  { label: "Project GitHub", href: "https://github.com/MahanMehrvarz/PromptingRealities" },
  { label: "4TU.design United", href: "https://www.4tu.nl/du/projects/Prompting-Realities/" },
  { label: "Dutch design week 2024", href: "https://ddw.nl/en/programme/13171/prompting-realities" },
];

const collaborators: Collaborator[] = [
  { name: "Dave Murray-Rust", href: "https://dave.murray-rust.org/" },
  { name: "Jerry de Vos", href: "https://jerrydevos.nl/" },
  { name: "Aadjan Van Der Helm", href: "https://mahanmehrvarz.name/promptingrealities/#" },
  { name: "Martin Havranek" },
  { name: "Diego Viero", href: "https://github.com/Diego-Viero" },
];

const publications: Publication[] = [
  { title: "Prompting Realities: Exploring the Potentials of Prompting for Tangible Artifacts (CHItaly '25)", href: "https://doi.org/10.1145/3750069.3750089" },
  { title: "Prompting Realities: Reappropriating Tangible Artifacts Through Conversation (interactions)", href: "https://doi.org/10.1145/3742782" },
];

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
        {/* Main content grid */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {/* Links and Associations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Links and Associations
            </h3>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline decoration-2 underline-offset-2"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Collaborators */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Collaborators
            </h3>
            <ul className="space-y-2">
              {collaborators.map((collab) => (
                <li key={collab.name}>
                  {collab.href ? (
                    <a
                      href={collab.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline decoration-2 underline-offset-2"
                    >
                      {collab.name}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-[var(--ink-dark)]">
                      {collab.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Publications */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Publications
            </h3>
            <ul className="space-y-2">
              {publications.map((pub) => (
                <li key={pub.href}>
                  <a
                    href={pub.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline decoration-2 underline-offset-2"
                  >
                    {pub.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Logos */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Partners
            </h3>
            <div className="flex flex-wrap items-center gap-5">
              {logos.map((logo) => (
                <img
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  title={logo.alt}
                  className="h-9 w-auto object-contain"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Contact and Workshop CTA */}
        <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white/60 px-6 py-5 sm:flex-row sm:items-center">
          <p className="text-sm text-[var(--ink-dark)]">
            For questions and inquiries, please contact{" "}
            <a
              href="mailto:mahan.mehrvarz@hotmail.com"
              className="font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-2 transition hover:text-[var(--accent-green)]"
            >
              Mahan Mehrvarz
            </a>
          </p>
          <a
            href="mailto:mahan.mehrvarz@hotmail.com?subject=Workshop%20Request%20-%20Prompting%20Realities"
            className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2.5 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
          >
            Request a Workshop
          </a>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t-2 border-[var(--card-shell)]/20 pt-6 sm:flex-row">
          <p className="text-xs text-[var(--ink-muted)]">
            © {new Date().getFullYear()} Prompting Realities. All rights reserved.
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            A research project exploring AI-mediated design interactions.
          </p>
        </div>
      </div>
    </footer>
  );
}
