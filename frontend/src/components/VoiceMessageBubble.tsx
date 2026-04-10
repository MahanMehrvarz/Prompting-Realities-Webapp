"use client";

import { useEffect, useRef, useState } from "react";

// Decorative waveform bar heights (static, 20 bars, varying heights 30–100%)
const WAVEFORM_BARS = [
  40, 70, 55, 85, 45, 90, 60, 75, 50, 95,
  65, 80, 40, 70, 55, 85, 45, 75, 60, 50,
];

type Props = {
  audioUrl: string;
  durationSeconds: number;
  transcript?: string | null;
  isProcessing?: boolean;
  role: "user" | "assistant";
  accentColor?: string; // CSS color for assistant bubbles
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceMessageBubble({
  audioUrl,
  durationSeconds,
  transcript,
  isProcessing = false,
  role,
  accentColor,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create audio element on mount; destroy on unmount
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    audio.onerror = () => {
      setIsPlaying(false);
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioUrl]);

  const handleToggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
      setIsPlaying(true);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor(audioRef.current?.currentTime ?? 0));
      }, 500);
    }
  };

  const isUser = role === "user";

  const displaySeconds = isPlaying ? elapsed : durationSeconds;

  return (
    <div
      className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-3 ${
        isUser ? "bg-[var(--ink-dark)] text-[var(--card-fill)]" : "text-[var(--ink-dark)]"
      }`}
      style={!isUser && accentColor ? { backgroundColor: accentColor } : undefined}
    >
      {/* Audio player row */}
      <div className="flex items-center gap-2">
        {/* Play / Pause button */}
        <button
          type="button"
          onClick={handleToggle}
          className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            isUser
              ? "bg-white/20 hover:bg-white/30 text-white"
              : "bg-black/10 hover:bg-black/20 text-[var(--ink-dark)]"
          }`}
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        >
          {isPlaying ? (
            // Pause icon
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            // Play icon
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Waveform bars */}
        <div className="flex items-center gap-[2px] flex-1 h-8">
          {WAVEFORM_BARS.map((height, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-150 ${
                isPlaying ? "animate-pulse" : ""
              } ${isUser ? "bg-white/70" : "bg-[var(--ink-dark)]/50"}`}
              style={{
                width: "3px",
                height: `${height}%`,
                animationDelay: `${(i * 60) % 600}ms`,
                animationDuration: "1.2s",
              }}
            />
          ))}
        </div>

        {/* Duration */}
        <span
          className={`flex-shrink-0 text-xs tabular-nums ${
            isUser ? "text-white/80" : "text-[var(--ink-dark)]/70"
          }`}
        >
          {formatDuration(displaySeconds)}
        </span>
      </div>

      {/* Transcript / processing label */}
      {transcript ? (
        <p className={`mt-1.5 text-xs leading-snug ${isUser ? "text-white/80" : "text-[var(--ink-dark)]/70"}`}>
          {transcript}
        </p>
      ) : isProcessing ? (
        <p className={`mt-1.5 text-xs ${isUser ? "text-white/60" : "text-[var(--ink-dark)]/50"}`}>
          Processing…
        </p>
      ) : null}

      {/* Timestamp slot (handled by parent) */}
    </div>
  );
}
