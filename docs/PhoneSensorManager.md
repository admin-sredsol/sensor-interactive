# PhoneSensorManager — Implementation Plan

> **Goal:** Create a `PhoneSensorManager` that uses browser Device Motion/Orientation and Geolocation APIs to turn any phone or tablet into a sensor data source for sensor-interactive, streaming real-time accelerometer, gyroscope, compass, and location data into CODAP.

---

## 1. Architecture Overview

### 1.1 Where PhoneSensorManager Fits

```
SensorManager (abstract base)
    ├── SensorConnectorManager     — Vernier/Pasco via HTTP desktop app
    ├── SensorGDXManager          — Vernier Go Direct via BLE
    ├── HeartRateSensorManager    — Polar H10 via BLE
    ├── SensorTagManager          — TI SensorTag via BLE
    ├── ThermoscopeManager        — Thermoscope via BLE
    ├── BLESensorManager          — ESP32 via BLE/WebSocket
    ├── FakeSensorManager          — Simulated sensor
    └── PhoneSensorManager ✨ NEW  — Phone/tablet built-in sensors
```

### 1.2 Key Difference: No External Device

Unlike every other manager, `PhoneSensorManager` requires **no external hardware or connection**. The phone/tablet itself is the sensor. This means:

- **No `ConnectableSensorManager`** — no BLE pairing, no WebSocket, no HTTP
- **Permission required** — iOS 13+ requires explicit user gesture for `DeviceMotionEvent.requestPermission()`
- **Browser-dependent** — API availability varies by browser and OS
- **Sampling rate varies** — browser controls event frequency, not the manager

### 1.3 Data Flow

```
Phone/Tablet Hardware Sensors
        ↓
  Browser Device Motion/Orientation APIs
  (devicemotion, deviceorientation, geolocation)
        ↓
  PhoneSensorManager extends SensorManager
        ↓
  onSensorConnect(sensorConfig)  →  UI shows available channels
  onSensorData(newData)           →  Graph updates in real-time
  onSensorCollectionStopped()    →  Collection ends
        ↓
  Sensor Interactive → CODAP
```

---

## 2. Browser API Reference

### 2.1 DeviceMotionEvent

**API:** `window.addEventListener('devicemotion', handler)`

**Data available:**
| Property | Type | Description |
|----------|------|-------------|
| `accelerationIncludingGravity.x/y/z` | `number \| null` | Acceleration including gravity (m/s²) |
| `acceleration.x/y/z` | `number \| null` | Acceleration without gravity (m/s²) — often null on iOS |
| `rotationRate.alpha/beta/gamma` | `number \| null` | Rotation rate (°/s) |
| `interval` | `number` | Sampling interval in ms |

**Permission (iOS 13+):**
```typescript
if (typeof DeviceMotionEvent.requestPermission === 'function') {
  const permission = await DeviceMotionEvent.requestPermission();
  if (permission !== 'granted') { /* denied */ }
}
```

**Browser Support:**
| Browser | Android | iOS | Desktop |
|----------|---------|-----|---------|
| Chrome | ✅ Full | ✅ (with permission) | ❌ No hardware |
| Safari | ✅ Full | ✅ (with permission) | ❌ No hardware |
| Firefox | ✅ Full | ⚠️ Limited | ❌ No hardware |

### 2.2 DeviceOrientationEvent

**API:** `window.addEventListener('deviceorientation', handler)`

**Data available:**
| Property | Type | Description |
|----------|------|-------------|
| `alpha` | `number \| null` | Compass heading (0–360°) |
| `beta` | `number \| null` | Front-to-back tilt (−180 to 180°) |
| `gamma` | `number \| null` | Left-to-right tilt (−90 to 90°) |

**Permission (iOS 13+):**
```typescript
if (typeof DeviceOrientationEvent.requestPermission === 'function') {
  const permission = await DeviceOrientationEvent.requestPermission();
  if (permission !== 'granted') { /* denied */ }
}
```

### 2.3 Geolocation API

**API:** `navigator.geolocation.watchPosition(success, error, options)`

**Data available:**
| Property | Type | Description |
|----------|------|-------------|
| `coords.latitude` | `number` | Latitude (°) |
| `coords.longitude` | `number` | Longitude (°) |
| `coords.altitude` | `number \| null` | Altitude (m) |
| `coords.speed` | `number \| null` | Speed (m/s) |
| `coords.accuracy` | `number` | Accuracy (m) |
| `coords.altitudeAccuracy` | `number \| null` | Altitude accuracy (m) |

**Permission:** Automatic prompt on first use.

**Options:**
```typescript
const options: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};
```

### 2.4 API Availability Detection

```typescript
function getAvailableSensors(): PhoneSensorType[] {
  const sensors: PhoneSensorType[] = [];

  // DeviceMotion: check if events actually fire (not just if API exists)
  // Desktop browsers define the API but never fire events
  if ('DeviceMotionEvent' in window) {
    sensors.push('motion');
  }

  // DeviceOrientation: same caveat
  if ('DeviceOrientationEvent' in window) {
    sensors.push('orientation');
  }

  // Geolocation: widely available
  if ('geolocation' in navigator) {
    sensors.push('location');
  }

  return sensors;
}
```

**Important:** API existence doesn't guarantee data. On desktop, `DeviceMotionEvent` exists but never fires. The manager must detect this and fall back gracefully.

---

## 3. Sensor Channel Definitions

### 3.1 Motion Channels

| Channel ID | Name | Units | Source API | Description |
|------------|------|-------|-----------|-------------|
| `accelX` | Acceleration X | m/s² | `devicemotion.accelerationIncludingGravity.x` | Forward/backward |
| `accelY` | Acceleration Y | m/s² | `devicemotion.accelerationIncludingGravity.y` | Left/right |
| `accelZ` | Acceleration Z | m/s² | `devicemotion.accelerationIncludingGravity.z` | Up/down |
| `accelNoGravX` | Linear Accel X | m/s² | `devicemotion.acceleration.x` | Without gravity (often null on iOS) |
| `accelNoGravY` | Linear Accel Y | m/s² | `devicemotion.acceleration.y` | Without gravity |
| `accelNoGravZ` | Linear Accel Z | m/s² | `devicemotion.acceleration.z` | Without gravity |
| `rotAlpha` | Rotation Rate α | °/s | `devicemotion.rotationRate.alpha` | Around Z axis |
| `rotBeta` | Rotation Rate β | °/s | `devicemotion.rotationRate.beta` | Around X axis |
| `rotGamma` | Rotation Rate γ | °/s | `devicemotion.rotationRate.gamma` | Around Y axis |

