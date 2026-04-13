"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold-to-record, release-to-send.
 *
 * idle       → pointerDown → requesting → recording
 * recording  → pointerUp → sends
 *            → tap trash / slide left → cancels
 * error      → auto-recovers to idle after 3s
 */
export type RecordingState = "idle" | "requesting" | "recording" | "cancelling" | "error";

export type UseVoiceRecorderOptions = {
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void;
  onCancelled?: () => void;
  cancelThreshold?: number;
};

export type UseVoiceRecorderReturn = {
  recordingState: RecordingState;
  elapsedSeconds: number;
  isCancelling: boolean;
  micButtonProps: {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  };
  cancelRecording: () => void;
};

export function useVoiceRecorder({
  onRecordingComplete,
  onCancelled,
  cancelThreshold = 80,
}: UseVoiceRecorderOptions): UseVoiceRecorderReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartXRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const isCancellingRef = useRef<boolean>(false);
  const recordingStateRef = useRef<RecordingState>("idle");

  useEffect(() => { isCancellingRef.current = isCancelling; }, [isCancelling]);
  useEffect(() => { elapsedRef.current = elapsedSeconds; }, [elapsedSeconds]);
  useEffect(() => { recordingStateRef.current = recordingState; }, [recordingState]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    stopStream();
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    setIsCancelling(false);
    isCancellingRef.current = false;
    recordedChunksRef.current = [];
    mediaRecorderRef.current = null;
  }, [stopTimer, stopStream]);

  const cancelRecording = useCallback(() => {
    const state = recordingStateRef.current;
    if (state === "idle" || state === "error") return;
    isCancellingRef.current = true;
    setIsCancelling(true);
    setRecordingState("cancelling");
    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      reset();
      setRecordingState("idle");
      onCancelled?.();
    }
  }, [stopTimer, reset, onCancelled]);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (recordingStateRef.current !== "idle") return;

      e.preventDefault();
      try {
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      } catch { /* safe to ignore */ }

      pointerStartXRef.current = e.clientX;
      setRecordingState("requesting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        recordedChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };

        recorder.onstop = () => {
          stopStream();
          if (isCancellingRef.current) {
            recordedChunksRef.current = [];
            reset();
            setRecordingState("idle");
            onCancelled?.();
            return;
          }
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
          const duration = elapsedRef.current;
          reset();
          setRecordingState("idle");
          if (blob.size > 0) onRecordingComplete(blob, duration);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;

        setElapsedSeconds(0);
        elapsedRef.current = 0;
        timerRef.current = setInterval(() => {
          setElapsedSeconds((s) => {
            const next = s + 1;
            elapsedRef.current = next;
            return next;
          });
        }, 1000);

        setRecordingState("recording");
        recordingStateRef.current = "recording";

        // If the user already released before getUserMedia resolved (quick press),
        // cancel — we don't send empty/very-short recordings from accidental taps
        if (isCancellingRef.current) {
          isCancellingRef.current = true;
          recorder.stop();
        }
      } catch {
        setRecordingState("error");
        reset();
        setTimeout(() => setRecordingState("idle"), 3000);
      }
    },
    [onRecordingComplete, onCancelled, reset, stopStream]
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => {
      const state = recordingStateRef.current;
      if (state === "recording") {
        // Normal release → send
        stopTimer();
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      } else if (state === "requesting") {
        // Released before getUserMedia resolved → mark state so pointerDown handler cancels
        setRecordingState("idle");
      } else if (state === "cancelling") {
        stopTimer();
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      }
    },
    [stopTimer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const state = recordingStateRef.current;
      if (state !== "recording" && state !== "cancelling") return;

      const deltaX = e.clientX - pointerStartXRef.current;
      if (deltaX < -cancelThreshold) {
        if (!isCancellingRef.current) {
          isCancellingRef.current = true;
          setIsCancelling(true);
          setRecordingState("cancelling");
        }
      } else {
        if (isCancellingRef.current) {
          isCancellingRef.current = false;
          setIsCancelling(false);
          setRecordingState("recording");
        }
      }
    },
    [cancelThreshold]
  );

  const handlePointerCancel = useCallback(() => {
    cancelRecording();
  }, [cancelRecording]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
    };
  }, [stopTimer, stopStream]);

  return {
    recordingState,
    elapsedSeconds,
    isCancelling,
    micButtonProps: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerMove: handlePointerMove,
      onPointerCancel: handlePointerCancel,
    },
    cancelRecording,
  };
}
