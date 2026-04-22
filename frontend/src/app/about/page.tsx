import { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ImageGallery } from "@/components/ImageGallery";

export const metadata: Metadata = {
  title: "About — Prompting Realities",
  description:
    "Prompting Realities: Exploring Potentials of Prototyping Interactions with LLMs. A design research project exploring how LLMs act as intermediaries between human imagination and physical artifacts.",
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

const publications = [
  {
    citation:
      "Mahan Mehrvarz, Dave Murray-Rust, and Himanshu Verma. 2025. Prompting Realities: Exploring the Potentials of Prompting for Tangible Artifacts. In Proceedings of the 16th Biannual Conference of the Italian SIGCHI Chapter (CHItaly '25). Association for Computing Machinery, New York, NY, USA, Article 57, 1\u20136.",
    href: "https://doi.org/10.1145/3750069.3750089",
  },
  {
    citation:
      "Mahan Mehrvarz. 2025. Prompting Realities: Reappropriating Tangible Artifacts Through Conversation. interactions 32, 4 (July \u2013 August 2025), 10\u201311.",
    href: "https://doi.org/10.1145/3742782",
  },
];

const collaborators = [
  { name: "Mahan Mehrvarz", href: "https://mahanmehrvarz.name", img: "https://filelist.tudelft.nl/Personen/n0v1l0.jpg?hash=4829f12966" },
  { name: "Dave Murray-Rust", href: "https://dave.murray-rust.org/", img: "https://filelist.tudelft.nl/Personen/s3i3b1.jpg?hash=7a4d4fe36d" },
  { name: "Jerry de Vos", href: "https://jerrydevos.nl/", img: "https://jerrydevos.nl/wp-content/uploads/2023/11/DSC02226-1024x1024.jpg" },
  { name: "Diego Viero", href: "https://github.com/Diego-Viero", img: "https://avatars.githubusercontent.com/u/55762846?v=4" },
  { name: "Aadjan Van Der Helm", href: "https://www.tudelft.nl/en/ide/about-ide/people/helm-ajc-van-der", img: "https://filelist.tudelft.nl/Personen/16d8u.jpg?hash=1832e5e649" },
  { name: "Martin Havranek", href: "https://www.tudelft.nl/staff/m.c.havranek/", img: "/Martin-Havranek-web.jpg" },
];

const logos = [
  { src: "/logos/logo-01.png", alt: "AI Futures Lab", href: "https://www.tudelft.nl/ai/ai-futures-lab" },
  { src: "/logos/AIFUTURESLAB.png", alt: "4TU Design United", href: "https://www.4tu.nl/du/editions/2024%20Changing-Gears/#digital-future" },
  { src: "/logos/DDW.png", alt: "Dutch Design Week", href: "https://ddw.nl/en/programme/13171/prompting-realities" },
  { src: "/logos/TUDelft_logo_black.png", alt: "TU Delft", href: "https://www.tudelft.nl/io" },
  { src: "https://avatars.githubusercontent.com/u/47032710?s=280&v=4", alt: "Studio Lab", href: "https://github.com/AMS-IDE", bw: true },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-4 shadow-[0_6px_0_var(--card-shell)]">
        <h1 className="text-3xl font-black text-[var(--ink-dark)] uppercase tracking-[0.1em] sm:text-5xl">
          Prompting Realities
        </h1>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Control Hub
        </Link>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 lg:px-10">
        {/* Hero */}
        <section className="card-panel overflow-hidden">
          <div className="relative">
            <img
              src="https://mahanmehrvarz.name/wp-content/uploads/elementor/thumbs/teaser-landspace-1-re0g25jec6m2nn6lqtbhodjc5wo2k250utxkwclpfk.jpg"
              alt="Prompting Realities — Teaser"
              className="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink-dark)]/80 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
              <p className="pill-chip mb-3 inline-block border-[var(--card-fill)] text-[var(--card-fill)]">
                Research through Design
              </p>
              <h2 className="text-2xl font-black text-[var(--card-fill)] uppercase tracking-wide sm:text-3xl lg:text-4xl">
                Exploring Potentials of Prototyping Interactions with LLMs
              </h2>
            </div>
          </div>
        </section>

        {/* Project Description */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <div>
            <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
              A Research through Design Journey
            </p>
          </div>
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            Prompting Realities is a design research project exploring how large language models (LLMs) can act as intermediaries between human imagination and physical artifacts. The project investigates prompting not just as a linguistic operation but as a new interaction modality&mdash;where language becomes a material practice capable of shaping behavior, movement, and experience in the physical world. It aims to establish a reproducible pipeline for connecting AI-driven interpretation with tangible expression, enabling designers and researchers to prototype hybrid systems where computational intelligence and material agency co-evolve through dialogue.
          </p>
        </section>

        {/* Windmill Ecosystem */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <div>
            <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
              Windmill Ecosystem Prototype
            </p>
          </div>
          <div className="overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] shadow-[5px_5px_0_var(--shadow-deep)]">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src="https://player.vimeo.com/video/1020471640?h=0&title=0&byline=0&portrait=0"
                className="absolute inset-0 h-full w-full"
                frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                title="Prompting Realities — Windmill Ecosystem"
              />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            The Windmill Ecosystem Prototype operationalizes the concept of Prompting Realities by demonstrating how natural language interaction can orchestrate a network of physical and virtual artifacts. The system connects a large language model (LLM) interface to a set of three tangible windmills&mdash;each representing a distinct behavioral agent&mdash;through structured MQTT communication. When users issue prompts, the assistant interprets them into machine-readable commands defining direction, speed, and timing parameters, which are then transmitted to control each motorized windmill in real time. This loop&mdash;prompt &rarr; structured response &rarr; actuation&mdash;embodies how linguistic input can fluidly modulate physical expression.
          </p>
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            Designed as both a research probe and technical pipeline, the windmill ecosystem reveals how prompting can serve as a meta-interface for situated, embodied computation. The prototype frames the physical ensemble as a dynamic conversational field where meaning, movement, and intention are co-constructed between human, model, and machine. By linking symbolic reasoning with continuous motion, it explores how LLMs may become material collaborators&mdash;agents that translate abstract linguistic concepts into tangible, aesthetic, and spatial outcomes.
          </p>
        </section>

        {/* Architecture Diagram */}
        <section className="card-panel overflow-hidden p-6 lg:p-10">
          <p className="panel-strip mb-6 inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            System Architecture
          </p>
          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4">
            <img
              src="https://mahanmehrvarz.name/wp-content/uploads/elementor/thumbs/Architecture-DIS-rdxryfyt9sj3kylt0u2xox6rcv5226buuusdmwclj4.png"
              alt="System Architecture Diagram"
              className="w-full rounded-[12px]"
            />
          </div>
        </section>

        {/* Design Positionality */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Design Positionality
          </p>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[var(--ink-dark)]">
              How Can AI Upgrade Your Relation With Your Products?
            </h3>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              The application of LLMs in our everyday life has gained momentum since the ChatGPT breakthrough in November 2022. While much attention has been focused on ways to engineer prompts for specific textual results, there is little emphasis on how such iterative prompt engineering techniques can be extended beyond the limitations of screens and into more tangible, physical realities. This shift can empower users, expanding the familiar concept of &ldquo;end-user programming&rdquo; to include any type of everyday artefact. Consequently, Prompting Realities envisions an experiential scenario where AI distributes the authoritative role of engineers and designers as creators to end-users, opening up new opportunities to contest, interrupt, resist, or manipulate everyday products under unfair situations&mdash;not through a system, but at the edge of usage.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[var(--ink-dark)]">
              A Tangible Glimpse at Future Everyday Interactions
            </h3>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              The underlying pipeline operates with a simple yet powerful approach: providing a precise description of the prototype (functionality, appearance, etc.) to the large language model. This enables the model to understand the correspondence between computer variables and the effects they can have on reality, in relation to the prototype&apos;s functionality. There is little emphasis on specific hardware or software solutions used in the current prototypes, as the project primarily focuses on offering a new experience for users rather than introducing a new AI-powered system. However, the prototypes utilize a range of technologies, including the OpenAI Assistant API, Telegram Bot Interface, and TU Delft IDE Connected Interaction Kit, all of which can be replaced by similar alternatives.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-[var(--ink-dark)]">
              Redistributing Agency: AI&apos;s Role in Democratizing Design
            </h3>
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              Prompting Realities explores the intersection of AI and physical computing, expanding the application of large language models beyond text-based interactions into tangible, real-world contexts. By empowering users to interact with AI-driven prototypes through conversational interfaces, the project pushes classic notions of end-user programming, redistributing control and agency from engineers and designers to everyday users. This shift has the potential to democratize technology enabling resistance, interruption, and subversion opening new avenues for human-AI collaboration. Through experiential AI prototyping, the project provokes speculative reflection on AI&apos;s role in shaping our physical and digital environments, encouraging deeper engagement with the evolving relations between humans and machines.
            </p>
          </div>
        </section>

        {/* Design Posters */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            DDW24 Posters
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] shadow-[5px_5px_0_var(--shadow-deep)]">
              <img
                src="https://mahanmehrvarz.name/wp-content/uploads/2024/10/FWpsoter1.jpg"
                alt="Design Poster 1"
                className="h-auto w-full"
              />
            </div>
            <div className="overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] shadow-[5px_5px_0_var(--shadow-deep)]">
              <img
                src="https://mahanmehrvarz.name/wp-content/uploads/2024/10/FWposter2.jpg"
                alt="Design Poster 2"
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        {/* Photo Gallery */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Gallery
          </p>
          <ImageGallery images={galleryImages} />
        </section>

        {/* Publications */}
        <section className="card-panel space-y-6 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Publications
          </p>
          <ul className="space-y-4">
            {publications.map((pub) => (
              <li
                key={pub.href}
                className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-5 shadow-[3px_3px_0_var(--shadow-deep)]"
              >
                <p className="text-sm leading-relaxed text-[var(--foreground)]">
                  {pub.citation}
                </p>
                <a
                  href={pub.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-2 transition hover:text-[var(--accent-green)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View publication
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Contributors */}
        <section className="card-panel space-y-4 p-6 lg:p-10">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em]">
            Contributors
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {collaborators.map((collab) => (
              <a
                key={collab.name}
                href={collab.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 rounded-[16px] border-[2px] border-[var(--card-shell)]/30 bg-white px-3 py-4 text-center transition hover:border-[var(--card-shell)] hover:shadow-[3px_3px_0_var(--shadow-deep)]"
              >
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
                <span className="text-xs font-medium text-[var(--ink-dark)]">
                  {collab.name}
                </span>
              </a>
            ))}
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

        {/* External Links */}
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
