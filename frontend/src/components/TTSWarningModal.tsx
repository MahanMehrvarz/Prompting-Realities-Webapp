import { AlertTriangle, Volume2, X } from "lucide-react";

interface TTSWarningModalProps {
  isOpen: boolean;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy", description: "Neutral, balanced" },
  { value: "echo", label: "Echo", description: "Male, warm" },
  { value: "fable", label: "Fable", description: "British, expressive" },
  { value: "onyx", label: "Onyx", description: "Deep, authoritative" },
  { value: "nova", label: "Nova", description: "Female, friendly" },
  { value: "shimmer", label: "Shimmer", description: "Soft, gentle" },
];

export function TTSWarningModal({
  isOpen,
  selectedVoice,
  onVoiceChange,
  onConfirm,
  onCancel,
}: TTSWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-panel relative max-w-md w-full space-y-4 p-6 pt-5 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--ink-dark)] hover:text-white"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#ffb347] bg-[#fff0dc] px-4 py-3 mr-8">
          <AlertTriangle className="h-6 w-6 text-[#ff8f1c]" />
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">
            Enable Text-to-Speech
          </h2>
        </div>

        <div className="space-y-3 px-2">
          <p className="text-sm text-[var(--foreground)]">
            Text-to-speech will convert AI responses to audio using OpenAI&apos;s TTS API.
            This will consume additional API credits for each response.
          </p>

          <div className="space-y-2">
            <label
              htmlFor="voice-select"
              className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]"
            >
              Select Voice
            </label>
            <div className="relative">
              <Volume2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="w-full appearance-none rounded-full border-[3px] border-[var(--card-shell)] bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-[var(--ink-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2"
              >
                {VOICE_OPTIONS.map((voice) => (
                  <option key={voice.value} value={voice.value}>
                    {voice.label} — {voice.description}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <svg
                  className="h-4 w-4 text-[var(--ink-muted)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-fill)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#ff8f1c] px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#e67e0a]"
          >
            Enable TTS
          </button>
        </div>
      </div>
    </div>
  );
}
