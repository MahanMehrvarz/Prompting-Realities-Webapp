"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recording state machine states.
 * idle            → waiting for user to press mic
 * requesting      → getUserMedia pending
 * recording       → MediaRecorder active, timer ticking
 * cancelling      → slide-left threshold crossed (still holding)
 * done            → recording stopped, blob ready
 * error           → permission denied or other failure
 */
export type RecordingState =
  | "idle"
  | "requesting"
  | "recording"
  | "cancelling"
  | "done"
  | "error";

export type UseVoiceRecorderOptions = {
  /** Called with the recorded Blob when the user releases (without cancelling). */
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void;
  /** Called when the user cancels (slide-left). */
  onCancelled?: () => void;
  /** Pixels to slide left before auto-cancelling. Default: 80 */
  cancelThreshold?: number;
};

export type UseVoiceRecorderReturn = {
  recordingState: RecordingState;
  elapsedSeconds: number;
  isCancelling: boolean;
  /** Spread these props directly on the mic button element. */
  micButtonProps: {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  };
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

  // Keep isCancellingRef in sync so event handlers always see latest value
  useEffect(() => {
    isCancellingRef.current = isCancelling;
  }, [isCancelling]);

  // Keep elapsedRef in sync
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

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

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (recordingState !== "idle") return;

      // Block native scroll/drag while recording
      e.preventDefault();
      try {
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture may throw if the element is not in the DOM — safe to ignore
      }

      pointerStartXRef.current = e.clientX;
      setRecordingState("requesting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        recordedChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) {
            recordedChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          stopStream();
          // Check cancelling flag at stop time
          if (isCancellingRef.current) {
            recordedChunksRef.current = [];
            setRecordingState("idle");
            reset();
            onCancelled?.();
            return;
          }
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
          const duration = elapsedRef.current;
          reset();
          if (blob.size > 0) {
            setRecordingState("idle");
            onRecordingComplete(blob, duration);
          } else {
            setRecordingState("idle");
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;

        // Start elapsed timer
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
      } catch {
        setRecordingState("error");
        reset();
        // Recover to idle after a short delay
        setTimeout(() => setRecordingState("idle"), 3000);
      }
    },
    [recordingState, onRecordingComplete, onCancelled, reset, stopStream]
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => {
      if (recordingState !== "recording" && recordingState !== "cancelling") return;

      stopTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop(); // onstop callback handles the rest
      }
    },
    [recordingState, stopTimer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (recordingState !== "recording" && recordingState !== "cancelling") return;

      const deltaX = e.clientX - pointerStartXRef.current;
      if (deltaX < -cancelThreshold) {
        if (!isCancellingRef.current) {
          isCancellingRef.current = true;
          setIsCancelling(true);
          setRecordingState("cancelling");
        }
      } else {
        // Moved back right of threshold — revert cancelling
        if (isCancellingRef.current) {
          isCancellingRef.current = false;
          setIsCancelling(false);
          setRecordingState("recording");
        }
      }
    },
    [recordingState, cancelThreshold]
  );

  const handlePointerCancel = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => {
      // Pointer was cancelled by the OS (e.g. incoming call). Treat as cancel.
      isCancellingRef.current = true;
      setIsCancelling(true);
      stopTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    },
    [stopTimer]
  );

  // Cleanup on unmount
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
  };
}
