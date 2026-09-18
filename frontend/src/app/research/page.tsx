import { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { ImageGallery } from "@/components/ImageGallery";
import { ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Research — Prompting Realities",
  description:
    "The research-through-design inquiry behind Prompting Realities: positioning, publications, exhibition documentation and contributors.",
};

const galleryImages = [
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20241018_123456.jpg",
    alt: "DDW 2024 Exhibition",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20241023_142525.jpg",
    alt: "Design United Dialogues",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/Figure02.jpg",
    alt: "Figure 02 — System overview",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/Figure04.jpg",
    alt: "Figure 04 — Interaction model",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/in-action.jpg",
    alt: "In action — User tryouts",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240828_134721.jpg",
    alt: "Process — August 2024",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20241004_171233.jpg",
    alt: "Process — October 2024",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240902_120742.jpg",
    alt: "Process — September 2024",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240807_163531.jpg",
    alt: "Process — Early prototyping",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240805_111057.jpg",
    alt: "Process — Hardware setup",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240802_140502.jpg",
    alt: "Process — Assembly",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2025/10/20240716_165141.jpg",
    alt: "Process — Initial exploration",
  },
  {
    src: "https://mahanmehrvarz.name/wp-content/uploads/2024/10/hapt.gif",
    alt: "Haptic prototype animation",
  },
];

// TODO: the card component is deliberately generic — the student theses and
// whatever comes next drop in as further entries here.
const publications = [
  {
    venue: "CHItaly '25 · Full paper",
    title:
      "Prompting Realities: Exploring the Potentials of Prompting for Tangible Artifacts",
    authors: "Mahan Mehrvarz, Dave Murray-Rust, Himanshu Verma",
    citation:
      "Proceedings of the 16th Biannual Conference of the Italian SIGCHI Chapter (CHItaly '25). ACM, New York, NY, USA, Article 57, 1–6.",
    href: "https://doi.org/10.1145/3750069.3750089",
  },
  {
    venue: "interactions · Magazine",
    title:
      "Prompting Realities: Reappropriating Tangible Artifacts Through Conversation",
    authors: "Mahan Mehrvarz",
    citation: "interactions 32, 4 (July–August 2025), 10–11.",
    href: "https://doi.org/10.1145/3742782",
  },
];

const collaborators = [
  {
    name: "Mahan Mehrvarz",
    role: "Project lead",
    href: "https://mahanmehrvarz.name",
    img: "https://filelist.tudelft.nl/Personen/n0v1l0.jpg?hash=4829f12966",
  },
  {
    name: "Dave Murray-Rust",
    role: "Supervision",
    href: "https://dave.murray-rust.org/",
    img: "https://filelist.tudelft.nl/Personen/s3i3b1.jpg?hash=7a4d4fe36d",
  },
  {
    name: "Jerry de Vos",
    role: "Prototyping",
    href: "https://jerrydevos.nl/",
    img: "https://jerrydevos.nl/wp-content/uploads/2023/11/DSC02226-1024x1024.jpg",
  },
  {
    name: "Diego Viero",
    role: "Development",
    href: "https://github.com/Diego-Viero",
    img: "https://avatars.githubusercontent.com/u/55762846?v=4",
  },
  {
    name: "Aadjan Van Der Helm",
    role: "Connected Interaction Kit",
    href: "https://www.tudelft.nl/en/ide/about-ide/people/helm-ajc-van-der",
    img: "https://filelist.tudelft.nl/Personen/16d8u.jpg?hash=1832e5e649",
  },
  {
    name: "Martin Havranek",
    role: "Fabrication",
    href: "https://www.tudelft.nl/staff/m.c.havranek/",
    img: "/Martin-Havranek-web.jpg",
  },
];

