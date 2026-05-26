"use client";

import { useState } from "react";
import { Download, X, FileSpreadsheet } from "lucide-react";
import { analysisApi } from "@/lib/backendApi";

type Props = {
  listId: string;
  token: string;
  open: boolean;
  onClose: () => void;
};

export default function ExportConversationsModal({ listId, token, open, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(analysisApi.getConversationsExportUrl(listId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Export failed (${res.status})`);
      }
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `conversations-${listId}.xlsx`;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[8px_8px_0_var(--card-shell)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--card-shell)] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[var(--ink-dark)]" />
            <h2 className="text-lg font-black uppercase tracking-wide text-[var(--ink-dark)]">
              Export Raw Conversations
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1 hover:bg-white transition disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-[var(--ink-dark)]">
            Downloads an Excel workbook with an <strong>Overview</strong> tab,
            an <strong>Instructions</strong> tab, and one tab per thread.
          </p>

          <div className="rounded-[12px] border-2 border-[var(--card-shell)] bg-white p-3 text-xs text-[var(--ink-muted)] space-y-1.5">
            <div className="flex items-center gap-2">
              <input type="radio" checked readOnly className="accent-[#2563eb]" />
              <span className="font-semibold text-[var(--ink-dark)]">Excel (.xlsx)</span>
            </div>
            <div className="flex items-center gap-2 opacity-50">
              <input type="radio" disabled className="accent-[#2563eb]" />
              <span>Markdown — coming soon</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--accent-red)] font-medium">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t-2 border-[var(--card-shell)] px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-1.5 text-sm font-semibold hover:bg-[var(--card-fill)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-4 py-1.5 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#1d4ed8] transition disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy ? "Building…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
