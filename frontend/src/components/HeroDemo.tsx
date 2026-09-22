"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The hero: a photo of the lamp beside a chat that types itself. The chat
 * shows only what a person would see — the JSON the model emits alongside
 * each reply never enters the chat; it lands on the lamp as an overlay,
 * recolours the disc, and fades. The whole framework in one loop.
 */

/** One colour the disc goes to: `ease` ms to get there, `hold` ms before the next. */
type Step = { color: string; ease: number; hold: number };
type Effect = { steps: Step[]; loop: boolean };

type Turn =
  | { who: "user"; text: string }
  | { who: "bot"; text: string }
  | { who: "payload"; text: string; effect: Effect };

const RED = "#ff2d2d";
const ORANGE = "#ff8c1a";
const YELLOW = "#ffd21f";
const BLUE = "#2f6bff";
const NATURAL_GLOW = "#4a5cff"; // what the photo already shows

// The prompts are the ones handwritten on the poster, and the lamp does
// what each payload says — a pulse pulses, a fast fade is fast.
const SCRIPT: Turn[] = [
  { who: "user", text: "Give me a dance vibe!" },
  { who: "bot", text: "Warm dance vibe coming up — pulsing through red, orange and yellow." },
  {
    who: "payload",
    text: '{ "mode": "pulse", "colors": ["red", "orange", "yellow"], "speed": "fast" }',
    effect: {
      loop: true,
      steps: [
        { color: RED, ease: 450, hold: 650 },
        { color: ORANGE, ease: 450, hold: 650 },
        { color: YELLOW, ease: 450, hold: 650 },
      ],
    },
  },
  { who: "user", text: "I want a move from blue to red quickly and then slowly to orange" },
  { who: "bot", text: "Snapping to red, then easing into orange." },
  {
    who: "payload",
    text: '{ "mode": "fade", "from": "blue", "to": "red", "speed": "fast", "then": { "to": "orange", "speed": "slow" } }',
    effect: {
      loop: false,
      steps: [
        { color: BLUE, ease: 300, hold: 700 },
        { color: RED, ease: 250, hold: 1600 },
        { color: ORANGE, ease: 2800, hold: 0 },
      ],
    },
  },
];
const CHAR_MS = 28;
const TURN_PAUSE_MS = 700;
const PAYLOAD_ARRIVE_MS = 400; // reply finished → packet lands on the lamp
const PAYLOAD_HOLD_MS = 2200; // how long the overlay stays before fading
const LOOP_PAUSE_MS = 4000;

const REDUCE = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

function useTranscript(reduceMotion: boolean) {
  // How many turns are complete, and how far the current one has typed.
  const [done, setDone] = useState(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    if (done >= SCRIPT.length) {
      const t = setTimeout(() => {
        setDone(0);
        setTyped(0);
      }, LOOP_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const current = SCRIPT[done];
    const isPayload = current.who === "payload";
    if (typed < current.text.length) {
      // A payload is one packet, not keystrokes.
      const t = setTimeout(
        () => setTyped((n) => n + (isPayload ? current.text.length : 1)),
        isPayload ? PAYLOAD_ARRIVE_MS : CHAR_MS,
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setDone((n) => n + 1);
        setTyped(0);
      },
      isPayload ? PAYLOAD_HOLD_MS : TURN_PAUSE_MS,
    );
    return () => clearTimeout(t);
  }, [done, typed, reduceMotion]);

  // Reduced motion: the whole transcript, no typing, no overlay.
  return reduceMotion ? { done: SCRIPT.length, typed: 0 } : { done, typed };
}

/**
 * Plays an effect's steps on the disc from the moment its payload lands,
 * and keeps going (a pulse keeps pulsing) until the next payload replaces
 * it or the loop restarts. `key` changes whenever a new effect starts.
 */
function useGlow(key: number | null, effect: Effect | null) {
  const [frame, setFrame] = useState<Step | null>(null);

  useEffect(() => {
    if (key === null || !effect) return;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      const step = effect.steps[i];
      setFrame(step);
      i += 1;
      if (i >= effect.steps.length) {
        if (!effect.loop) return;
        i = 0;
      }
      t = setTimeout(next, step.ease + step.hold);
    };
    t = setTimeout(next, 0);
    return () => clearTimeout(t);
  }, [key, effect]);

  return key === null || !frame ? { color: NATURAL_GLOW, ease: 900 } : frame;
}

