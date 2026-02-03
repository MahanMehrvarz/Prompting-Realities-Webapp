"use client";

import { Copy, X, Key, Lock, Hash } from "lucide-react";

interface DuplicationInfoModalProps {
  isOpen: boolean;
  assistantName: string;
  newTopic: string;
  onClose: () => void;
}

export function DuplicationInfoModal({
  isOpen,
  assistantName,
  newTopic,
  onClose,
}: DuplicationInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-panel relative max-w-md w-full space-y-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--ink-muted)] transition hover:text-[var(--foreground)]"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#4a9eff] bg-[#e5f5ff] px-4 py-3">
          <Copy className="h-6 w-6 text-[#2563eb]" />
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">
            Duplicated Successfully
          </h2>
        </div>

        <p className="text-sm text-[var(--foreground)] px-2">
          <strong>{assistantName}</strong> has been created. Please note the following:
        </p>

        <ul className="space-y-3 px-2">
          <li className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
            <Key className="h-5 w-5 text-[var(--accent-orange)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink-dark)]">API Key Required</p>
              <p className="text-xs text-[var(--ink-muted)]">
                The API key was not copied. You&apos;ll need to enter it before running this assistant.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
            <Lock className="h-5 w-5 text-[var(--accent-orange)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink-dark)]">MQTT Password Required</p>
              <p className="text-xs text-[var(--ink-muted)]">
                For security, the MQTT password was not copied. Re-enter it if your broker requires authentication.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 rounded-[16px] border-[2px] border-[var(--card-shell)] bg-[var(--card-fill)] p-3">
            <Hash className="h-5 w-5 text-[#2563eb] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink-dark)]">Topic Changed</p>
              <p className="text-xs text-[var(--ink-muted)]">
                To avoid conflicts, the MQTT topic is now:
              </p>
              <code className="mt-1 inline-block rounded-md bg-[var(--ink-dark)] px-2 py-1 text-xs text-[var(--card-fill)] font-mono">
                {newTopic}
              </code>
            </div>
          </li>
        </ul>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] hover:bg-[#1d4ed8] px-6 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
