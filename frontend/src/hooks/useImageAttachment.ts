"use client";

import { useCallback, useRef, useState } from "react";
import { resizeToJpegDataUrl } from "@/lib/imageResize";

export type ImageAttachment = {
  /** Resized JPEG as a data URL: shown as the preview and sent to the backend. */
  dataUrl: string;
  name: string;
};

/**
 * One pending image for the chat composer.
 *
 * Kept out of the chat page so the attach / preview / clear logic stays in one
 * place. The data URL doubles as the preview source, so there is no object URL
 * to revoke.
 */
export function useImageAttachment() {
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setAttachment(null);
    setAttachError(null);
  }, []);

  const onFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;

    setAttachError(null);
    setIsPreparing(true);
    try {
      const dataUrl = await resizeToJpegDataUrl(file);
      setAttachment({ dataUrl, name: file.name });
    } catch (err) {
      setAttachment(null);
      setAttachError(err instanceof Error ? err.message : "Could not use this image.");
    } finally {
      setIsPreparing(false);
    }
  }, []);

  /** Put a cleared attachment back, e.g. after a send that failed. */
  const restore = useCallback((previous: ImageAttachment) => {
    setAttachment((current) => current ?? previous);
  }, []);

  return { attachment, isPreparing, attachError, inputRef, openPicker, onFileChange, clear, restore };
}
