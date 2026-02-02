"use client";

type LinkItem = {
  label: string;
  href: string;
};

type Collaborator = {
  name: string;
  href?: string;
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
  { name: "Jerry de Vos", href: "https://jerrydevos.nl/" },
  { name: "Aadjan Van Der Helm", href: "https://mahanmehrvarz.name/promptingrealities/#" },
  { name: "Martin Havranek" },
  { name: "Diego Viero", href: "https://github.com/Diego-Viero" },
  { name: "Dave Murray-Rust", href: "https://dave.murray-rust.org/" },
];

const logos: Logo[] = [
  { src: "/logos/logo-01.png", alt: "AI Futures Lab", href: "#" },
  { src: "/logos/AIFUTURESLAB.png", alt: "Design United", href: "#" },
  { src: "/logos/DDW.png", alt: "Dutch Design Week", href: "#" },
  { src: "/logos/TUDelft_logo_black.png", alt: "TU Delft", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-12 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr_2fr] lg:gap-16">
          {/* Links and Associations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Links and Associations
            </h3>
            <ul className="space-y-2.5">
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
            <ul className="space-y-2.5">
              {collaborators.map((collab) => (
                <li key={collab.name}>
                  {collab.href && collab.href !== "#" ? (
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

          {/* Logos */}
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-6 lg:gap-8">
              {logos.map((logo) => (
                <a
                  key={logo.alt}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center transition-opacity hover:opacity-70"
                  title={logo.alt}
                >
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className="h-8 w-auto object-contain lg:h-10"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t-2 border-[var(--card-shell)]/20 pt-6 sm:flex-row">
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