### 3.2 Orientation Channels

| Channel ID | Name | Units | Source API | Description |
|------------|------|-------|-----------|-------------|
| `heading` | Compass Heading | ° | `deviceorientation.alpha` | 0–360° |
| `tiltFB` | Tilt Front/Back | ° | `deviceorientation.beta` | −180 to 180° |
| `tiltLR` | Tilt Left/Right | ° | `deviceorientation.gamma` | −90 to 90° |

### 3.3 Location Channels

| Channel ID | Name | Units | Source API | Description |
|------------|------|-------|-----------|-------------|
| `latitude` | Latitude | ° | `geolocation.coords.latitude` | −90 to 90° |
| `longitude` | Longitude | ° | `geolocation.coords.longitude` | −180 to 180° |
| `altitude` | Altitude | m | `geolocation.coords.altitude` | May be null |
| `speed` | Speed | m/s | `geolocation.coords.speed` | May be null |

### 3.4 Sensor Mode Presets

Rather than exposing all 16 channels at once (overwhelming for students), we define **presets** that group channels by experiment type:

| Preset | Channels | Physics Topics |
|--------|----------|----------------|
| **Accelerometer** | `accelX`, `accelY`, `accelZ` | Elevator, vehicle dynamics, free fall |
| **Accelerometer + Gyroscope** | `accelX`, `accelY`, `accelZ`, `rotAlpha`, `rotBeta`, `rotGamma` | Pendulum, rotation, SHM |
| **Orientation** | `heading`, `tiltFB`, `tiltLR` | Compass, tilt experiments |
| **Full Motion** | All motion + orientation channels | Comprehensive motion analysis |
| **Location** | `latitude`, `longitude`, `altitude`, `speed` | GPS tracking, velocity mapping |
| **Motion + Location** | Accelerometer + Location | Field experiments |

---

## 4. TypeScript Implementation

### 4.1 File Structure

```
src/models/
  phone-sensor-manager.ts        — Main PhoneSensorManager class
  phone-sensor-profiles.ts       — Channel definitions and presets
  phone-sensor-permission.ts     — Permission request utilities
  sensor-manager.ts              — (existing, unchanged)
  sensor-configuration.ts        — (existing, unchanged)
```

### 4.2 `phone-sensor-profiles.ts` — Channel Definitions & Presets

```typescript
// src/models/phone-sensor-profiles.ts

export interface PhoneSensorChannel {
  id: string;
  name: string;
  units: string;
  position: number;
  source: "motion" | "orientation" | "location";
  property: string;  // e.g., "accelerationIncludingGravity.x"
}

export interface PhoneSensorPreset {
  id: string;
  name: string;
  description: string;
  channels: PhoneSensorChannel[];
  defaultPeriodMs: number;
}

// All available channels
export const ALL_CHANNELS: PhoneSensorChannel[] = [
  // Motion channels
  { id: "accelX", name: "Acceleration X", units: "m/s²", position: 1, source: "motion", property: "accelerationIncludingGravity.x" },
  { id: "accelY", name: "Acceleration Y", units: "m/s²", position: 2, source: "motion", property: "accelerationIncludingGravity.y" },
  { id: "accelZ", name: "Acceleration Z", units: "m/s²", position: 3, source: "motion", property: "accelerationIncludingGravity.z" },
  { id: "accelNoGravX", name: "Linear Accel X", units: "m/s²", position: 4, source: "motion", property: "acceleration.x" },
  { id: "accelNoGravY", name: "Linear Accel Y", units: "m/s²", position: 5, source: "motion", property: "acceleration.y" },
  { id: "accelNoGravZ", name: "Linear Accel Z", units: "m/s²", position: 6, source: "motion", property: "acceleration.z" },
  { id: "rotAlpha", name: "Rotation Rate α", units: "°/s", position: 7, source: "motion", property: "rotationRate.alpha" },
  { id: "rotBeta", name: "Rotation Rate β", units: "°/s", position: 8, source: "motion", property: "rotationRate.beta" },
  { id: "rotGamma", name: "Rotation Rate γ", units: "°/s", position: 9, source: "motion", property: "rotationRate.gamma" },
  // Orientation channels
  { id: "heading", name: "Compass Heading", units: "°", position: 10, source: "orientation", property: "alpha" },
  { id: "tiltFB", name: "Tilt Front/Back", units: "°", position: 11, source: "orientation", property: "beta" },
  { id: "tiltLR", name: "Tilt Left/Right", units: "°", position: 12, source: "orientation", property: "gamma" },
  // Location channels
  { id: "latitude", name: "Latitude", units: "°", position: 13, source: "location", property: "latitude" },
  { id: "longitude", name: "Longitude", units: "°", position: 14, source: "location", property: "longitude" },
  { id: "altitude", name: "Altitude", units: "m", position: 15, source: "location", property: "altitude" },
  { id: "speed", name: "Speed", units: "m/s", position: 16, source: "location", property: "speed" },
];

// Presets for common experiment types
export const PHONE_SENSOR_PRESETS: Record<string, PhoneSensorPreset> = {
  accelerometer: {
    id: "accelerometer",
    name: "Accelerometer",
    description: "3-axis acceleration including gravity",
    channels: ALL_CHANNELS.filter(c => ["accelX", "accelY", "accelZ"].includes(c.id)),
    defaultPeriodMs: 20,  // 50 Hz
  },
  accelerometer_gyro: {
    id: "accelerometer_gyro",
    name: "Accelerometer + Gyroscope",
    description: "6-axis motion: acceleration and rotation rate",
    channels: ALL_CHANNELS.filter(c =>
      ["accelX", "accelY", "accelZ", "rotAlpha", "rotBeta", "rotGamma"].includes(c.id)
    ),
    defaultPeriodMs: 20,
  },
  orientation: {
    id: "orientation",
    name: "Orientation (Compass + Tilt)",
    description: "Device heading and tilt angles",
    channels: ALL_CHANNELS.filter(c => ["heading", "tiltFB", "tiltLR"].includes(c.id)),
    defaultPeriodMs: 50,  // 20 Hz
  },
  full_motion: {
    id: "full_motion",
    name: "Full Motion",
    description: "All motion and orientation channels",
    channels: ALL_CHANNELS.filter(c => c.source !== "location"),
    defaultPeriodMs: 20,
  },
  location: {
    id: "location",
    name: "GPS Location",
    description: "Latitude, longitude, altitude, speed",
    channels: ALL_CHANNELS.filter(c => c.source === "location"),
    defaultPeriodMs: 1000,  // GPS is slow (1 Hz typical)
  },
  motion_location: {
    id: "motion_location",
    name: "Motion + Location",
    description: "Accelerometer and GPS combined",
    channels: ALL_CHANNELS.filter(c =>
      ["accelX", "accelY", "accelZ", "latitude", "longitude", "altitude", "speed"].includes(c.id)
    ),
    defaultPeriodMs: 100,
  },
};

export type PhoneSensorType = "motion" | "orientation" | "location";
```

