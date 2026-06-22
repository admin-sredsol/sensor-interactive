import { SensorConfig } from "@concord-consortium/sensor-connector-interface";

// Standard BLE UUIDs for the ESP32 sensor service
export const BLE_SENSOR_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const BLE_SENSOR_CONFIG_UUID  = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
export const BLE_SENSOR_DATA_UUID    = "1c95d598-a761-4f1e-8ca1-7b4a3f7e9eb1";
export const BLE_DEVICE_INFO_UUID    = "8bdf0e1a-0fde-4c7d-8a6e-5d3e9f1a2b4c";

export interface SensorChannel {
  id: string;        // e.g., "temperature"
  name: string;      // e.g., "Temperature"
  units: string;     // e.g., "°C"
  position: number;  // Display order
}

export interface DeviceProfile {
  deviceId: string;           // e.g., "ESP32-DHT22"
  name: string;               // e.g., "ESP32 DHT22 Sensor"
  channels: SensorChannel[];
  defaultPeriodMs: number;    // e.g., 100
  supportsDualCollection: boolean;
}

// Data packet received from ESP32
export interface BLEDataPacket {
  type: "data";
  time: number;
  channels: Record<string, number>;
}

// Command packet sent to ESP32
export interface BLECommandPacket {
  type: "command";
  action: "start" | "stop" | "set_period";
  period_ms?: number;
}

// Device info packet read from ESP32 on connection
export interface BLEDeviceInfo {
  type: "device_info";
  name: string;
  firmware: string;
  sensors: Array<{
    id?: string;
    name: string;
    units: string;
  }>;
  defaultPeriodMs?: number;
}

// Pre-defined profiles for common ESP32 sensor configurations.
// Note: Channel IDs use numeric strings (e.g., "100", "101") to match
// the SensorConfig.colIDs convention used by other managers in this project.
export const ESP32_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  "ESP32-DHT22": {
    deviceId: "ESP32-DHT22",
    name: "ESP32 DHT22 Sensor",
    channels: [
      { id: "100", name: "Temperature", units: "°C", position: 1 },
      { id: "101", name: "Humidity", units: "%", position: 2 }
    ],
    defaultPeriodMs: 2000,  // DHT22 max sample rate ~0.5 Hz
    supportsDualCollection: true
  },
  "ESP32-MPU6050": {
    deviceId: "ESP32-MPU6050",
    name: "ESP32 MPU6050 Accelerometer",
    channels: [
      { id: "100", name: "Acceleration X", units: "m/s²", position: 1 },
      { id: "101", name: "Acceleration Y", units: "m/s²", position: 2 },
      { id: "102", name: "Acceleration Z", units: "m/s²", position: 3 },
      { id: "103", name: "Gyro X", units: "°/s", position: 4 },
      { id: "104", name: "Gyro Y", units: "°/s", position: 5 },
      { id: "105", name: "Gyro Z", units: "°/s", position: 6 }
    ],
    defaultPeriodMs: 10,  // 100 Hz
    supportsDualCollection: true
  },
  "ESP32-DHT22-MPU6050": {
    deviceId: "ESP32-DHT22-MPU6050",
    name: "ESP32 DHT22 + MPU6050",
    channels: [
      { id: "100", name: "Temperature", units: "°C", position: 1 },
      { id: "101", name: "Humidity", units: "%", position: 2 },
      { id: "102", name: "Acceleration X", units: "m/s²", position: 3 },
      { id: "103", name: "Acceleration Y", units: "m/s²", position: 4 },
      { id: "104", name: "Acceleration Z", units: "m/s²", position: 5 }
    ],
    defaultPeriodMs: 50,
    supportsDualCollection: true
  },
  "ESP32-HCSR04": {
    deviceId: "ESP32-HCSR04",
    name: "ESP32 Distance Sensor",
    channels: [
      { id: "100", name: "Distance", units: "cm", position: 1 }
    ],
    defaultPeriodMs: 50,  // 20 Hz
    supportsDualCollection: false
  },
  "ESP32-HX711": {
    deviceId: "ESP32-HX711",
    name: "ESP32 Force Sensor",
    channels: [
      { id: "100", name: "Force", units: "N", position: 1 },
      { id: "101", name: "Mass", units: "g", position: 2 }
    ],
    defaultPeriodMs: 80,  // HX711 max ~12 Hz
    supportsDualCollection: true
  },
  "ESP32-BMP280": {
    deviceId: "ESP32-BMP280",
    name: "ESP32 Barometric Pressure Sensor",
    channels: [
      { id: "100", name: "Pressure", units: "hPa", position: 1 },
      { id: "101", name: "Temperature", units: "°C", position: 2 },
      { id: "102", name: "Altitude", units: "m", position: 3 }
    ],
    defaultPeriodMs: 100,
    supportsDualCollection: true
  },
  "ESP32-GENERIC": {
    deviceId: "ESP32-GENERIC",
    name: "ESP32 Generic Sensor",
    // Channels are populated dynamically from device_info packet
    channels: [],
    defaultPeriodMs: 100,
    supportsDualCollection: true
  }
};

