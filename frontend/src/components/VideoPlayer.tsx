"use client";

import { useRef, useState } from "react";

const MAX_AUTO_RETRIES = 2;

/**
 * Native <video controls> (play, scrub, volume, fullscreen come from the
 * browser), hardened against the one thing the bare element can't do: recover.
 * A single failed fetch leaves a <video> stuck on the browser's broken-play
 * icon forever, so we reload quietly a couple of times and then offer a Retry.
 */
export function VideoPlayer({
  src,
  poster,
  title,
}: {
  src: string;
  poster: string;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const retries = useRef(0);
  const resumeAt = useRef(0);
  const wantsPlay = useRef(false);
  const [failed, setFailed] = useState(false);

  const reload = () => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    video.load();
    if (wantsPlay.current) video.play().catch(() => {});
  };

  const handleError = () => {
    const video = videoRef.current;
    if (!video) return;
    resumeAt.current = video.currentTime;
    if (retries.current < MAX_AUTO_RETRIES) {
      retries.current += 1;
      setTimeout(reload, 800 * retries.current);
    } else {
      setFailed(true);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && resumeAt.current > 0) {
      video.currentTime = resumeAt.current;
      resumeAt.current = 0;
    }
  };

  // One voice at a time: starting a video pauses any other one on the page.
  const handlePlay = () => {
    wantsPlay.current = true;
    document.querySelectorAll("video").forEach((other) => {
      if (other !== videoRef.current) other.pause();
    });
  };

  return (
    <div className="relative h-full w-full bg-black">
      {/* src on the element, not a <source> child — only then does a failed
          load fire `error` on the <video> itself. preload="metadata" fetches
          the header (a few hundred KB), not the footage. */}
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        className="h-full w-full bg-black object-cover [&:fullscreen]:object-contain"
        title={title}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
        onPlaying={() => {
          retries.current = 0;
        }}
        onPlay={handlePlay}
        onPause={() => {
          wantsPlay.current = false;
        }}
      />

      {failed && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--ink-dark)]/85 p-4 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-[var(--card-fill)]">
            This video didn&apos;t load.
          </p>
          <button
            type="button"
            onClick={() => {
              retries.current = 0;
              wantsPlay.current = true;
              reload();
            }}
            className="pill-chip cursor-pointer bg-[var(--accent-green)]! text-[var(--ink-dark)]!"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