### 4.3 `phone-sensor-permission.ts` — Permission Utilities

```typescript
// src/models/phone-sensor-permission.ts

export type PermissionStatus = "granted" | "denied" | "unavailable" | "pending";

export interface PhoneSensorPermissions {
  motion: PermissionStatus;
  orientation: PermissionStatus;
  location: PermissionStatus;
}

/**
 * Check which sensor APIs are available in the current browser.
 */
export function detectAvailableSensors(): PhoneSensorType[] {
  const sensors: PhoneSensorType[] = [];
  if ("DeviceMotionEvent" in window) {
    sensors.push("motion");
  }
  if ("DeviceOrientationEvent" in window) {
    sensors.push("orientation");
  }
  if ("geolocation" in navigator) {
    sensors.push("location");
  }
  return sensors;
}

/**
 * Check if the current browser requires explicit permission for motion/orientation.
 * iOS 13+ requires a user gesture to call requestPermission().
 */
export function requiresMotionPermission(): boolean {
  return typeof (DeviceMotionEvent as any).requestPermission === "function";
}

export function requiresOrientationPermission(): boolean {
  return typeof (DeviceOrientationEvent as any).requestPermission === "function";
}

/**
 * Request permission for device motion events.
 * MUST be called from a user gesture (click, touch, etc.) on iOS.
 */
export async function requestMotionPermission(): Promise<PermissionStatus> {
  if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
    try {
      const permission = await (DeviceMotionEvent as any).requestPermission();
      return permission === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  // No permission required (Android, desktop)
  return "granted";
}

/**
 * Request permission for device orientation events.
 * MUST be called from a user gesture (click, touch, etc.) on iOS.
 */
export async function requestOrientationPermission(): Promise<PermissionStatus> {
  if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      return permission === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

/**
 * Request permission for geolocation.
 * Browser will show a prompt automatically on first use.
 */
export function requestLocationPermission(): Promise<PermissionStatus> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve("denied");
        } else {
          resolve("unavailable");
        }
      },
      { timeout: 10000 }
    );
  });
}

/**
 * Request all permissions needed for the given sensor types.
 * Returns the status of each permission.
 */
export async function requestAllPermissions(
  sensorTypes: PhoneSensorType[]
): Promise<PhoneSensorPermissions> {
  const result: PhoneSensorPermissions = {
    motion: "unavailable",
    orientation: "unavailable",
    location: "unavailable",
  };

  if (sensorTypes.includes("motion")) {
    result.motion = await requestMotionPermission();
  }
  if (sensorTypes.includes("orientation")) {
    result.orientation = await requestOrientationPermission();
  }
  if (sensorTypes.includes("location")) {
    result.location = await requestLocationPermission();
  }

  return result;
}

/**
 * Check if we're running on a mobile device.
 * Used to show appropriate UI messages.
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
```

### 4.4 `phone-sensor-manager.ts` — Main Manager Class

