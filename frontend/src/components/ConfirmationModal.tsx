import { AlertTriangle, X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "danger",
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      bg: "bg-[#ffe5e5]",
      border: "border-[#ff4444]",
      icon: "text-[#c51c00]",
      confirmBg: "bg-[#c51c00]",
      confirmHover: "hover:bg-[#8b1400]",
    },
    warning: {
      bg: "bg-[#fff0dc]",
      border: "border-[#ffb347]",
      icon: "text-[#ff8f1c]",
      confirmBg: "bg-[#ff8f1c]",
      confirmHover: "hover:bg-[#e67e0a]",
    },
    info: {
      bg: "bg-[#e5f5ff]",
      border: "border-[#4a9eff]",
      icon: "text-[#2563eb]",
      confirmBg: "bg-[#2563eb]",
      confirmHover: "hover:bg-[#1d4ed8]",
    },
  };

  const styles = variantStyles[variant];

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

        <div className={`flex items-center gap-3 rounded-[20px] border-[3px] ${styles.border} ${styles.bg} px-4 py-3 mr-8`}>
          <AlertTriangle className={`h-6 w-6 ${styles.icon}`} />
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">{title}</h2>
        </div>

        <p className="text-sm text-[var(--foreground)] px-2">{message}</p>

        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-fill)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full border-[3px] border-[var(--card-shell)] ${styles.confirmBg} ${styles.confirmHover} px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)]`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
