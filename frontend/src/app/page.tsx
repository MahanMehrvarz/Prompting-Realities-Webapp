import { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { HeroDemo } from "@/components/HeroDemo";
import { HeroPoster } from "@/components/HeroPoster";
import { SiteHeader } from "@/components/SiteHeader";
import { ProjectCard } from "@/components/ProjectCard";
import { SectionPanel } from "@/components/SectionPanel";
import { projectSeries } from "@/lib/projects";
import { tutorials } from "@/lib/tutorials";
import { TutorialCard } from "@/components/TutorialCard";

export const metadata: Metadata = {
  title: "Prompting Realities — Prototype LLM-powered tangible interactions",
  description:
    "A low-threshold framework for building physical things you can talk to. Describe your object in plain language, converse with it, and the model's structured output drives your hardware.",
  openGraph: {
    title: "Prompting Realities — Prototype LLM-powered tangible interactions",
    description:
      "A low-threshold framework for building physical things you can talk to. Describe your object in plain language, converse with it, and the model's structured output drives your hardware.",
    // TODO (media pending): swap for a DDW exhibition photo if you prefer it to
    // the architecture diagram.
    images: ["/projects/img0.jpg"],
  },
};

// Hidden for now. Flip to true to restore the section; recheck the figures in
// `stats` and the "five of the six artifacts" line against the grid first.
const SHOW_WHY_LOW_THRESHOLD = false;

const steps = [
  {
    n: "1",
    title: "Describe the thing",
    body: "You write a plain-language description of your artifact — what it is, what it can do, what its variables mean physically. That description is the whole “programming” step. The model learns the correspondence between a number in a JSON field and what it does in the room.",
  },
  {
    n: "2",
    title: "Talk to it",
    body: "You talk to the artifact through a chat interface — a Telegram bot, the Control Hub, a voice loop. The conversation thread doubles as memory: rules, personalities and configurations you set earlier stay in play without being re-sent.",
  },
  {
    n: "3",
    title: "It acts",
    body: "Every reply carries two outputs: language for you, and a JSON payload for the hardware. The payload travels over MQTT to a microcontroller, which executes it. That loop — prompt, structured response, actuation — is the whole framework.",
  },
];

const stats = [
  { figure: "6", label: "artifacts" },
  { figure: "2", label: "student graduation projects" },
  { figure: "1", label: "architecture" },
  { figure: "2", label: "peer-reviewed publications" },
];

// `heroVariant` exists only so /hero-poster can show the alternative hero
// for review. Remove it, and that route, once one is chosen.
export default function HomePage({ heroVariant = "chat" }: { heroVariant?: "chat" | "poster" }) {
  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 lg:px-10">
        {/* Hero */}
        <SectionPanel
          as="h1"
          headingSpan={5}
          title="Prototype things you can talk to"
          above={
            // The old hero was a poster with a chat screenshot and typewriter
            // text baked into the photo. The chat is now real markup beside a
            // cleaned photo, so it is crisp at any size and the lamp can answer.
            // TODO: hero-lamp.jpg is 796px wide — soft at 2x. Swap for an original.
            <figure className="space-y-3">
              {heroVariant === "poster" ? <HeroPoster /> : <HeroDemo />}
              <figcaption className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Ask for a dance vibe — the lamp answers in light
              </figcaption>
            </figure>
          }
        >
          <p className="text-base font-semibold leading-relaxed text-[var(--ink-dark)] lg:text-lg">
            Prompting Realities is a low-threshold framework for building
            LLM-powered tangible interactions.
          </p>
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            Describe your object to a language model in plain words. Talk to it.
            The model answers you in natural language and, in the same breath,
            emits structured JSON that drives your motors, lights and servos. No
            training, no fine-tuning, no custom parser — you write a description
            and a schema, and the thing starts behaving.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-6 py-3 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
            >
              Start building →
            </Link>
            <a
              href="#projects"
              className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-6 py-3 text-sm font-semibold text-[var(--foreground)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
            >
              See what people built
            </a>
          </div>
        </SectionPanel>
        {/* How it works */}
        <SectionPanel id="how-it-works" title="How it works" layout="stacked">
          <div className="grid gap-6 lg:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.n}
                className="space-y-3 rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-5 shadow-[4px_4px_0_var(--shadow-deep)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] font-mono text-lg font-black text-[var(--ink-dark)]">
                  {step.n}
                </span>
                <h3 className="text-lg font-black leading-tight text-[var(--ink-dark)]">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--foreground)]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
          <figure className="space-y-3">
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4 shadow-[5px_5px_0_var(--shadow-deep)]">
              <img
                src="/projects/img0.jpg"
                alt="System architecture: the user's chat interface feeds an AI agent carrying a system instruction and JSON schema; its response returns text to the chat and a JSON payload to the microcontroller, which drives the embodiment."
                className="w-full rounded-[12px]"
              />
            </div>
            <figcaption className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Prompt → structured response → actuation
            </figcaption>
          </figure>
          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-5">
            <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
              <strong>What you need:</strong> an OpenAI-compatible API key, an MQTT
              broker (local or hosted), a microcontroller running CircuitPython or
              Arduino, and a Control Hub account.{" "}
              <strong>What you don&apos;t need:</strong> machine-learning experience,
              a fine-tuned model, or any code that parses natural language.
            </p>
          </div>
        </SectionPanel>
        {/* Why low-threshold */}
        {SHOW_WHY_LOW_THRESHOLD && (
        <SectionPanel
          title="Why low-threshold"
          below={
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-white p-4 text-center shadow-[3px_3px_0_var(--shadow-deep)]"
                >
                  <p className="font-mono text-3xl font-black text-[var(--ink-dark)]">
                    {stat.figure}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          }
        >
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            The framework is deliberately thin. It takes no position on your
            hardware, your chat client or your model provider — the prototypes below
            run on everything from a five-euro vibration motor to a camera-tracking
            servo rig to a table with an embedded monitor, and the architecture
            underneath them does not change. Only the description and the schema do.
          </p>
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            The clearest evidence that the threshold is low: five of the six
            artifacts below were built by two master&apos;s students at TU Delft IDE
            over a single year, alongside their graduation projects. Between them
            they cover vision input, choreography, self-recognition, narrative and
            multi-agent supervision — none of which required touching the pipeline
            itself.
          </p>
        </SectionPanel>
        )}
        {/* Project grid */}
        <section
          id="projects"
          className="card-panel scroll-mt-24 space-y-10 p-6 lg:p-10"
        >
          <div className="space-y-3">
            <span className="block h-[6px] w-14 rounded-full bg-[var(--accent-green)]" />
            <h2 className="text-2xl font-black uppercase leading-[1.1] tracking-tight text-[var(--ink-dark)] lg:text-[1.75rem]">
              Built with Prompting Realities
            </h2>
          </div>
          {projectSeries.map((series, i) => (
            <div
              key={series.label}
              className={`space-y-6${
                i > 0 ? " border-t-2 border-[var(--card-shell)]/20 pt-10" : ""
              }`}
            >
              <div className="space-y-3">
                <h3 className="text-lg font-black uppercase leading-tight tracking-wide text-[var(--ink-dark)] lg:text-xl">
                  {series.label}
                </h3>
                {series.blurb && (
                  <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
                    {series.blurb}
                  </p>
                )}
                {/* The thesis covers the whole series, so it is stated once here
                    rather than repeated on every card below. */}
                {series.thesis && (
                  <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--ink-muted)]">
                    From the thesis{" "}
                    <a
                      href={series.thesis.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[var(--ink-dark)] underline decoration-2 underline-offset-2 transition hover:text-[var(--accent-green)]"
                    >
                      {series.thesis.title}
                    </a>{" "}
                    — {series.thesis.author} →
                  </p>
                )}
              </div>
              {/* Two across at most — the cards carry video, so a third column
                  starves it. */}
              <div className="grid gap-6 sm:grid-cols-2">
                {series.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          ))}
        </section>
        {/* Control Hub */}
        <SectionPanel
          title="The Control Hub"
        >
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            The Control Hub is where your things live. Register an artifact, write
            and revise its description, choose a model, define the JSON schema it
            should emit, and watch the conversation and the resulting payloads side
            by side as it runs. Sign-up is open — bring your own API key and a board,
            and you can have something moving in an afternoon.
          </p>
          <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-6 py-3 text-sm font-semibold text-[var(--ink-dark)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
          >
          Create an account →
          </Link>
        </SectionPanel>

        {/* Tutorials */}
        <SectionPanel
          id="tutorials" title="Tutorials"
        >
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            Start-to-finish guides for building an LLM thing — from a bare board
            to an object you can hold a conversation with. The first one takes you
            through a lamp: wire the LED, write its description and schema, and
            ask it for a colour.
          </p>
          <div className="space-y-6">
            {tutorials.map((t) => (
              <TutorialCard key={t.slug} tutorial={t} />
            ))}
          </div>
          <Link
          href="/tutorials"
          className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-6 py-3 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
          >
          Browse tutorials →
          </Link>
        </SectionPanel>

        {/* Workshops */}
        <SectionPanel
          title="Workshops"
        >
          {/* TODO (confirm): does this match the workshop format you actually run? */}
          <p className="text-sm leading-relaxed text-[var(--foreground)] lg:text-base">
            Prompting Realities has been run as a hands-on workshop with design
            students and researchers: participants arrive with an everyday object and
            leave with a version of it they can talk to. If you&apos;d like to run one
            with your group, get in touch.
          </p>
          <a
          href="mailto:mahan.mehrvarz@hotmail.com?subject=Workshop%20Request%20-%20Prompting%20Realities"
          className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-6 py-3 text-sm font-semibold text-[var(--card-fill)] shadow-[4px_4px_0_var(--shadow-deep)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
          >
          Request a workshop →
          </a>
        </SectionPanel>
      </main>

      <Footer />
    </div>
  );
}