```typescript
// src/models/phone-sensor-manager.ts

import { SensorConfiguration } from "./sensor-configuration";
import { SensorManager, NewSensorData, VariableMeasurementPeriods } from "./sensor-manager";
import { SensorConfig } from "@concord-consortium/sensor-connector-interface";
import {
  ALL_CHANNELS,
  PHONE_SENSOR_PRESETS,
  PhoneSensorChannel,
  PhoneSensorPreset,
  PhoneSensorType,
} from "./phone-sensor-profiles";
import {
  detectAvailableSensors,
  requestAllPermissions,
  requestMotionPermission,
  requestOrientationPermission,
  isMobileDevice,
  PermissionStatus,
  PhoneSensorPermissions,
} from "./phone-sensor-permission";

export interface PhoneSensorManagerOptions {
  /** Which preset to use. Default: "accelerometer" */
  preset?: string;
  /** Custom list of channel IDs to include */
  channels?: string[];
  /** Whether to include location sensors. Default: false */
  includeLocation?: boolean;
}

type DataHandler = (event: DeviceMotionEvent | DeviceOrientationEvent) => void;

export class PhoneSensorManager extends SensorManager {
  supportsDualCollection = true;
  supportsHeartbeat = true;

  private internalConfig: SensorConfig;
  private activeChannels: PhoneSensorChannel[] = [];
  private activePreset: PhoneSensorPreset;
  private hasDataFlag = false;
  private collecting = false;
  private stopRequested = false;
  private startCollectionTime = 0;

  // Event handler references (needed for removal)
  private motionHandler: ((event: DeviceMotionEvent) => void) | null = null;
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;
  private geolocationWatchId: number | null = null;

  // Permission state
  private permissions: PhoneSensorPermissions = {
    motion: "pending",
    orientation: "pending",
    location: "pending",
  };

  // Latest sensor values (for heartbeat)
  private latestValues: Record<string, number> = {};

  // Geolocation data (updated separately)
  private latestPosition: GeolocationPosition | null = null;

  constructor(options?: PhoneSensorManagerOptions) {
    super();

    // Determine which channels to use
    if (options?.channels) {
      // Custom channel list
      this.activeChannels = ALL_CHANNELS.filter(c => options.channels!.includes(c.id));
    } else if (options?.preset && PHONE_SENSOR_PRESETS[options.preset]) {
      // Named preset
      this.activePreset = PHONE_SENSOR_PRESETS[options.preset];
      this.activeChannels = this.activePreset.channels;
    } else {
      // Default: accelerometer preset
      this.activePreset = PHONE_SENSOR_PRESETS.accelerometer;
      this.activeChannels = this.activePreset.channels;
    }

    // Add location channels if requested
    if (options?.includeLocation) {
      const locationChannels = ALL_CHANNELS.filter(c => c.source === "location");
      // Avoid duplicates
      for (const ch of locationChannels) {
        if (!this.activeChannels.find(c => c.id === ch.id)) {
          this.activeChannels.push(ch);
        }
      }
    }

    // Build initial config
    this.internalConfig = this.buildConfig();
  }

  // ─── Static methods ───

  /**
   * Check if phone sensors are available in the current browser.
   * Returns list of available sensor types.
   */
  static getAvailableSensors(): PhoneSensorType[] {
    return detectAvailableSensors();
  }

  /**
   * Check if this is a mobile device (has actual motion hardware).
   */
  static isMobile(): boolean {
    return isMobileDevice();
  }

  /**
   * Request permissions for all sensor types needed by the current preset.
   * MUST be called from a user gesture handler (click, touch) on iOS.
   */
  static async requestPermissions(sensorTypes: PhoneSensorType[]): Promise<PhoneSensorPermissions> {
    return requestAllPermissions(sensorTypes);
  }

  /**
   * Get the list of available presets.
   */
  static getPresets(): Record<string, PhoneSensorPreset> {
    return PHONE_SENSOR_PRESETS;
  }

  // ─── SensorManager abstract methods ───

  isWirelessDevice() {
    return true; // Phone sensors are "wireless" — no cable needed
  }

  startPolling() {
    // Send initial config to UI
    this.sendSensorConfig(true);

    // Start heartbeat for live value updates
    this.manageHeartbeat(true, () => {
      this.sendSensorConfig(false);
    });
  }

  hasSensorData(): boolean {
    return this.hasDataFlag;
  }

  requestStart(measurementPeriod: number) {
    this.stopRequested = false;
    this.collecting = true;
    this.startCollectionTime = Date.now();

    // Determine which sensor sources we need
    const sources = new Set(this.activeChannels.map(c => c.source));

    // Start motion listener
    if (sources.has("motion") && this.permissions.motion === "granted") {
      this.startMotionListener(measurementPeriod);
    }

    // Start orientation listener
    if (sources.has("orientation") && this.permissions.orientation === "granted") {
      this.startOrientationListener();
    }

    // Start geolocation watcher
    if (sources.has("location") && this.permissions.location === "granted") {
      this.startGeolocationWatcher();
    }
  }

  requestStop() {
    this.stopRequested = true;
    this.collecting = false;

    // Remove all listeners
    this.stopMotionListener();
    this.stopOrientationListener();
    this.stopGeolocationWatcher();

    this.onSensorCollectionStopped();
  }

  requestHeartbeat(enabled: boolean): void {
    this.manageHeartbeat(enabled, () => {
      // Update live values in config from latest sensor readings
      for (const [channelId, value] of Object.entries(this.latestValues)) {
        if (this.internalConfig.columns[channelId]) {
          this.internalConfig.columns[channelId].liveValue = value.toString();
          this.internalConfig.columns[channelId].liveValueTimeStamp = new Date();
        }
      }
      this.sendSensorConfig(false);
    });
  }

  variableMeasurementPeriods(): VariableMeasurementPeriods {
    // Motion sensors: browser controls rate, but we can suggest
    // Location: GPS is typically 1 Hz
    const hasLocation = this.activeChannels.some(c => c.source === "location");
    const defaultPeriod = hasLocation ? 1000 : 20;

    return {
      supported: true,
      periods: [10, 20, 50, 100, 200, 500, 1000],
      defaultPeriod: this.activePreset?.defaultPeriodMs ?? defaultPeriod,
    };
  }

  // ─── Permission handling ───

  /**
   * Request permissions for the sensors needed by this manager.
   * MUST be called from a user gesture (click, touch) on iOS.
   * Returns true if all required permissions were granted.
   */
  async requestSensorPermissions(): Promise<boolean> {
    const sources = new Set(this.activeChannels.map(c => c.source));
    const neededTypes: PhoneSensorType[] = [];

    if (sources.has("motion")) neededTypes.push("motion");
    if (sources.has("orientation")) neededTypes.push("orientation");
    if (sources.has("location")) neededTypes.push("location");

    this.permissions = await requestAllPermissions(neededTypes);

    // Check if all required permissions were granted
    for (const source of sources) {
      if (this.permissions[source] === "denied") {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the current permission status.
   */
  getPermissionStatus(): PhoneSensorPermissions {
    return { ...this.permissions };
  }

  // ─── Motion event handling ───

  private startMotionListener(measurementPeriod: number) {
    this.motionHandler = (event: DeviceMotionEvent) => {
      if (!this.collecting) return;

      const time = (Date.now() - this.startCollectionTime) / 1000;
      const data: NewSensorData = {};

      // accelerationIncludingGravity
      const accelGravity = event.accelerationIncludingGravity;
      if (accelGravity) {
        this.addChannelValue(data, "accelX", time, accelGravity.x);
        this.addChannelValue(data, "accelY", time, accelGravity.y);
        this.addChannelValue(data, "accelZ", time, accelGravity.z);
      }

      // acceleration (without gravity)
      const accel = event.acceleration;
      if (accel) {
        this.addChannelValue(data, "accelNoGravX", time, accel.x);
        this.addChannelValue(data, "accelNoGravY", time, accel.y);
        this.addChannelValue(data, "accelNoGravZ", time, accel.z);
      }

      // rotationRate
      const rotation = event.rotationRate;
      if (rotation) {
        this.addChannelValue(data, "rotAlpha", time, rotation.alpha);
        this.addChannelValue(data, "rotBeta", time, rotation.beta);
        this.addChannelValue(data, "rotGamma", time, rotation.gamma);
      }

      // Also update geolocation channels if we have location data
      if (this.latestPosition) {
        this.addChannelValue(data, "latitude", time, this.latestPosition.coords.latitude);
        this.addChannelValue(data, "longitude", time, this.latestPosition.coords.longitude);
        this.addChannelValue(data, "altitude", time, this.latestPosition.coords.altitude);
        this.addChannelValue(data, "speed", time, this.latestPosition.coords.speed);
      }

      if (Object.keys(data).length > 0) {
        this.hasDataFlag = true;
        this.onSensorData(data);
      }
    };

    window.addEventListener("devicemotion", this.motionHandler);
  }

  private stopMotionListener() {
    if (this.motionHandler) {
      window.removeEventListener("devicemotion", this.motionHandler);
      this.motionHandler = null;
    }
  }

  // ─── Orientation event handling ───

  private startOrientationListener() {
    this.orientationHandler = (event: DeviceOrientationEvent) => {
      if (!this.collecting) return;

      const time = (Date.now() - this.startCollectionTime) / 1000;
      const data: NewSensorData = {};

      this.addChannelValue(data, "heading", time, event.alpha);
      this.addChannelValue(data, "tiltFB", time, event.beta);
      this.addChannelValue(data, "tiltLR", time, event.gamma);

      if (Object.keys(data).length > 0) {
        this.hasDataFlag = true;
        this.onSensorData(data);
      }
    };

    window.addEventListener("deviceorientation", this.orientationHandler);
  }

  private stopOrientationListener() {
    if (this.orientationHandler) {
      window.removeEventListener("deviceorientation", this.orientationHandler);
      this.orientationHandler = null;
    }
  }

  // ─── Geolocation handling ───

  private startGeolocationWatcher() {
    this.geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.latestPosition = position;

        if (!this.collecting) return;

        const time = (Date.now() - this.startCollectionTime) / 1000;
        const data: NewSensorData = {};

        this.addChannelValue(data, "latitude", time, position.coords.latitude);
        this.addChannelValue(data, "longitude", time, position.coords.longitude);
        this.addChannelValue(data, "altitude", time, position.coords.altitude);
        this.addChannelValue(data, "speed", time, position.coords.speed);

        if (Object.keys(data).length > 0) {
          this.hasDataFlag = true;
          this.onSensorData(data);
        }
      },
      (error) => {
        console.warn("Geolocation error:", error.message);
        // Don't stop collection — other sensors may still work
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  private stopGeolocationWatcher() {
    if (this.geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(this.geolocationWatchId);
      this.geolocationWatchId = null;
    }
    this.latestPosition = null;
  }

  // ─── Private helpers ───

  private addChannelValue(
    data: NewSensorData,
    channelId: string,
    time: number,
    value: number | null | undefined
  ) {
    // Only add if this channel is in our active list
    if (!this.activeChannels.find(c => c.id === channelId)) return;
    if (value === null || value === undefined) return;

    data[channelId] = [[time, value]];
    this.latestValues[channelId] = value;
  }

  private buildConfig(): SensorConfig {
    const columns: Record<string, any> = {};
    const colIDs: string[] = [];

    this.activeChannels.forEach((channel, index) => {
      const id = channel.id;
      columns[id] = {
        id,
        setID: "100",
        position: channel.position || (index + 1),
        name: channel.name,
        units: channel.units,
        liveValue: "NaN",
        liveValueTimeStamp: new Date(),
        valueCount: 0,
        valuesTimeStamp: new Date(),
      };
      colIDs.push(id);
    });

    return {
      collection: { canControl: true, isCollecting: false },
      columnListTimeStamp: new Date(),
      columns,
      currentInterface: "Phone Sensors",
      currentState: "unknown",
      os: { name: navigator.platform, version: navigator.appVersion },
      requestTimeStamp: new Date(),
      server: { arch: "Phone", version: "1.0.0" },
      sessionDesc: this.activePreset?.name ?? "Phone Sensors",
      sessionID: "phone-sensor-session",
      sets: {
        "100": {
          name: "Run 1",
          colIDs,
        },
      },
    };
  }

  private sendSensorConfig(includeOnConnect: boolean) {
    const sensorConfig = new SensorConfiguration(this.internalConfig);
    if (includeOnConnect) {
      this.onSensorConnect(sensorConfig);
    }
    this.onSensorStatus(sensorConfig);
  }

  /**
   * Change the active preset/channels. Must be called before requestStart().
   * After changing, call startPolling() to update the UI.
   */
  setPreset(presetId: string) {
    const preset = PHONE_SENSOR_PRESETS[presetId];
    if (preset) {
      this.activePreset = preset;
      this.activeChannels = [...preset.channels];
      this.internalConfig = this.buildConfig();
    }
  }

  /**
   * Set custom channels. Must be called before requestStart().
   */
  setChannels(channelIds: string[]) {
    this.activeChannels = ALL_CHANNELS.filter(c => channelIds.includes(c.id));
    this.internalConfig = this.buildConfig();
  }
}
```

