import { Info, X } from "lucide-react";

interface FirstUseModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export function FirstUseModal({ isOpen, onAccept }: FirstUseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-panel relative max-w-md w-full space-y-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#4a9eff] bg-[#e5f5ff] px-4 py-3">
          <Info className="h-6 w-6 text-[#2563eb]" />
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">
            Data Privacy Notice
          </h2>
        </div>

        <div className="text-sm text-[var(--foreground)] px-2 space-y-3">
          <p>
            Welcome to Prompting Realities! Before you begin, please note:
          </p>
          <p className="font-semibold">
            All conversation logs and interaction data collected through this platform are kept strictly for research purposes only.
          </p>
          <p>
            Your data helps us improve AI interactions and understand how people engage with language models. We are committed to using this information responsibly and solely for academic and research objectives.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] hover:bg-[#1d4ed8] px-6 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)]"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
