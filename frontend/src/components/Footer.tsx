"use client";

import Image from "next/image";

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
  width?: number;
  height?: number;
};

const links: LinkItem[] = [
  { label: "Project GitHub", href: "#" },
  { label: "4TU.design United", href: "#" },
  { label: "Dutch design week 2024", href: "#" },
];

const collaborators: Collaborator[] = [
  { name: "Jerry de Vos", href: "#" },
  { name: "Aadjan Van Der Helm", href: "#" },
  { name: "Martin Havranek", href: "#" },
];

const logos: Logo[] = [
  { src: "/logos/aifutures-lab.svg", alt: "AI Futures Lab", width: 80, height: 48 },
  { src: "/logos/design-united.svg", alt: "Design United", width: 60, height: 48 },
  { src: "/logos/dutch-design-week.svg", alt: "Dutch Design Week", width: 80, height: 48 },
  { src: "/logos/tu-delft.svg", alt: "TU Delft", width: 100, height: 40 },
];

export function Footer() {
  return (
    <footer className="border-t-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
          {/* Links and Associations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Links and Associations
            </h3>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Collaborators */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]">
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
                      className="text-sm font-medium text-[var(--ink-dark)] transition hover:text-[var(--accent-green)] hover:underline"
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
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Partners
            </h3>
            <div className="flex flex-wrap items-center gap-6 lg:gap-8">
              {logos.map((logo) => (
                <div key={logo.alt} className="flex items-center">
                  {logo.href ? (
                    <a
                      href={logo.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-80 transition hover:opacity-100"
                    >
                      <Image
                        src={logo.src}
                        alt={logo.alt}
                        width={logo.width || 80}
                        height={logo.height || 40}
                        className="h-auto max-h-12 w-auto object-contain"
                      />
                    </a>
                  ) : (
                    <Image
                      src={logo.src}
                      alt={logo.alt}
                      width={logo.width || 80}
                      height={logo.height || 40}
                      className="h-auto max-h-12 w-auto object-contain opacity-80"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t-2 border-[var(--card-shell)]/20 pt-6 sm:flex-row">
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
