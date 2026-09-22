"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Variant hero: the original poster (handwritten prompts and the phone chat
 * are part of the photo) with the same effects as HeroDemo — each payload
 * the model emits lands on the lamp as an overlay, recolours the disc, and
 * fades. The sequence follows what the handwriting on the poster asks for.
 */

type Payload = { text: string; glow: string };

const PAYLOADS: Payload[] = [
  // "Give me a dance vibe!"
  { text: '{ "mode": "pulse", "colors": ["red", "orange", "yellow"], "speed": "fast" }', glow: "#ff6a1a" },
  // "I want a move from blue to red quickly …"
  { text: '{ "mode": "fade", "from": "blue", "to": "red", "speed": "fast" }', glow: "#ff2d2d" },
  // "… and then slowly to orange"
  { text: '{ "mode": "fade", "to": "orange", "speed": "slow" }', glow: "#ff9a1f" },
];

const NATURAL_GLOW = "#4a5cff"; // what the photo already shows
const SHOW_MS = 3200; // overlay visible
const GAP_MS = 1400; // overlay hidden between payloads (glow stays)
const LOOP_PAUSE_MS = 3500; // back to the natural blue before restarting

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

export function HeroPoster() {
  const reduceMotion = useReducedMotion();
  // -1: idle (natural glow). Otherwise the index of the payload in play.
  const [step, setStep] = useState(-1);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    if (step < 0) {
      const t = setTimeout(() => {
        setStep(0);
        setShowing(true);
      }, LOOP_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (showing) {
      const t = setTimeout(() => setShowing(false), SHOW_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (step + 1 < PAYLOADS.length) {
        setStep(step + 1);
        setShowing(true);
      } else {
        setStep(-1);
      }
    }, GAP_MS);
    return () => clearTimeout(t);
  }, [step, showing, reduceMotion]);

  const payload = step >= 0 ? PAYLOADS[step] : null;
  const glow = payload ? payload.glow : NATURAL_GLOW;
  const overlayVisible = showing && !reduceMotion;

  // Where the disc sits in hero.jpg (1078x606, shown whole).
  const discMask =
    "radial-gradient(ellipse 25% 27% at 48% 52%, #000 84%, transparent 100%)";

  return (
    <div className="relative">
      <div className="relative aspect-[1078/606] overflow-hidden rounded-[20px] shadow-[5px_5px_0_var(--shadow-deep)]">
      <img
        src="/projects/hero.jpg"
        alt="A lamp-like artifact glowing while a Telegram conversation beside it asks for a dance vibe, then a move from blue to red and slowly to orange"
        className="absolute inset-0 h-full w-full"
      />
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
          opacity: payload ? 0.45 : 0,
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

      {/* The payload, landing on the device. Top-left is the one clear patch
          of wall on the poster; on a phone the poster is too small for that,
          so it sits under the picture instead. */}
      <div
        aria-hidden={!overlayVisible}
        className={`pointer-events-none mt-3 rounded-[14px] border-2 border-[var(--accent-green)] bg-[var(--ink-dark)]/92 px-3 py-2.5 text-[var(--card-fill)] shadow-[3px_3px_0_var(--shadow-deep)] transition-all duration-500 sm:absolute sm:left-4 sm:top-4 sm:mt-0 sm:max-w-[min(42%,22rem)] ${
          overlayVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-green)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
          Sent to the lamp · MQTT
        </div>
        <code className="block font-mono text-[11px] leading-snug lg:text-xs">
          {/* Keep the last text while fading out; a blank line otherwise so
              the phone layout doesn't jump. */}
          {payload?.text ?? " "}
        </code>
      </div>
    </div>
  );
}
