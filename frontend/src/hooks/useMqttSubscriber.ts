import { useRef, useState, useCallback, useEffect } from "react";
import mqtt, { MqttClient } from "mqtt";
import { logger } from "@/lib/logger";

export type MqttConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type UseMqttSubscriberOptions = {
  onMessage: (topic: string, message: string) => void;
  onError?: (error: Error) => void;
};

export function useMqttSubscriber({ onMessage, onError }: UseMqttSubscriberOptions) {
  const clientRef = useRef<MqttClient | null>(null);
  const [status, setStatus] = useState<MqttConnectionStatus>("disconnected");
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connect = useCallback(
    (
      wsUrl: string,
      topic: string,
      username?: string,
      password?: string
    ) => {
      // Disconnect existing connection first
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }

      setStatus("connecting");
      setErrorMessage(null);
      logger.log(`🔌 [MQTT] Connecting to ${wsUrl}, topic: ${topic}`);

      try {
        const client = mqtt.connect(wsUrl, {
          username: username || undefined,
          password: password || undefined,
          clientId: `pr-chat-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 10000,
        });

        client.on("connect", () => {
          logger.log("✅ [MQTT] Connected to broker");
          client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              logger.error("❌ [MQTT] Subscribe error:", err);
              setStatus("error");
              setErrorMessage(`Failed to subscribe: ${err.message}`);
              onError?.(err);
            } else {
              logger.log(`✅ [MQTT] Subscribed to topic: ${topic}`);
              setStatus("connected");
              setCurrentTopic(topic);
            }
          });
        });

        client.on("message", (receivedTopic, payload) => {
          const message = payload.toString();
          logger.log(`📨 [MQTT] Message received on ${receivedTopic}: ${message.substring(0, 100)}...`);
          onMessage(receivedTopic, message);
        });

        client.on("error", (err) => {
          logger.error("❌ [MQTT] Connection error:", err);
          setStatus("error");
          setErrorMessage(err.message || "Connection error");
          onError?.(err);
        });

        client.on("close", () => {
          logger.log("🔌 [MQTT] Connection closed");
          if (status !== "error") {
            setStatus("disconnected");
          }
          setCurrentTopic(null);
        });

        client.on("reconnect", () => {
          logger.log("🔄 [MQTT] Reconnecting...");
          setStatus("connecting");
        });

        client.on("offline", () => {
          logger.log("📴 [MQTT] Client offline");
          setStatus("disconnected");
        });

        clientRef.current = client;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to connect");
        logger.error("❌ [MQTT] Connection failed:", error);
        setStatus("error");
        setErrorMessage(error.message);
        onError?.(error);
      }
    },
    [onMessage, onError, status]
  );

  const disconnect = useCallback(() => {
    logger.log("🔌 [MQTT] Disconnecting...");
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setStatus("disconnected");
    setCurrentTopic(null);
    setErrorMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, []);

  return {
    status,
    currentTopic,
    errorMessage,
    connect,
    disconnect,
  };
}
