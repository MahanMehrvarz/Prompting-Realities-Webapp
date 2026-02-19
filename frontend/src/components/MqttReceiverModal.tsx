import { Radio, X, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { MqttConnectionStatus } from "@/hooks/useMqttSubscriber";

interface MqttReceiverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (wsUrl: string, topic: string, username?: string, password?: string) => void;
  onDisconnect: () => void;
  connectionStatus: MqttConnectionStatus;
  currentTopic: string | null;
  errorMessage: string | null;
  defaultHost?: string | null;
  defaultPort?: number;
  defaultUsername?: string | null;
  defaultPassword?: string | null;
  defaultTopic?: string | null;
}

export function MqttReceiverModal({
  isOpen,
  onClose,
  onConnect,
  onDisconnect,
  connectionStatus,
  currentTopic,
  errorMessage,
  defaultHost,
  defaultPort = 8083,
  defaultUsername,
  defaultPassword,
  defaultTopic,
}: MqttReceiverModalProps) {
  const [wsUrl, setWsUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Initialize form with defaults when modal opens
  useEffect(() => {
    if (isOpen && connectionStatus === "disconnected") {
      // Build WebSocket URL from host and port
      if (defaultHost) {
        const protocol = defaultHost.includes("localhost") || defaultHost.includes("127.0.0.1") ? "ws" : "wss";
        setWsUrl(`${protocol}://${defaultHost}:${defaultPort}/mqtt`);
      }
      setTopic(defaultTopic || "");
      setUsername(defaultUsername || "");
      setPassword(defaultPassword || "");
    }
  }, [isOpen, connectionStatus, defaultHost, defaultPort, defaultUsername, defaultPassword, defaultTopic]);

  if (!isOpen) return null;

  const handleSubscribe = () => {
    if (!wsUrl || !topic) return;
    onConnect(wsUrl, topic, username || undefined, password || undefined);
  };

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-panel relative max-w-md w-full space-y-4 p-6 pt-5 animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--ink-dark)] hover:text-white"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 rounded-[20px] border-[3px] border-[#4a9eff] bg-[#e5f5ff] px-4 py-3 mr-8">
          <Radio className="h-6 w-6 text-[#2563eb]" />
          <h2 className="text-lg font-semibold text-[var(--ink-dark)]">
            MQTT Receiver
          </h2>
        </div>

        {/* Connection Status Badge */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Status:
          </span>
          {connectionStatus === "connected" && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              <Wifi className="h-3 w-3" />
              Connected to {currentTopic}
            </span>
          )}
          {connectionStatus === "connecting" && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </span>
          )}
          {connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </span>
          )}
          {connectionStatus === "error" && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              <WifiOff className="h-3 w-3" />
              Error
            </span>
          )}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mx-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-3 px-2">
          <p className="text-sm text-[var(--foreground)]">
            Subscribe to an MQTT topic to receive messages. Messages will be automatically sent to the AI.
          </p>

          {/* WebSocket URL */}
          <div className="space-y-1.5">
            <label
              htmlFor="mqtt-ws-url"
              className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]"
            >
              WebSocket URL
            </label>
            <input
              id="mqtt-ws-url"
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="wss://broker.example.com:8084/mqtt"
              disabled={isConnected || isConnecting}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          {/* Topic */}
          <div className="space-y-1.5">
            <label
              htmlFor="mqtt-topic"
              className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]"
            >
              Topic
            </label>
            <input
              id="mqtt-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="home/sensors/temperature"
              disabled={isConnected || isConnecting}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <label
              htmlFor="mqtt-username"
              className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]"
            >
              Username (optional)
            </label>
            <input
              id="mqtt-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mqtt_user"
              disabled={isConnected || isConnecting}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="mqtt-password"
              className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]"
            >
              Password (optional)
            </label>
            <input
              id="mqtt-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isConnected || isConnecting}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-fill)]"
          >
            Close
          </button>
          {isConnected ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded-full border-[3px] border-[var(--card-shell)] bg-red-500 px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-red-600"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={!wsUrl || !topic || isConnecting}
              className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </span>
              ) : (
                "Subscribe"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
