/**
 * Phone Sensor Example — Demonstrates PhoneSensorManager usage
 *
 * This example shows how to use PhoneSensorManager to access
 * built-in phone/tablet sensors (accelerometer, gyroscope, compass, GPS).
 *
 * Usage:
 *   - Select a sensor preset (accelerometer, orientation, etc.)
 *   - Click "Connect" to request permissions and start polling
 *   - Click "Start" to begin data collection
 *   - Click "Stop" to end data collection
 *
 * Note: On iOS 13+, permission must be requested from a user gesture.
 * This example handles that automatically via the Connect button.
 */

import React, { useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { PhoneSensorManager } from "../models/phone-sensor-manager";
import { PHONE_SENSOR_PRESETS } from "../models/phone-sensor-profiles";
import { SensorConfiguration } from "../models/sensor-configuration";
import { NewSensorData } from "../models/sensor-manager";

const PhoneSensorExample: React.FC = () => {
  const [manager, setManager] = useState<PhoneSensorManager | null>(null);
  const [connected, setConnected] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [preset, setPreset] = useState("accelerometer");
  const [sensorConfig, setSensorConfig] = useState<SensorConfiguration | null>(null);
  const [data, setData] = useState<Record<string, number[][]>>({});
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>("");
  const [isMobile] = useState(PhoneSensorManager.isMobile());
  const dataRef = useRef(data);
  dataRef.current = data;

  const handleConnect = useCallback(async () => {
    setError(null);
    setPermissionStatus("");

    const mgr = new PhoneSensorManager({ preset });

    // Check if this is a mobile device
    if (!PhoneSensorManager.isMobile()) {
      setError("Warning: This device appears to be a desktop. Motion sensors may not provide data.");
    }

    // Request permissions (must be from user gesture on iOS)
    setPermissionStatus("Requesting permissions...");
    const granted = await mgr.requestSensorPermissions();

    if (!granted) {
      setError("Permission denied. Please allow sensor access in your browser settings.");
      setPermissionStatus("denied");
      return;
    }

    setPermissionStatus("granted");

    // Set up data listener
    (mgr as any).onSensorData = (newData: NewSensorData) => {
      setData(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(newData)) {
          updated[key] = [...(updated[key] || []), ...(newData[key] || [])];
        }
        return updated;
      });
    };

    // Start polling to get sensor config
    mgr.startPolling();

    // Get the config
    const config = mgr.getSensorConfig();
    setSensorConfig(config);
    setManager(mgr);
    setConnected(true);
  }, [preset]);

  const handleDisconnect = useCallback(() => {
    if (manager) {
      manager.requestStop();
      setManager(null);
      setConnected(false);
      setCollecting(false);
      setSensorConfig(null);
      setData({});
    }
  }, [manager]);

  const handleStart = useCallback(() => {
    if (manager) {
      const periods = manager.variableMeasurementPeriods();
      manager.requestStart(periods.defaultPeriod);
      setCollecting(true);
    }
  }, [manager]);

  const handleStop = useCallback(() => {
    if (manager) {
      manager.requestStop();
      setCollecting(false);
    }
  }, [manager]);

  const handlePresetChange = useCallback((newPreset: string) => {
    setPreset(newPreset);
    if (manager) {
      manager.setPreset(newPreset);
      manager.startPolling();
      const config = manager.getSensorConfig();
      setSensorConfig(config);
    }
  }, [manager]);

  const formatValue = (values: number[][]) => {
    if (!values || values.length === 0) return "—";
    const last = values[values.length - 1];
    if (!last || last.length < 2) return "—";
    return last[1].toFixed(3);
  };

  return (
    <div style={{ maxWidth: 600, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2>📱 Phone Sensor Example</h2>

      {!isMobile && (
        <div style={{ padding: 8, border: "1px solid #ff9800", background: "#fff3e0", marginBottom: 8, borderRadius: 4 }}>
          ⚠️ <strong>Desktop detected:</strong> Motion sensors may not work on this device.
          Use a mobile phone or tablet for best results.
        </div>
      )}

      {error && (
        <div style={{ color: "red", padding: 8, border: "1px solid red", marginBottom: 8 }}>
          {error}
        </div>
      )}

      {!connected ? (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              <strong>Sensor Mode:</strong>
            </label>
            <select
              value={preset}
              onChange={e => handlePresetChange(e.target.value)}
              style={{ width: "100%", padding: "4px 8px" }}
            >
              {Object.values(PHONE_SENSOR_PRESETS).map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.description}</option>
              ))}
            </select>
          </div>

          <button onClick={handleConnect} style={{ padding: "8px 16px" }}>
            Connect Phone Sensors
          </button>

          {permissionStatus && permissionStatus !== "granted" && permissionStatus !== "denied" && (
            <p style={{ marginTop: 8 }}>{permissionStatus}</p>
          )}
        </div>
      ) : (
        <div>
          <p><strong>Connected</strong> — Preset: {preset}</p>

          {sensorConfig && (
            <div style={{ marginBottom: 16 }}>
              <h3>Sensor Configuration</h3>
              <pre style={{ background: "#f5f5f5", padding: 8 }}>
                {JSON.stringify({
                  interface: sensorConfig.interface,
                  columns: sensorConfig.dataColumns?.map(c => ({ name: c?.name, units: c?.units })),
                }, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ marginRight: 8 }}>Sensor Mode:</label>
            <select
              value={preset}
              onChange={e => handlePresetChange(e.target.value)}
              disabled={collecting}
              style={{ padding: "2px 6px" }}
            >
              {Object.values(PHONE_SENSOR_PRESETS).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            {!collecting ? (
              <button onClick={handleStart} style={{ marginRight: 8, padding: "8px 16px" }}>
                Start Collection
              </button>
            ) : (
              <button onClick={handleStop} style={{ marginRight: 8, padding: "8px 16px" }}>
                Stop Collection
              </button>
            )}
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
                  {formatValue(values)}
                  {values.length > 1 ? ` (${values.length} samples)` : ""}
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
const rootEl = document.getElementById("phone-sensor-example-root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<PhoneSensorExample />);
}

export { PhoneSensorExample };