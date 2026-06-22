// src/models/phone-sensor-manager.ts
//
// PhoneSensorManager — Uses browser Device Motion/Orientation and Geolocation APIs
// to turn any phone or tablet into a sensor data source for sensor-interactive.
//
// Unlike other managers, PhoneSensorManager requires NO external device connection.
// The phone/tablet itself is the sensor. It does NOT implement ConnectableSensorManager.
// Instead, it requires permission requests (iOS 13+) and preset selection.

import { SensorConfiguration } from "./sensor-configuration";
import { SensorManager, NewSensorData, VariableMeasurementPeriods } from "./sensor-manager";
import { SensorConfig } from "@concord-consortium/sensor-connector-interface";
import {
  ALL_CHANNELS,
  PHONE_SENSOR_PRESETS,
  PhoneSensorChannel,
  PhoneSensorPreset,
  PhoneSensorType,
  getRequiredSources,
} from "./phone-sensor-profiles";
import {
  detectAvailableSensors,
  requestAllPermissions,
  isMobileDevice,
  PhoneSensorPermissions,
} from "./phone-sensor-permission";
import {
  SmoothingEngine,
  SmoothingConfig,
  SmoothingMode,
  DEFAULT_SMOOTHING_CONFIG,
} from "./phone-sensor-smoothing";
import {
  PhoneSensorCalibration,
  CalibrationProfile,
} from "./phone-sensor-calibration";

export interface PhoneSensorManagerOptions {
  /** Which preset to use. Default: "accelerometer" */
  preset?: string;
  /** Custom list of channel IDs to include */
  channels?: string[];
  /** Whether to include location sensors. Default: false */
  includeLocation?: boolean;
  /** Smoothing configuration. Default: no smoothing */
  smoothing?: SmoothingConfig;
}

export class PhoneSensorManager extends SensorManager {
  supportsDualCollection = true;
  supportsHeartbeat = true;

  private activeChannels: PhoneSensorChannel[];
  private activePreset: PhoneSensorPreset;
  private internalConfig: SensorConfig;
  private hasDataFlag = false;
  private collecting = false;
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

  // Data smoothing engine
  private smoothingEngine: SmoothingEngine;

  // Calibration engine
  private calibrationEngine: PhoneSensorCalibration;

  constructor(options?: PhoneSensorManagerOptions) {
    super();

    // Determine which channels to use
    if (options?.channels) {
      // Custom channel list
      this.activeChannels = ALL_CHANNELS.filter(c => options.channels!.includes(c.id));
      // Find the best matching preset for default period
      this.activePreset = PHONE_SENSOR_PRESETS.accelerometer;
    } else if (options?.preset && PHONE_SENSOR_PRESETS[options.preset]) {
      // Named preset
      this.activePreset = PHONE_SENSOR_PRESETS[options.preset];
      this.activeChannels = [...this.activePreset.channels];
    } else {
      // Default: accelerometer preset
      this.activePreset = PHONE_SENSOR_PRESETS.accelerometer;
      this.activeChannels = [...this.activePreset.channels];
    }

    // Add location channels if requested
    if (options?.includeLocation) {
      const locationChannels = ALL_CHANNELS.filter(c => c.source === "location");
      for (const ch of locationChannels) {
        if (!this.activeChannels.find(c => c.id === ch.id)) {
          this.activeChannels.push(ch);
        }
      }
    }

    // Build initial config
    this.internalConfig = this.buildConfig();

    // Initialize smoothing engine
    this.smoothingEngine = new SmoothingEngine(options?.smoothing ?? DEFAULT_SMOOTHING_CONFIG);

    // Initialize calibration engine
    this.calibrationEngine = new PhoneSensorCalibration();
  }

  // ─── Static methods ───