export function HeroDemo() {
  const reduceMotion = useReducedMotion();
  const { done, typed } = useTranscript(reduceMotion);

  const current = SCRIPT[done];
  const visible = SCRIPT.slice(0, done + 1).filter((t) => t.who !== "payload");

  // The overlay shows while the payload turn is the current one and has
  // landed. Afterwards it fades out still holding that payload's text, which
  // is why the most recent payload is looked up through `done` inclusive.
  const payloadShowing = current?.who === "payload" && typed >= current.text.length && !reduceMotion;
  const lastPayload = [...SCRIPT.slice(0, done + 1)]
    .reverse()
    .find((t): t is Extract<Turn, { who: "payload" }> => t.who === "payload");
  const lit = !!lastPayload && (payloadShowing || SCRIPT.indexOf(lastPayload) < done);
  const { color: glow, ease } = useGlow(
    lit ? SCRIPT.indexOf(lastPayload) : null,
    lit ? lastPayload.effect : null,
  );

  // Where the disc sits in hero-poster.jpg. The box keeps the image's own
  // aspect ratio (no cropping), so these percentages hold at every width.
  const discMask =
    "radial-gradient(ellipse 33% 27% at 62% 52%, #000 84%, transparent 100%)";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:gap-5">
      {/* Photo — design-system frame with the stroke drawn over the image so
          the picture bleeds to the edge. */}
      <div className="relative aspect-[818/606] overflow-hidden rounded-[20px] bg-[#d9d2c8] shadow-[5px_5px_0_var(--shadow-deep)]">
        <img
          src="/projects/hero-poster.jpg"
          alt="A round lamp-like artifact with its top disc glowing; handwritten prompts around it read 'Give me a dance vibe!' and 'I want a move from blue to red quickly and then slowly to orange'"
          className="absolute inset-0 h-full w-full"
        />
        {/* Recolours only the lamp's disc: hue and saturation from this layer,
            light from the photo — then a faint screen of the same colour so
            the disc looks lit rather than stained. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: glow,
            mixBlendMode: "color",
            WebkitMaskImage: discMask,
            maskImage: discMask,
            transition: `background-color ${ease}ms ease`,
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: glow,
            mixBlendMode: "screen",
            opacity: lit ? 0.45 : 0,
            WebkitMaskImage: discMask,
            maskImage: discMask,
            transition: `background-color ${ease}ms ease, opacity 900ms ease`,
          }}
        />

        {/* The payload, landing on the device — not in the chat. Top-left is
            the patch of the poster with no handwriting on it. */}
        <div
          aria-hidden={!payloadShowing}
          className={`pointer-events-none absolute left-3 right-3 top-3 rounded-[14px] sm:right-auto sm:max-w-[48%] lg:left-4 lg:top-4 border-2 border-[var(--accent-green)] bg-[var(--ink-dark)]/92 px-3 py-2.5 text-[var(--card-fill)] shadow-[3px_3px_0_var(--shadow-deep)] transition-all duration-500 ${
            payloadShowing ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
            Sent to the lamp · MQTT
          </div>
          <code className="block font-mono text-[11px] leading-snug lg:text-xs">
            {lastPayload?.text}
          </code>
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] border-[3px] border-[var(--card-shell)]"
        />
      </div>

      {/* Chat — what the person sees. */}
      <div
        className="flex flex-col overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] text-[var(--card-fill)] shadow-[5px_5px_0_var(--shadow-deep)]"
        aria-live="off"
      >
        <div className="flex items-center gap-2 border-b-2 border-[var(--card-fill)]/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-green)]" />
          PR-Circle
          <span className="ml-auto font-normal normal-case tracking-normal text-[var(--card-fill)]/60">
            lamp · online
          </span>
        </div>

        {/* Height comes from the photo (desktop) or is fixed (stacked), never
            from the transcript, so the hero never reflows; older turns slide
            off the top the way a chat does. */}
        <div
          className="flex h-[300px] flex-col justify-end gap-2 overflow-hidden p-4 lg:h-auto lg:min-h-0 lg:flex-1 lg:gap-3 lg:p-5"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 48px)",
            maskImage: "linear-gradient(to bottom, transparent, #000 48px)",
          }}
        >
          {visible.map((turn) => {
            const i = SCRIPT.indexOf(turn);
            const full = i < done;
            const text = full ? turn.text : turn.text.slice(0, typed);
            if (!full && text.length === 0) return null;

            const user = turn.who === "user";
            return (
              <p
                key={i}
                className={`max-w-[85%] rounded-[16px] px-3.5 py-2 text-sm leading-snug lg:px-4 lg:py-2.5 lg:text-base ${
                  user
                    ? "self-end rounded-br-[4px] bg-[var(--accent-green)] text-[var(--ink-dark)]"
                    : "self-start rounded-bl-[4px] bg-[var(--card-fill)] text-[var(--ink-dark)]"
                }`}
              >
                {text}
                {!full && !reduceMotion && (
                  <span
                    className="ml-0.5 inline-block w-[2px] animate-pulse bg-current align-middle"
                    style={{ height: "1em" }}
                  />
                )}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
