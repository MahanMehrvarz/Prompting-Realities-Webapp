"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type GalleryImage = {
  src: string;
  alt: string;
};

export function ImageGallery({ images }: { images: GalleryImage[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const close = useCallback(() => setActiveIndex(null), []);
  const prev = useCallback(
    () => setActiveIndex((i) => (i !== null && i > 0 ? i - 1 : images.length - 1)),
    [images.length]
  );
  const next = useCallback(
    () => setActiveIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : 0)),
    [images.length]
  );

  useEffect(() => {
    if (activeIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeIndex, close, prev, next]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => setActiveIndex(i)}
            className="group cursor-pointer overflow-hidden rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white shadow-[3px_3px_0_var(--shadow-deep)] transition hover:-translate-y-1 hover:shadow-[5px_5px_0_var(--shadow-deep)]"
          >
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              className="aspect-square w-full object-cover transition group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {activeIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={close}
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 rounded-full border-[3px] border-white/30 bg-black/50 p-2 text-white transition hover:bg-black/70"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Prev */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 rounded-full border-[3px] border-white/30 bg-black/50 p-2 text-white transition hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Image */}
          <img
            src={images[activeIndex].src}
            alt={images[activeIndex].alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-[20px] border-[3px] border-[var(--card-shell)] object-contain shadow-[8px_8px_0_rgba(0,0,0,0.3)]"
          />

          {/* Next */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 rounded-full border-[3px] border-white/30 bg-black/50 p-2 text-white transition hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Counter */}
          <p className="absolute bottom-4 text-sm font-semibold text-white/70">
            {activeIndex + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  );
}