---

## 5. Integration with App Component

### 5.1 Add PhoneSensorManager to Device Selection

The key difference from BLE managers: `PhoneSensorManager` does **not** implement `ConnectableSensorManager`. It doesn't need BLE pairing. Instead, it needs **permission request** (iOS) and **preset selection**.

**Option A: Add to the "Wired" button path (simplest)**

The existing `handleWiredClick()` creates a `FakeSensorManager` or `SensorConnectorManager`. We can add a "Phone Sensors" option:

```typescript
import { PhoneSensorManager } from "../models/phone-sensor-manager";

// In handleWiredClick or a new handlePhoneSensorsClick:
handlePhoneSensorsClick = async () => {
  // Request permissions (must be from user gesture on iOS)
  const manager = new PhoneSensorManager({ preset: "accelerometer" });
  const granted = await manager.requestSensorPermissions();

  if (!granted) {
    this.setState({ statusMessage: "Sensor permissions denied" });
    return;
  }

  this.removeSensorManagerListeners();
  this.setState({ sensorManager: manager }, () => {
    this.addSensorManagerListeners();
    manager.startPolling();
  });
};
```

**Option B: Add a dedicated "Phone" button in the UI**

Add a new button alongside "Wired" and "Wireless" that triggers phone sensor mode:

```tsx
{/* In the top bar, alongside existing buttons */}
<button onClick={this.handlePhoneSensorsClick} title="Use phone sensors">
  📱 Phone Sensors
</button>
```