const logos = [
  {
    src: "/logos/logo-01.png",
    alt: "AI Futures Lab",
    href: "https://www.tudelft.nl/ai/ai-futures-lab",
  },
  {
    src: "/logos/AIFUTURESLAB.png",
    alt: "4TU Design United",
    href: "https://www.4tu.nl/du/editions/2024%20Changing-Gears/#digital-future",
  },
  {
    src: "/logos/DDW.png",
    alt: "Dutch Design Week",
    href: "https://ddw.nl/en/programme/13171/prompting-realities",
  },
  { src: "/logos/TUDelft_logo_black.png", alt: "TU Delft", href: "https://www.tudelft.nl/io" },
  {
    src: "https://avatars.githubusercontent.com/u/47032710?s=280&v=4",
    alt: "Studio Lab",
    href: "https://github.com/AMS-IDE",
    bw: true,
  },
];

export default function ResearchPage() {
  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 lg:px-10">
        {/* Intro — the teaser that used to head the About page lives here now,
            where it reads as documentation rather than as a product shot. */}
        <section className="card-panel overflow-hidden">
          <div className="relative">
            <img
              src="https://mahanmehrvarz.name/wp-content/uploads/elementor/thumbs/teaser-landspace-1-re0g25jec6m2nn6lqtbhodjc5wo2k250utxkwclpfk.jpg"
              alt="Prompting Realities — exhibition teaser"
              className="h-56 w-full object-cover sm:h-72 lg:h-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink-dark)]/90 via-[var(--ink-dark)]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
              <span className="mb-3 block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
              <h1 className="text-3xl font-black uppercase leading-[1.1] tracking-wide text-[var(--card-fill)] sm:text-4xl">
                Research
              </h1>
            </div>
          </div>
          <div className="p-6 lg:p-10">
            <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              Prompting Realities began as a research-through-design inquiry into
              what happens when prompting stops being a screen activity. The
              framework on the home page is the practical residue of that inquiry;
              this page is the argument behind it.
            </p>
          </div>
        </section>

        {/* Positioning */}
        <section className="card-panel space-y-8 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Positioning
          </p>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--ink-dark)]">
              Prompting beyond the screen
            </h2>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              The application of LLMs in our everyday life has gained momentum since
              the ChatGPT breakthrough in November 2022. While much attention has
              been focused on ways to engineer prompts for specific textual results,
              there is little emphasis on how such iterative prompt engineering
              techniques can be extended beyond the limitations of screens and into
              more tangible, physical realities. This shift can empower users,
              expanding the familiar concept of &ldquo;end-user programming&rdquo; to
              include any type of everyday artefact. Consequently, Prompting
              Realities envisions an experiential scenario where AI distributes the
              authoritative role of engineers and designers as creators to end-users,
              opening up new opportunities to contest, interrupt, resist, or
              manipulate everyday products under unfair situations&mdash;not through
              a system, but at the edge of usage.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--ink-dark)]">
              The pipeline, and why it is deliberately thin
            </h2>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              The underlying pipeline operates with a simple yet powerful approach:
              providing a precise description of the prototype (functionality,
              appearance, etc.) to the large language model. This enables the model
              to understand the correspondence between computer variables and the
              effects they can have on reality, in relation to the prototype&apos;s
              functionality. There is little emphasis on specific hardware or
              software solutions used in the current prototypes, as the project
              primarily focuses on offering a new experience for users rather than
              introducing a new AI-powered system. However, the prototypes utilize a
              range of technologies, including the OpenAI Assistant API, Telegram Bot
              Interface, and TU Delft IDE Connected Interaction Kit, all of which can
              be replaced by similar alternatives.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--ink-dark)]">
              Redistributing agency
            </h2>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              Prompting Realities explores the intersection of AI and physical
              computing, expanding the application of large language models beyond
              text-based interactions into tangible, real-world contexts. By
              empowering users to interact with AI-driven prototypes through
              conversational interfaces, the project pushes classic notions of
              end-user programming, redistributing control and agency from engineers
              and designers to everyday users. This shift has the potential to
              democratize technology enabling resistance, interruption, and
              subversion opening new avenues for human-AI collaboration. Through
              experiential AI prototyping, the project provokes speculative
              reflection on AI&apos;s role in shaping our physical and digital
              environments, encouraging deeper engagement with the evolving relations
              between humans and machines.
            </p>
            <p className="mt-4 border-l-4 border-[var(--accent-green)] pl-4 text-sm font-semibold leading-relaxed text-[var(--ink-dark)] lg:text-base">
              The point of a low threshold is not convenience. If the behaviour of an
              everyday artifact can be shaped in conversation, then shaping it is
              available to whoever is using it, not only to whoever engineered it
              &mdash; which makes the behaviour something that can be argued with,
              interrupted, or refused.
            </p>
          </div>
        </section>

        {/* Publications */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Publications
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {publications.map((pub) => (
              <article
                key={pub.href}
                className="flex flex-col gap-3 rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-5 shadow-[5px_5px_0_var(--shadow-deep)]"
              >
                <span className="pill-chip self-start">{pub.venue}</span>
                <h3 className="text-base font-black leading-tight text-[var(--ink-dark)] lg:text-lg">
                  {pub.title}
                </h3>
                <p className="text-sm font-semibold text-[var(--ink-muted)]">
                  {pub.authors}
                </p>
                <p className="flex-1 text-sm leading-relaxed text-[var(--foreground)]">
                  {pub.citation}
                </p>
                <a
                  href={pub.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 self-start rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View publication
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* Exhibition & gallery */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Exhibition &amp; gallery
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] shadow-[5px_5px_0_var(--shadow-deep)]">
              <img
                src="https://mahanmehrvarz.name/wp-content/uploads/2024/10/FWpsoter1.jpg"
                alt="DDW24 poster 1"
                className="h-auto w-full"
              />
            </div>
            <div className="overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] shadow-[5px_5px_0_var(--shadow-deep)]">
              <img
                src="https://mahanmehrvarz.name/wp-content/uploads/2024/10/FWposter2.jpg"
                alt="DDW24 poster 2"
                className="h-auto w-full"
              />
            </div>
          </div>
          <ImageGallery images={galleryImages} />
        </section>

        {/* Contributors */}
        <section className="card-panel space-y-4 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Contributors
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {collaborators.map((collab) => {
              const inner = (
                <>
                  {collab.img ? (
                    <img
                      src={collab.img}
                      alt={collab.name}
                      className="h-14 w-14 rounded-full border-[2px] border-[var(--card-shell)] object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-[2px] border-[var(--card-shell)] bg-[var(--ink-dark)] text-lg font-semibold text-[var(--card-fill)]">
                      {collab.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-bold text-[var(--ink-dark)]">
                    {collab.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                    {collab.role}
                  </span>
                </>
              );
              const className =
                "flex flex-col items-center gap-2 rounded-[16px] border-[2px] border-[var(--card-shell)]/30 bg-white px-3 py-4 text-center transition hover:border-[var(--card-shell)] hover:shadow-[3px_3px_0_var(--shadow-deep)]";
              return collab.href ? (
                <a
                  key={collab.name}
                  href={collab.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              ) : (
                <div key={collab.name} className={className}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        {/* Partners */}
        <section className="card-panel p-6 lg:p-10">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
            <p className="panel-strip shrink-0 px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
              Partners
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 sm:justify-start">
              {logos.map((logo) => (
                <a
                  key={logo.alt}
                  href={logo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:opacity-70"
                >
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    title={logo.alt}
                    className={`h-12 w-auto object-contain${logo.bw ? " grayscale contrast-200" : ""}`}
                  />
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* External links */}
        <section className="card-panel space-y-4 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Links
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/MahanMehrvarz/PromptingRealities"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              <ExternalLink className="h-4 w-4" />
              Project GitHub
            </a>
            <a
              href="https://www.4tu.nl/du/projects/Prompting-Realities/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              <ExternalLink className="h-4 w-4" />
              4TU.design United
            </a>
            <a
              href="https://ddw.nl/en/programme/13171/prompting-realities"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              <ExternalLink className="h-4 w-4" />
              Dutch Design Week 2024
            </a>
            <a
              href="mailto:mahan.mehrvarz@hotmail.com"
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-5 py-2 text-sm font-semibold text-[var(--ink-dark)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5"
            >
              Send an email
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
