/**
 * ESP32 Sensor Example — Demonstrates BLESensorManager usage
 *
 * This example shows how to use BLESensorManager to connect to
 * ESP32-based sensor devices via both BLE and WebSocket modes.
 *
 * Usage:
 *   - BLE mode: Click "Connect BLE" to use the Web Bluetooth API
 *   - WebSocket mode: Enter the ESP32's WebSocket URL and click "Connect WiFi"
 *
 * The ESP32 should be running the companion Arduino sketch that exposes
 * the BLE GATT service or WebSocket server described in the docs.
 */

import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { BLESensorManager } from "../models/ble-sensor-manager";
import { SensorConfiguration } from "../models/sensor-configuration";
import { resolveDeviceProfile } from "../models/esp32-device-profiles";

const ESP32Example: React.FC = () => {
  const [manager, setManager] = useState<BLESensorManager | null>(null);
  const [connected, setConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState("ws://192.168.4.1:81");
  const [sensorConfig, setSensorConfig] = useState<SensorConfiguration | null>(null);
  const [data, setData] = useState<Record<string, number[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ble" | "websocket">("ble");

  const handleConnectBLE = useCallback(async () => {
    setError(null);
    const mgr = new BLESensorManager({ mode: "ble" });

    mgr.onSensorData((newData: any) => {
      setData(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(newData)) {
          updated[key] = [...(updated[key] || []), ...(newData[key] || [])];
        }
        return updated;
      });
    });

    try {
      const device = await mgr.connectToDevice();
      if (device) {
        setManager(mgr);
        setConnected(true);
        const config = mgr.getSensorConfig();
        if (config) {
          setSensorConfig(config);
        }
        mgr.startPolling();
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect via BLE");
    }
  }, []);

  const handleConnectWebSocket = useCallback(async () => {
    setError(null);
    const mgr = new BLESensorManager({ mode: "websocket", wsUrl });

    mgr.onSensorData((newData: any) => {
      setData(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(newData)) {
          updated[key] = [...(updated[key] || []), ...(newData[key] || [])];
        }
        return updated;
      });
    });

    try {
      const connected = await mgr.connectViaWebSocket(wsUrl);
      if (connected) {
        setManager(mgr);
        setConnected(true);
        const config = mgr.getSensorConfig();
        if (config) {
          setSensorConfig(config);
        }
        mgr.startPolling();
      } else {
        setError("Failed to connect via WebSocket");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect via WebSocket");
    }
  }, [wsUrl]);

  const handleDisconnect = useCallback(() => {
    if (manager) {
      manager.disconnectFromDevice();
      setManager(null);
      setConnected(false);
      setSensorConfig(null);
      setData({});
    }
  }, [manager]);

  const handleStart = useCallback(() => {
    if (manager) {
      manager.requestStart(100);
    }
  }, [manager]);

  const handleStop = useCallback(() => {
    if (manager) {
      manager.requestStop();
    }
  }, [manager]);

  return (
    <div style={{ maxWidth: 600, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2>ESP32 Sensor Example</h2>

      {error && (
        <div style={{ color: "red", padding: 8, border: "1px solid red", marginBottom: 8 }}>
          {error}
        </div>
      )}

      {!connected ? (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label>
              <input
                type="radio"
                name="mode"
                value="ble"
                checked={mode === "ble"}
                onChange={() => setMode("ble")}
              />
              BLE (Web Bluetooth)
            </label>
            <label style={{ marginLeft: 16 }}>
              <input
                type="radio"
                name="mode"
                value="websocket"
                checked={mode === "websocket"}
                onChange={() => setMode("websocket")}
              />
              WebSocket (WiFi)
            </label>
          </div>

          {mode === "ble" ? (
            <button onClick={handleConnectBLE} style={{ padding: "8px 16px" }}>
              Connect BLE
            </button>
          ) : (
            <div>
              <input
                type="text"
                value={wsUrl}
                onChange={e => setWsUrl(e.target.value)}
                style={{ width: "100%", padding: "4px 8px", marginBottom: 8 }}
                placeholder="ws://192.168.4.1:81"
              />
              <button onClick={handleConnectWebSocket} style={{ padding: "8px 16px" }}>
                Connect WiFi
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p><strong>Connected</strong> via {manager?.connectionMode}</p>

          {sensorConfig && (
            <div style={{ marginBottom: 16 }}>
              <h3>Sensor Configuration</h3>
              <pre style={{ background: "#f5f5f5", padding: 8 }}>
                {JSON.stringify({
                  name: sensorConfig.getName(),
                  sensors: sensorConfig.getSensorCount(),
                  position: sensorConfig.getPosition(),
                }, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <button onClick={handleStart} style={{ marginRight: 8, padding: "8px 16px" }}>
              Start
            </button>
            <button onClick={handleStop} style={{ marginRight: 8, padding: "8px 16px" }}>
              Stop
            </button>
            <button onClick={handleDisconnect} style={{ padding: "8px 16px" }}>
              Disconnect
            </button>
          </div>

          {Object.keys(data).length > 0 && (
            <div>
              <h3>Live Data</h3>
              {Object.entries(data).map(([key, values]) => (
                <div key={key}>
                  <strong>{key}:</strong>{" "}
                  {values.slice(-5).map(v => v.toFixed(2)).join(", ")}
                  {values.length > 5 ? " ..." : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mount the example if this file is loaded directly
const rootEl = document.getElementById("esp32-example-root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<ESP32Example />);
}

export { ESP32Example };