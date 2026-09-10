import { Radio, X, Wifi, WifiOff, Loader2, Pause } from "lucide-react";
import { useState, useEffect } from "react";
import type { MqttConnectionStatus } from "@/hooks/useMqttSubscriber";
import type { ReceiverStatus } from "@/lib/backendApi";

interface MqttReceiverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (wsUrl: string, topic: string, username?: string, password?: string) => void;
  onDisconnect: () => void;
  connectionStatus: MqttConnectionStatus;
  currentTopic: string | null;
  errorMessage: string | null;
  defaultHost?: string | null;
  defaultTopic?: string | null;
  defaultUsername?: string | null;
  defaultPassword?: string | null;
  /**
   * Admins get the persistent receiver: the backend holds the subscription, so
   * it keeps running after this tab closes. Everyone else keeps the original
   * browser-only subscription, which ends with the tab.
   */
  isAdmin?: boolean;
  persistentStatus?: ReceiverStatus | null;
  persistentError?: string | null;
  persistentBusy?: boolean;
  onArmPersistent?: (topic: string) => void;
  onDisarmPersistent?: () => void;
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
  defaultTopic,
  defaultUsername,
  defaultPassword,
  isAdmin = false,
  persistentStatus = null,
  persistentError = null,
  persistentBusy = false,
  onArmPersistent,
  onDisarmPersistent,
}: MqttReceiverModalProps) {
  // Build the correct WebSocket URL from host, ignoring the TCP port.
  // Browsers connect via WebSocket only: wss://<host>/mqtt for remote, ws://<host>:9001/mqtt for local.
  const buildWsUrl = (host: string) => {
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    return isLocal ? `ws://${host}:9001/mqtt` : `wss://${host}/mqtt`;
  };

  const [wsUrl, setWsUrl] = useState(() => defaultHost ? buildWsUrl(defaultHost) : "");
  const [topic, setTopic] = useState(defaultTopic || "sensor");
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState(defaultPassword || "");

  // Re-initialize form with defaults each time the modal opens while disconnected
  useEffect(() => {
    if (isOpen && connectionStatus === "disconnected") {
      if (defaultHost) setWsUrl(buildWsUrl(defaultHost));
      setTopic(defaultTopic || "sensor");
      setUsername(defaultUsername || "");
      setPassword(defaultPassword || "");
    }
  }, [isOpen, connectionStatus, defaultHost, defaultTopic, defaultUsername, defaultPassword]);

  // Sync topic field with actual connected topic (fixes stale state after auto-subscribe)
  useEffect(() => {
    if (isOpen && connectionStatus === "connected" && currentTopic) {
      setTopic(currentTopic);
    }
  }, [isOpen, connectionStatus, currentTopic]);

  if (!isOpen) return null;

  const handleSubscribe = () => {
    if (!topic) return;
    if (isAdmin) {
      // The backend connects over TCP with the assistant's stored broker
      // credentials, so the admin only has to name a topic.
      onArmPersistent?.(topic);
      return;
    }
    if (!wsUrl) return;
    onConnect(wsUrl, topic, username || undefined, password || undefined);
  };

  const handleDisconnect = () => {
    if (isAdmin) {
      onDisarmPersistent?.();
      return;
    }
    onDisconnect();
  };

  const isArmed = isAdmin && !!persistentStatus?.armed;
  // While armed, the server owns the topic, so show that rather than whatever
  // this browser last typed. Derived instead of synced into state: the field is
  // read-only in that state anyway.
  const topicValue = isArmed && persistentStatus?.topic ? persistentStatus.topic : topic;
  const isConnected = isAdmin ? isArmed : connectionStatus === "connected";
  const isConnecting = isAdmin ? persistentBusy : connectionStatus === "connecting";
  const displayError = isAdmin ? persistentError : errorMessage;

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
          {/* Admin: the persistent receiver has a third state -- armed but
              deliberately silent while someone is using the chat. */}
          {isAdmin && isArmed && persistentStatus?.paused && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              <Pause className="h-3 w-3" />
              Paused — visitor is using the chat
            </span>
          )}
          {isAdmin && isArmed && !persistentStatus?.paused && persistentStatus?.running && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              <Wifi className="h-3 w-3" />
              Listening on {persistentStatus.topic}
            </span>
          )}
          {isAdmin && isArmed && !persistentStatus?.paused && !persistentStatus?.running && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Armed — reconnecting...
            </span>
          )}
          {isAdmin && !isArmed && !persistentBusy && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              <WifiOff className="h-3 w-3" />
              Off
            </span>
          )}
          {isAdmin && !isArmed && persistentBusy && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Starting...
            </span>
          )}

          {!isAdmin && connectionStatus === "connected" && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              <Wifi className="h-3 w-3" />
              Connected to {currentTopic}
            </span>
          )}
          {!isAdmin && connectionStatus === "connecting" && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </span>
          )}
          {!isAdmin && connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </span>
          )}
          {!isAdmin && connectionStatus === "error" && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              <WifiOff className="h-3 w-3" />
              Error
            </span>
          )}
        </div>

        {/* Error Message */}
        {displayError && (
          <div className="mx-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {displayError}
          </div>
        )}

        <div className="space-y-3 px-2">
          {isAdmin ? (
            <p className="text-sm text-[var(--foreground)]">
              Messages on this topic are sent to the AI and keep running{" "}
              <strong>even after you close this tab</strong>. It stays on until you turn it
              off here, or the LLM thing is stopped. While a visitor is using the chat it
              pauses, so it doesn&apos;t compete with them.
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground)]">
              Subscribe to an MQTT topic to receive messages. Messages will be automatically sent to the AI.
            </p>
          )}
          {/* WebSocket URL — browser-only mode. The persistent receiver connects
              server-side using the assistant's stored broker settings. */}
          {!isAdmin && (
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
                placeholder="wss://broker.example.com/mqtt"
                disabled={isConnected || isConnecting}
                className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          )}

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
              value={topicValue}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="home/sensors/temperature"
              disabled={isConnected || isConnecting}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] focus:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          {/* Username / password — browser-only mode. The backend already has
              the assistant's broker credentials for the persistent receiver. */}
          {!isAdmin && (
          <>
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
          </>
          )}
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
              onClick={handleDisconnect}
              disabled={isAdmin && persistentBusy}
              className="rounded-full border-[3px] border-[var(--card-shell)] bg-red-500 px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdmin ? "Turn off" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={(!isAdmin && !wsUrl) || !topic || isConnecting}
              className="rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isAdmin ? "Starting..." : "Connecting..."}
                </span>
              ) : (
                isAdmin ? "Start listening" : "Subscribe"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