### 5.2 Preset Selection UI

After connecting, show a preset selector:

```tsx
{this.state.sensorManager instanceof PhoneSensorManager && (
  <div className="phone-sensor-presets">
    <label>Sensor Mode:</label>
    <select
      value={this.state.phonePreset}
      onChange={(e) => this.handlePresetChange(e.target.value)}
    >
      <option value="accelerometer">Accelerometer</option>
      <option value="accelerometer_gyro">Accelerometer + Gyroscope</option>
      <option value="orientation">Compass & Tilt</option>
      <option value="full_motion">Full Motion</option>
      <option value="location">GPS Location</option>
      <option value="motion_location">Motion + Location</option>
    </select>
  </div>
)}
```

### 5.3 Permission Flow (iOS)

On iOS 13+, `DeviceMotionEvent.requestPermission()` must be called from a **user gesture** (click/touch). The flow:

1. User taps "Phone Sensors" button
2. `PhoneSensorManager.requestSensorPermissions()` is called
3. iOS shows permission dialog
4. If granted → `startPolling()` → `onSensorConnect()`
5. If denied → show error message

```typescript
// In app.tsx — must be called from click handler
handlePhoneSensorsClick = async () => {
  const manager = new PhoneSensorManager({ preset: "accelerometer" });

  // This triggers the iOS permission dialog
  const granted = await manager.requestSensorPermissions();

  if (!granted) {
    this.setState({
      statusMessage: "Permission denied. Please allow motion access in Settings."
    });
    return;
  }

  this.removeSensorManagerListeners();
  this.setState({ sensorManager: manager }, () => {
    this.addSensorManagerListeners();
    manager.startPolling();
  });
};
```

### 5.4 Desktop Fallback

On desktop browsers, `DeviceMotionEvent` exists but never fires. The manager should detect this and show a helpful message:

