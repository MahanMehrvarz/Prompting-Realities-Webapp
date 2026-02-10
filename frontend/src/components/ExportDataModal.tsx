import { X } from "lucide-react";
import { useState } from "react";

interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (selectedOptions: ExportOptions, format: "csv" | "json") => void;
}

export interface ExportOptions {
  messages: {
    userMessage: boolean;
    assistantResponse: boolean;
    timestamp: boolean;
    assistantId: boolean;
    jsonPayload: boolean;
    mqttPayload: boolean;
  };
  session: {
    userEmail: boolean;
    assistantName: boolean;
    numberOfMessages: boolean;
    jsonSchema: boolean;
    mqttTopic: boolean;
  };
  instructionHistory: {
    enabled: boolean;
    instructionText: boolean;
    timestamp: boolean;
  };
}

export function ExportDataModal({
  isOpen,
  onClose,
  onExport,
}: ExportDataModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    messages: {
      userMessage: true,
      assistantResponse: true,
      timestamp: true,
      assistantId: true,
      jsonPayload: true,
      mqttPayload: true,
    },
    session: {
      userEmail: true,
      assistantName: true,
      numberOfMessages: true,
      jsonSchema: true,
      mqttTopic: true,
    },
    instructionHistory: {
      enabled: true,
      instructionText: true,
      timestamp: true,
    },
  });

  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

  if (!isOpen) return null;

  const handleToggle = (
    category: "messages" | "session" | "instructionHistory",
    field: string
  ) => {
    setOptions((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: !prev[category][field as keyof typeof prev[typeof category]],
      },
    }));
  };

  const handleExport = () => {
    onExport(options, exportFormat);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-panel relative max-w-lg w-full space-y-4 p-6 pt-5 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--ink-dark)] hover:text-white"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[#fff9e6] px-4 py-3 mr-8">
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">
            Export Data
          </h2>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto px-2">
          {/* Export Format Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Export Format:
            </h3>
            <div className="flex gap-3">
              <label className="flex items-center gap-3 cursor-pointer group flex-1">
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  checked={exportFormat === "csv"}
                  onChange={() => setExportFormat("csv")}
                  className="h-5 w-5 border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                    CSV
                  </span>
                  <p className="text-xs text-[var(--ink-muted)]">
                    2-3 files (messages + sessions + history) in a ZIP
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group flex-1">
                <input
                  type="radio"
                  name="exportFormat"
                  value="json"
                  checked={exportFormat === "json"}
                  onChange={() => setExportFormat("json")}
                  className="h-5 w-5 border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                    JSON
                  </span>
                  <p className="text-xs text-[var(--ink-muted)]">
                    1 file with nested structure
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Messages Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Messages:
            </h3>
            <div className="space-y-2">
              {[
                { key: "userMessage", label: "User message" },
                { key: "assistantResponse", label: "Assistant response" },
                { key: "timestamp", label: "Timestamp" },
                { key: "assistantId", label: "Assistant ID" },
                { key: "jsonPayload", label: "JSON payload" },
                { key: "mqttPayload", label: "MQTT payload" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={
                      options.messages[
                        key as keyof typeof options.messages
                      ]
                    }
                    onChange={() => handleToggle("messages", key)}
                    className="h-5 w-5 rounded border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Session Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Session:
            </h3>
            <div className="space-y-2">
              {[
                { key: "userEmail", label: "User email" },
                { key: "assistantName", label: "Assistant name" },
                { key: "numberOfMessages", label: "Number of messages sent" },
                { key: "jsonSchema", label: "JSON schema" },
                { key: "mqttTopic", label: "MQTT topic" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={
                      options.session[
                        key as keyof typeof options.session
                      ]
                    }
                    onChange={() => handleToggle("session", key)}
                    className="h-5 w-5 rounded border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Instruction History Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Instruction History:
            </h3>
            <div className="space-y-2">
              {[
                { key: "enabled", label: "Include instruction history" },
                { key: "instructionText", label: "Instruction text" },
                { key: "timestamp", label: "Saved timestamp" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={
                      options.instructionHistory[
                        key as keyof typeof options.instructionHistory
                      ]
                    }
                    onChange={() => handleToggle("instructionHistory", key)}
                    className="h-5 w-5 rounded border-[3px] border-[var(--card-shell)] text-[var(--ink-dark)] focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--foreground)] group-hover:text-[var(--ink-dark)]">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-fill)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] hover:bg-[var(--ink-dark)]/90 px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)]"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
