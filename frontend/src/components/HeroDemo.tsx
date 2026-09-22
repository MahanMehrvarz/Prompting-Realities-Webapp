"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The hero: a photo of the lamp beside a chat that types itself. Every bot
 * turn is followed by the JSON payload it emitted, and the lamp's glow in the
 * photo follows the payload's colour — the whole framework in one loop.
 */

type Turn =
  | { who: "user"; text: string }
  | { who: "bot"; text: string }
  | { who: "json"; text: string; glow: string };

const SCRIPT: Turn[] = [
  { who: "user", text: "Give me a dance vibe with warm colors" },
  { who: "bot", text: "Warm dance vibe coming up — pulsing through red, orange and yellow." },
  {
    who: "json",
    text: '{"mode":"pulse","colors":["#ff3b30","#ff9500","#ffcc00"],"speed":"fast"}',
    glow: "#ff6a1a",
  },
  { who: "user", text: "Now three quick flashes of blue" },
  { who: "bot", text: "Three flashes of blue, then holding." },
  { who: "json", text: '{"mode":"flash","color":"#2f6bff","count":3}', glow: "#2f6bff" },
];

const NATURAL_GLOW = "#4a5cff"; // what the photo already shows
const CHAR_MS = 28;
const TURN_PAUSE_MS = 700;
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
  // How many turns are fully shown, and how far the next one has typed.
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
    if (typed < current.text.length) {
      // JSON arrives as one packet, not keystrokes.
      const step = current.who === "json" ? current.text.length : 1;
      const t = setTimeout(() => setTyped((n) => n + step), current.who === "json" ? 350 : CHAR_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setDone((n) => n + 1);
      setTyped(0);
    }, TURN_PAUSE_MS);
    return () => clearTimeout(t);
  }, [done, typed, reduceMotion]);

  // Reduced motion: the whole transcript, no typing.
  return reduceMotion ? { done: SCRIPT.length, typed: 0 } : { done, typed };
}

export function HeroDemo() {
  const reduceMotion = useReducedMotion();
  const { done, typed } = useTranscript(reduceMotion);

  const visible = SCRIPT.slice(0, done + 1);
  const lastJson = [...SCRIPT.slice(0, done)].reverse().find((t) => t.who === "json");
  const lit = lastJson?.who === "json";
  const glow = lit ? lastJson.glow : NATURAL_GLOW;

  // Where the disc sits in hero-lamp.jpg. The box keeps the image's own
  // aspect ratio (no cropping), so these percentages hold at every width.
  const discMask =
    "radial-gradient(ellipse 35% 33% at 64% 66%, #000 84%, transparent 100%)";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:gap-5">
      {/* Photo — design-system frame with the stroke drawn over the image so
          the picture bleeds to the edge. */}
      <div className="relative aspect-[796/468] overflow-hidden rounded-[20px] bg-[#d9d2c8] shadow-[5px_5px_0_var(--shadow-deep)]">
        <img
          src="/projects/hero-lamp.jpg"
          alt="A round lamp-like artifact on a desk, its top disc glowing"
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
            transition: "background-color 900ms ease",
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
            transition: "background-color 900ms ease, opacity 900ms ease",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] border-[3px] border-[var(--card-shell)]"
        />
      </div>

      {/* Chat */}
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
          className="flex h-[300px] flex-col justify-end gap-2 overflow-hidden p-4 lg:h-auto lg:min-h-0 lg:flex-1"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 48px)",
            maskImage: "linear-gradient(to bottom, transparent, #000 48px)",
          }}
        >
          {visible.map((turn, i) => {
            const full = i < done;
            const text = full ? turn.text : turn.text.slice(0, typed);
            if (!full && text.length === 0) return null;

            if (turn.who === "json") {
              return (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-green)]">
                    → MQTT · lamp/led
                  </span>
                  <code className="w-fit max-w-full break-all rounded-[12px] border border-[var(--accent-green)]/40 bg-black/40 px-3 py-2 font-mono text-[11px] leading-snug text-[var(--accent-green)] lg:text-xs">
                    {text}
                  </code>
                </div>
              );
            }

            const user = turn.who === "user";
            return (
              <p
                key={i}
                className={`max-w-[85%] rounded-[16px] px-3.5 py-2 text-sm leading-snug ${
                  user
                    ? "self-end rounded-br-[4px] bg-[var(--accent-green)] text-[var(--ink-dark)]"
                    : "self-start rounded-bl-[4px] bg-[var(--card-fill)] text-[var(--ink-dark)]"
                }`}
              >
                {text}
                {!full && !reduceMotion && (
                  <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-current align-middle" style={{ height: "1em" }} />
                )}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