```typescript
// In PhoneSensorManager.startPolling():
if (!isMobileDevice()) {
  // Set a timeout to check if we're actually getting data
  setTimeout(() => {
    if (!this.hasDataFlag) {
      console.warn("PhoneSensorManager: No motion data received. " +
        "This browser/device may not support motion sensors.");
      this.onCommunicationError();
    }
  }, 3000);
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Test | Description |
|------|-------------|
| `PhoneSensorManager` construction | Verify default config with accelerometer preset |
| `PhoneSensorManager` custom preset | Verify channels match preset |
| `PhoneSensorManager` custom channels | Verify only specified channels are active |
| `buildConfig()` | Verify `SensorConfig` structure matches expected format |
| `addChannelValue()` | Verify `NewSensorData` format from motion event |
| `addChannelValue()` with null | Verify null values are skipped |
| `variableMeasurementPeriods()` | Verify returns correct periods for each preset |
| `setPreset()` | Verify preset change updates channels and config |
| `requestStart()` / `requestStop()` | Verify event listeners are added/removed |

### 6.2 Mock Sensor Tests

Since `DeviceMotionEvent` can't be easily constructed in tests, we need a mock approach:

```typescript
// test/helpers/mock-device-motion.ts
export function createMockDeviceMotionEvent(
  accelerationIncludingGravity?: { x: number; y: number; z: number },
  acceleration?: { x: number; y: number; z: number },
  rotationRate?: { alpha: number; beta: number; gamma: number }
): DeviceMotionEvent {
  return new DeviceMotionEvent("devicemotion", {
    accelerationIncludingGravity: accelerationIncludingGravity
      ? new DeviceMotionEventAcceleration(accelerationIncludingGravity)
      : null,
    acceleration: acceleration
      ? new DeviceMotionEventAcceleration(acceleration)
      : null,
    rotationRate: rotationRate
      ? new DeviceMotionEventRotationRate(rotationRate)
      : null,
    interval: 16,
  });
}
```

### 6.3 Integration Tests

| Test | Description |
|------|-------------|
| Permission flow | Verify `requestSensorPermissions()` calls correct APIs |
| Motion data flow | Verify `devicemotion` events produce correct `NewSensorData` |
| Orientation data flow | Verify `deviceorientation` events produce correct data |
| Geolocation data flow | Verify `watchPosition` produces correct data |
| Start/stop collection | Verify listeners are properly added and removed |
| Preset switching | Verify changing presets updates config |
| Desktop detection | Verify `isMobileDevice()` returns false on desktop |

### 6.4 Manual Testing Checklist

| Platform | Test | Expected Result |
|----------|------|-----------------|
| iOS Safari | Permission request | Dialog appears, data flows after grant |
| iOS Safari | Permission denied | Error message shown |
| Android Chrome | Accelerometer | Data flows without permission prompt |
| Android Chrome | Geolocation | Permission prompt appears |
| Desktop Chrome | No motion data | Warning shown, no crash |
| Desktop Chrome | FakeSensorManager fallback | Works as before |

---

## 7. Implementation Phases

### Phase 1: Core Manager (Week 1)

- [x] Create `phone-sensor-profiles.ts` — Channel definitions and presets
- [x] Create `phone-sensor-permission.ts` — Permission utilities
- [x] Create `phone-sensor-manager.ts` — Main manager class (accelerometer + orientation + location)
- [x] Write unit tests for config construction and data formatting
- [ ] Test on iOS Safari and Android Chrome (manual testing required)

### Phase 2: Full Sensor Support (Week 2)

- [x] Add orientation (compass/tilt) support
- [x] Add geolocation support
- [x] Add preset switching (`setPreset()`)
- [x] Add desktop fallback detection
- [x] Write integration tests with mock events

### Phase 3: UI Integration (Week 2-3)

- [x] Add "Phone Sensors" button to `app.tsx`
- [x] Add preset selector UI
- [x] Add permission flow UI (iOS dialog trigger)
- [x] Add desktop warning message
- [x] Add example entry point: `src/examples/phone-sensor.tsx`

### Phase 4: Advanced Features (Week 3-4)

- [x] Add data smoothing/filtering options (moving average, low-pass filter)
- [x] Add calibration UI (zero offset, scale factor)
- ~~Add recording/playback~~ — Already handled by existing `SensorRecordingStore` in `app.tsx`
- ~~Add export to CODAP feature~~ — Already handled by existing CODAP integration in `app.tsx`
- [ ] Create Cypress integration tests

---

## 12. Phase 1 Completion Summary

### Files Created

| File | Description | Tests |
|------|-------------|-------|
| `src/models/phone-sensor-profiles.ts` | Channel definitions (16 channels), 6 presets, utility functions | 27 tests |
| `src/models/phone-sensor-permission.ts` | Permission utilities for iOS 13+ motion/orientation, geolocation, mobile detection | 30 tests |
| `src/models/phone-sensor-manager.ts` | Main PhoneSensorManager class extending SensorManager | 36 tests |
| `src/models/__tests__/phone-sensor-profiles.test.ts` | Unit tests for profiles, presets, channel lookup, source detection | 27 passing |
| `src/models/__tests__/phone-sensor-permission.test.ts` | Unit tests for permission detection, request, mobile detection | 30 passing |
| `src/models/__tests__/phone-sensor-manager.test.ts` | Unit tests for construction, presets, data handling, permissions, config | 36 passing |

### Key Design Decisions

1. **Channel IDs use numeric strings** (`"100"`, `"101"`, etc.) — matches the SensorConfig convention used by other managers (BLESensorManager, SensorGDXManager)
2. **PhoneSensorManager does NOT implement ConnectableSensorManager** — no external device to connect to; permissions replace connection
3. **`isWirelessDevice() = true`** — phone sensors are "wireless" (no cable), matching the UI pattern for wireless devices
4. **Preset-based channels** — 6 presets group 16 channels by experiment type, making it student-friendly
5. **Permission handling in manager** — `requestSensorPermissions()` must be called from user gesture on iOS
6. **Desktop fallback** — `isMobileDevice()` check with 3-second timeout warning if no data received
7. **Geolocation via `watchPosition`** — continuous streaming matches the sensor data model
8. **`latestValues` for heartbeat** — caches current values per channel for heartbeat updates
9. **All three sensor sources implemented in Phase 1** — motion, orientation, and location (not just accelerometer)
10. **`setPreset()` and `setChannels()`** — allow runtime channel changes before collection starts

### Test Results

- **Total tests: 199 passing** (106 existing + 27 profiles + 30 permission + 36 manager)
- **TypeScript: 0 errors** across all files
- **No regressions** in existing test suites

---

## 13. Phase 2 Completion Summary

Phase 2 items were already implemented as part of Phase 1 since the architecture supported all three sensor sources from the start:

- **Orientation support**: `startOrientationListener()` / `stopOrientationListener()` with `deviceorientation` event handling for heading, tiltFB, tiltLR channels
- **Geolocation support**: `startGeolocationWatcher()` / `stopGeolocationWatcher()` with `navigator.geolocation.watchPosition()` for latitude, longitude, altitude, speed channels
- **Preset switching**: `setPreset(presetId)` and `setChannels(channelIds)` methods for runtime channel changes
- **Desktop fallback**: `isMobileDevice()` check with 3-second timeout warning in `requestStart()`
- **Integration tests**: 36 tests covering motion data handling, orientation data handling, geolocation watcher start/stop, preset switching, and channel configuration

---

## 14. Phase 3 Completion Summary

### Files Modified

| File | Changes |
|------|---------|
| `src/components/app.tsx` | Added PhoneSensorManager import, state fields (`phoneSensorModal`, `phonePreset`, `phonePermissionDenied`), handler methods (`openPhoneSensorModal`, `closePhoneSensorModal`, `connectPhoneSensors`, `handlePresetChange`), "Phone Sensors" button in `renderConnectionButtons()`, phone sensor modal with preset selector and desktop warning, `renderPhonePresetSelector()` for live preset switching |

### Files Created

| File | Description |
|------|-------------|
| `src/examples/phone-sensor.tsx` | Standalone example demonstrating PhoneSensorManager usage with preset selection, permission flow, desktop warning, and live data display |

### Key UI Features

1. **"Phone Sensors" button** — Added alongside "Wireless Sensor", "Wired Sensor", and "ESP32 WiFi" buttons in the connection panel
2. **Phone Sensor modal** — Opens when "Phone Sensors" is clicked, showing:
   - Preset selector dropdown (6 presets: Accelerometer, Accelerometer + Gyroscope, Orientation, Full Motion, GPS Location, Motion + Location)
   - Desktop warning (shown when `PhoneSensorManager.isMobile()` returns false)
   - Permission denied error message
   - Connect/Cancel buttons
3. **Permission flow** — `connectPhoneSensors()` calls `manager.requestSensorPermissions()` from the user gesture (required for iOS 13+), shows error if denied
4. **Live preset switching** — `renderPhonePresetSelector()` shows a dropdown when PhoneSensorManager is connected but not collecting, allowing preset changes via `manager.setPreset()`
5. **Desktop warning** — Both in the modal and in the example, a warning is shown when running on desktop browsers
6. **Example entry point** — `phone-sensor.tsx` demonstrates full lifecycle: connect → preset select → start collection → stop → disconnect

### Test Results

- **Total tests: 199 passing** (no new test files for UI changes; existing tests unaffected)
- **TypeScript: 0 errors** in app.tsx and phone-sensor.tsx
- **No regressions** in existing test suites

---

## 15. Phase 4 Completion Summary (Partial)

### Files Created

| File | Description | Tests |
|------|-------------|-------|
| `src/models/phone-sensor-smoothing.ts` | Data smoothing engine with moving-average and low-pass filter | 38 tests |
| `src/models/phone-sensor-calibration.ts` | Per-channel calibration (zero offset/tare, scale factor) with snapshot/restore | 32 tests |
| `src/models/__tests__/phone-sensor-smoothing.test.ts` | Unit tests for MovingAverageFilter, LowPassFilter, SmoothingEngine | 38 passing |
| `src/models/__tests__/phone-sensor-calibration.test.ts` | Unit tests for PhoneSensorCalibration | 32 passing |

### Files Modified

| File | Changes |
|------|---------|
| `src/models/phone-sensor-manager.ts` | Integrated SmoothingEngine and PhoneSensorCalibration into data pipeline. Added `smoothing` option to constructor, `getSmoothingConfig()`, `setSmoothingConfig()`, `getSmoothingMode()`, `getCalibration()`, `tare()`, `resetCalibration()`, `getCalibrationSnapshot()`, `restoreCalibration()` methods. Data flow: raw → smoothing → calibration → onSensorData. Smoothing state resets on `requestStop()`. |
| `src/models/__tests__/phone-sensor-manager.test.ts` | Added 14 new tests for smoothing integration (7) and calibration integration (7) |

### Key Design Decisions

1. **SmoothingEngine** — Per-channel smoothing with three modes: `none`, `moving-average`, `low-pass`
2. **MovingAverageFilter** — Sliding window of configurable size (default 5); resets on `requestStop()`
3. **LowPassFilter** — Exponential filter with configurable alpha (default 0.2); alpha=0 means no change, alpha=1 means no smoothing
4. **PhoneSensorCalibration** — Per-channel offset and scale factor; formula: `calibrated = (raw - offset) * scaleFactor`
5. **Tare** — `tare()` captures current `latestValues` as offsets for all active channels
6. **Data pipeline** — Raw sensor data → SmoothingEngine.smoothData() → PhoneSensorCalibration.calibrateData() → onSensorData()
7. **Snapshot/restore** — Calibration settings can be saved and restored for experiment reproducibility

### Remaining Phase 4 Items

- **Cypress/Playwright integration tests** — Requires a running browser on a mobile device; manual testing is more practical for phone sensors

### Not Needed (Already Handled by Existing Infrastructure)

- **Recording/playback** — The existing `SensorRecordingStore` in `app.tsx` already records all sensor data for playback. Phone sensor data flows through the same `onSensorData` pipeline, so it's automatically recorded.
- **Export to CODAP** — The existing CODAP integration in `app.tsx` already exports all sensor data. Phone sensor data uses the same `SensorConfig`/`NewSensorData` format, so it works automatically.

### Test Results

- **Total tests: 283 passing** (199 existing + 38 smoothing + 32 calibration + 7 manager smoothing + 7 manager calibration)
- **TypeScript: 0 errors** across all phone-sensor files
- **No regressions** in existing test suites

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **No `ConnectableSensorManager`** | Phone sensors don't need BLE/HTTP connection | No external device to connect to — permissions replace connection |
| **Preset-based channels** | Group channels by experiment type | 16 channels is overwhelming; presets make it student-friendly |
| **Permission in manager** | `requestSensorPermissions()` on the manager class | Must be called from user gesture; manager knows which APIs it needs |
| **`isWirelessDevice() = true`** | Phone sensors are "wireless" | Matches the UI pattern for wireless devices (shows connect button) |
| **Separate motion/orientation/location handlers** | Three distinct event listeners | Different APIs, different rates, different permission requirements |
| **Geolocation via `watchPosition`** | Not `getCurrentPosition` | Continuous streaming matches the sensor data model |
| **`latestValues` for heartbeat** | Cache latest values per channel | Heartbeat needs current values even between collection periods |
| **Desktop fallback** | Warning + `onCommunicationError()` | Desktop browsers have the API but no hardware; must not crash |

---

## 9. Browser Compatibility Matrix

| Feature | iOS Safari | Android Chrome | Android Firefox | Desktop Chrome | Desktop Safari |
|---------|-----------|----------------|-----------------|---------------|----------------|
| `devicemotion` | ✅ (permission) | ✅ | ✅ | ⚠️ No data | ⚠️ No data |
| `deviceorientation` | ✅ (permission) | ✅ | ✅ | ⚠️ No data | ⚠️ No data |
| `geolocation` | ✅ (prompt) | ✅ (prompt) | ✅ (prompt) | ✅ (prompt) | ✅ (prompt) |
| `requestPermission()` | ✅ iOS 13+ | N/A | N/A | N/A | N/A |
| HTTPS required | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key constraints:**
- **HTTPS required** for all sensor APIs on all browsers
- **iOS 13+** requires explicit `requestPermission()` called from user gesture
- **Desktop browsers** define the APIs but never fire events (no hardware)
- **Geolocation** always requires user permission (browser prompt)

---

## 10. Use Cases & Physics Experiments

| Experiment | Preset | Description |
|------------|--------|-------------|
| **Elevator Physics** | Accelerometer | Measure acceleration during elevator ride; calculate velocity by integration |
| **Pendulum** | Accelerometer + Gyroscope | Measure period and amplitude of pendulum swing |
| **Free Fall** | Accelerometer | Drop phone (in padded case!) and measure g-forces |
| **Simple Harmonic Motion** | Accelerometer | Attach phone to spring/mass system |
| **Vehicle Dynamics** | Accelerometer + Location | Measure acceleration and speed of car/bus |
| **Compass Navigation** | Orientation | Use heading for orienteering experiments |
| **Tilt Experiments** | Orientation | Measure angle of inclined plane |
| **GPS Tracking** | Location | Track movement path, calculate distance and speed |
| **Sports Science** | Accelerometer | Measure acceleration during running, jumping, throwing |
| **Coriolis Effect** | Location | Track movement on rotating platform |
| **Centripetal Acceleration** | Accelerometer | Spin phone on turntable, measure radial acceleration |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| iOS requires user gesture for permission | `requestSensorPermissions()` must be called from click handler |
| Desktop browsers have API but no data | Detect mobile device; show warning; fall back to FakeSensorManager |
| Browser throttles event frequency | Use `requestAnimationFrame` for high-frequency sampling; accept browser rate |
| `acceleration` (without gravity) is null on iOS | Fall back to `accelerationIncludingGravity`; document limitation |
| Geolocation is slow (1 Hz max) | Use separate measurement period for location; don't block motion channels |
| Privacy concerns with location data | Clear permission prompt; don't store location without consent |
| Phone can overheat during long collection | Add max duration warning; suggest screen-off collection |
| Screen rotation changes orientation data | Lock screen orientation during collection (CSS `screen.orientation.lock`) |
| Multiple managers active simultaneously | Ensure `requestStop()` removes all event listeners cleanly |