  /**
   * Check which sensor APIs are available in the current browser.
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
   * MUST be called from a user gesture (click, touch) on iOS.
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
    this.collecting = true;
    this.startCollectionTime = Date.now();

    // Determine which sensor sources we need
    const sources = getRequiredSources(this.activeChannels);

    // Start motion listener
    if (sources.has("motion") && this.permissions.motion === "granted") {
      this.startMotionListener();
    }

    // Start orientation listener
    if (sources.has("orientation") && this.permissions.orientation === "granted") {
      this.startOrientationListener();
    }

    // Start geolocation watcher
    if (sources.has("location") && this.permissions.location === "granted") {
      this.startGeolocationWatcher();
    }

    // Desktop fallback: detect if we're not getting data
    if (!isMobileDevice()) {
      setTimeout(() => {
        if (!this.hasDataFlag && this.collecting) {
          console.warn("PhoneSensorManager: No motion data received. " +
            "This browser/device may not support motion sensors.");
        }
      }, 3000);
    }
  }

  requestStop() {
    this.collecting = false;

    // Remove all listeners
    this.stopMotionListener();
    this.stopOrientationListener();
    this.stopGeolocationWatcher();

    // Reset smoothing state for next collection
    this.smoothingEngine.reset();

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
    const hasLocation = this.activeChannels.some(c => c.source === "location");
    const defaultPeriod = hasLocation ? 1000 : this.activePreset.defaultPeriodMs;

    return {
      supported: true,
      periods: [10, 20, 50, 100, 200, 500, 1000],
      defaultPeriod,
    };
  }

  // ─── Permission handling ───

  /**
   * Request permissions for the sensors needed by this manager.
   * MUST be called from a user gesture (click, touch) on iOS.
   * Returns true if all required permissions were granted.
   */
  async requestSensorPermissions(): Promise<boolean> {
    const sources = getRequiredSources(this.activeChannels);
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

  /**
   * Get the current sensor config.
   */
  getSensorConfig(): SensorConfiguration {
    return new SensorConfiguration(this.internalConfig);
  }

  // ─── Motion event handling ───

  private startMotionListener() {
    this.motionHandler = (event: DeviceMotionEvent) => {
      if (!this.collecting) return;

      const time = (Date.now() - this.startCollectionTime) / 1000;
      const data: NewSensorData = {};

      // accelerationIncludingGravity
      const accelGravity = event.accelerationIncludingGravity;
      if (accelGravity) {
        this.addChannelValue(data, "100", time, accelGravity.x);
        this.addChannelValue(data, "101", time, accelGravity.y);
        this.addChannelValue(data, "102", time, accelGravity.z);
      }

      // acceleration (without gravity)
      const accel = event.acceleration;
      if (accel) {
        this.addChannelValue(data, "103", time, accel.x);
        this.addChannelValue(data, "104", time, accel.y);
        this.addChannelValue(data, "105", time, accel.z);
      }

      // rotationRate
      const rotation = event.rotationRate;
      if (rotation) {
        this.addChannelValue(data, "106", time, rotation.alpha);
        this.addChannelValue(data, "107", time, rotation.beta);
        this.addChannelValue(data, "108", time, rotation.gamma);
      }

      // Also update geolocation channels if we have location data
      if (this.latestPosition) {
        this.addChannelValue(data, "112", time, this.latestPosition.coords.latitude);
        this.addChannelValue(data, "113", time, this.latestPosition.coords.longitude);
        this.addChannelValue(data, "114", time, this.latestPosition.coords.altitude);
        this.addChannelValue(data, "115", time, this.latestPosition.coords.speed);
      }

      if (Object.keys(data).length > 0) {
        this.hasDataFlag = true;
        const smoothed = this.smoothingEngine.smoothData(data);
        const calibrated = this.calibrationEngine.calibrateData(smoothed);
        this.onSensorData(calibrated);
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

      this.addChannelValue(data, "109", time, event.alpha);
      this.addChannelValue(data, "110", time, event.beta);
      this.addChannelValue(data, "111", time, event.gamma);

      if (Object.keys(data).length > 0) {
        this.hasDataFlag = true;
        const smoothed = this.smoothingEngine.smoothData(data);
        const calibrated = this.calibrationEngine.calibrateData(smoothed);
        this.onSensorData(calibrated);
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

        this.addChannelValue(data, "112", time, position.coords.latitude);
        this.addChannelValue(data, "113", time, position.coords.longitude);
        this.addChannelValue(data, "114", time, position.coords.altitude);
        this.addChannelValue(data, "115", time, position.coords.speed);

        if (Object.keys(data).length > 0) {
          this.hasDataFlag = true;
          const smoothed = this.smoothingEngine.smoothData(data);
          const calibrated = this.calibrationEngine.calibrateData(smoothed);
          this.onSensorData(calibrated);
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
    const colIDs: number[] = [];

    this.activeChannels.forEach((channel) => {
      const id = channel.id;
      const numericId = parseInt(id, 10);
      columns[id] = {
        id,
        setID: "100",
        position: channel.position,
        name: channel.name,
        units: channel.units,
        liveValue: "NaN",
        liveValueTimeStamp: new Date(),
        valueCount: 0,
        valuesTimeStamp: new Date(),
      };
      if (!isNaN(numericId)) {
        colIDs.push(numericId);
      }
    });

    return {
      collection: { canControl: true, isCollecting: false },
      columnListTimeStamp: new Date(),
      columns,
      currentInterface: "Phone Sensors",
      currentState: "unknown",
      os: { name: navigator.platform || "Unknown", version: navigator.appVersion || "Unknown" },
      requestTimeStamp: new Date(),
      server: { arch: "Phone", version: "1.0.0" },
      sessionDesc: this.activePreset.name,
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

  // ─── Smoothing configuration ───

  /**
   * Get the current smoothing configuration.
   */
  getSmoothingConfig(): SmoothingConfig {
    return this.smoothingEngine.getConfig();
  }

  /**
   * Update the smoothing configuration. Resets filter state.
   */
  setSmoothingConfig(config: Partial<SmoothingConfig>) {
    this.smoothingEngine.setConfig(config);
  }

  /**
   * Get the smoothing mode.
   */
  getSmoothingMode(): SmoothingMode {
    return this.smoothingEngine.getMode();
  }

  // ─── Calibration ───

  /**
   * Get the calibration engine for direct access.
   */
  getCalibration(): PhoneSensorCalibration {
    return this.calibrationEngine;
  }

  /**
   * Tare (zero) all active channels using current sensor values.
   * Captures the current values and sets them as offsets.
   * Must be called during collection (when latestValues has data).
   */
  tare(): void {
    this.calibrationEngine.tare(this.latestValues);
  }

  /**
   * Reset all calibration to default (no offset, unit scale).
   */
  resetCalibration(): void {
    this.calibrationEngine.reset();
  }

  /**
   * Get a snapshot of the current calibration settings.
   */
  getCalibrationSnapshot(): CalibrationProfile {
    return this.calibrationEngine.getSnapshot();
  }

  /**
   * Restore calibration from a snapshot.
   */
  restoreCalibration(snapshot: CalibrationProfile): void {
    this.calibrationEngine.restoreSnapshot(snapshot);
  }
}