/**
 * Build a SensorConfig from a DeviceProfile.
 * Creates the column definitions and set structure expected by SensorConfiguration.
 * Channel IDs are numeric strings (e.g., "100", "101") matching the convention
 * used by other managers. colIDs in sets are numbers.
 */
export function buildSensorConfigFromProfile(profile: DeviceProfile): SensorConfig {
  const columns: Record<string, any> = {};
  const colIDs: number[] = [];

  profile.channels.forEach((channel, index) => {
    const id = channel.id;
    const numericId = parseInt(id, 10);
    columns[id] = {
      id,
      setID: "100",
      position: channel.position || (index + 1),
      name: channel.name,
      units: channel.units,
      liveValue: "NaN",
      liveValueTimeStamp: new Date(),
      valueCount: 0,
      valuesTimeStamp: new Date()
    };
    if (!isNaN(numericId)) {
      colIDs.push(numericId);
    }
  });

  return {
    collection: { canControl: true, isCollecting: false },
    columnListTimeStamp: new Date(),
    columns,
    currentInterface: profile.name,
    currentState: "unknown",
    os: { name: "ESP32", version: "1.0.0" },
    requestTimeStamp: new Date(),
    server: { arch: "ESP32", version: "1.0.0" },
    sessionDesc: profile.name,
    sessionID: "esp32-session",
    sets: {
      "100": {
        name: "Run 1",
        colIDs
      }
    }
  };
}

/**
 * Resolve a DeviceProfile from BLE device info received from the ESP32.
 * Tries to match by device name/ID, falls back to building dynamically from
 * the sensors list, or uses the generic profile.
 */
export function resolveDeviceProfile(deviceInfo: BLEDeviceInfo): DeviceProfile {
  // Try to match by device name or ID
  const deviceId = deviceInfo.name || "";
  const profile = ESP32_DEVICE_PROFILES[deviceId];
  if (profile) {
    return profile;
  }

  // Build profile dynamically from device info sensors list.
  // Use numeric string IDs starting at 100 to match SensorConfig convention.
  if (deviceInfo.sensors && Array.isArray(deviceInfo.sensors) && deviceInfo.sensors.length > 0) {
    return {
      deviceId: deviceId || "ESP32-GENERIC",
      name: deviceInfo.name || "ESP32 Sensor",
      channels: deviceInfo.sensors.map((s: { id?: string; name?: string; units?: string }, i: number) => ({
        id: s.id || `${100 + i}`,
        name: s.name || `Sensor ${i + 1}`,
        units: s.units || "",
        position: i + 1
      })),
      defaultPeriodMs: deviceInfo.defaultPeriodMs || 100,
      supportsDualCollection: true
    };
  }

  // Fallback to generic
  return ESP32_DEVICE_PROFILES["ESP32-GENERIC"];
}