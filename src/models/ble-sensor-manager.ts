import { SensorConfiguration } from "./sensor-configuration";
import { SensorManager, NewSensorData, ConnectableSensorManager } from "./sensor-manager";
import { SensorConfig } from "@concord-consortium/sensor-connector-interface";
import { BLEConnection } from "./ble-connection";
import { WebSocketConnection, WebSocketDeviceInfo } from "./websocket-connection";
import {
  ESP32_DEVICE_PROFILES,
  DeviceProfile,
  BLEDataPacket,
  BLE_SENSOR_SERVICE_UUID,
  buildSensorConfigFromProfile,
  resolveDeviceProfile
} from "./esp32-device-profiles";

export type BLEConnectionMode = "ble" | "websocket";

/**
 * BLESensorManager extends SensorManager to provide BLE-based and WebSocket-based
 * sensor data collection from ESP32 devices. It implements ConnectableSensorManager
 * for wireless device connection/disconnection.
 *
 * Supports two connection modes:
 * - BLE: Direct Bluetooth Low Energy connection via Web Bluetooth API
 * - WebSocket: WiFi-based connection via WebSocket (for higher data rates)
 */
export class BLESensorManager extends SensorManager implements ConnectableSensorManager {
  supportsDualCollection = true;
  supportsHeartbeat = true;

  private connectionMode: BLEConnectionMode = "ble";
  private bleConnection: BLEConnection | null = null;
  private wsConnection: WebSocketConnection | null = null;
  private wsUrl: string;
  private internalConfig: SensorConfig;
  private hasDataFlag = false;
  private deviceProfile: DeviceProfile | null = null;

  constructor(options?: { mode?: BLEConnectionMode; wsUrl?: string }) {
    super();
    this.connectionMode = options?.mode ?? "ble";
    this.wsUrl = options?.wsUrl ?? "ws://192.168.4.1:81";
    // Default config — will be overwritten after device connection
    this.internalConfig = this.createEmptyConfig();
  }

  // ─── Static methods for device discovery ───

  static getOptionalServices(): string[] {
    return [BLE_SENSOR_SERVICE_UUID];
  }

  static getWirelessFilters(): any[] {
    return [{ services: [BLE_SENSOR_SERVICE_UUID] }];
  }

  // ─── SensorManager abstract methods ───

  isWirelessDevice() { return true; }

  startPolling() {
    // Send initial config to UI (may have no channels yet)
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
    if (this.connectionMode === "ble" && this.bleConnection) {
      this.bleConnection.sendCommand({
        type: "command",
        action: "start",
        period_ms: measurementPeriod
      });
    } else if (this.connectionMode === "websocket" && this.wsConnection) {
      this.wsConnection.sendCommand({
        type: "command",
        action: "start",
        period_ms: measurementPeriod
      });
    }
  }

  requestStop() {
    if (this.connectionMode === "ble" && this.bleConnection) {
      this.bleConnection.sendCommand({
        type: "command",
        action: "stop"
      });
    } else if (this.connectionMode === "websocket" && this.wsConnection) {
      this.wsConnection.sendCommand({
        type: "command",
        action: "stop"
      });
    }

    this.onSensorCollectionStopped();
  }

  requestHeartbeat(enabled: boolean): void {
    this.manageHeartbeat(enabled, () => {
      this.sendSensorConfig(false);
    });
  }

  variableMeasurementPeriods() {
    if (this.deviceProfile) {
      return {
        supported: true,
        periods: [10, 20, 50, 100, 200, 500, 1000, 2000],
        defaultPeriod: this.deviceProfile.defaultPeriodMs
      };
    }
    return {
      supported: false,
      periods: [],
      defaultPeriod: 100
    };
  }

  // ─── ConnectableSensorManager interface ───

  get deviceConnected(): boolean {
    if (this.connectionMode === "ble") {
      return this.bleConnection?.isConnected ?? false;
    }
    return this.wsConnection?.isConnected ?? false;
  }

  async connectToDevice(device?: BluetoothDevice): Promise<boolean> {
    this.bleConnection = new BLEConnection();

    // Set up data handler before connecting
    this.bleConnection.onData((packet) => {
      this.handleDataPacket(packet);
    });

    this.bleConnection.onDisconnect(() => {
      this.clearConfigLiveValues();
      this.onSensorDisconnect();
    });

    const connected = await this.bleConnection.connect(device);
    if (!connected) {
      return false;
    }

    // Read device info to discover available sensors
    try {
      const deviceInfo = await this.bleConnection.readDeviceInfo();
      this.deviceProfile = resolveDeviceProfile(deviceInfo);
      this.updateConfigFromProfile();
      this.sendSensorConfig(true);
    } catch (error) {
      console.warn("[BLESensorManager] Could not read device info, using generic profile:", error);
      this.deviceProfile = ESP32_DEVICE_PROFILES["ESP32-GENERIC"];
      this.updateConfigFromProfile();
      this.sendSensorConfig(true);
    }

    return true;
  }

  disconnectFromDevice(): void {
    if (this.connectionMode === "ble" && this.bleConnection) {
      this.bleConnection.disconnect();
      this.bleConnection = null;
    } else if (this.connectionMode === "websocket" && this.wsConnection) {
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }
    this.clearConfigLiveValues();
  }

  /**
   * Connect via WebSocket (alternative to BLE).
   * Useful for high-frequency sensors or when Web Bluetooth is not available.
   */
  async connectViaWebSocket(url?: string): Promise<boolean> {
    this.connectionMode = "websocket";
    if (url) this.wsUrl = url;
    this.wsConnection = new WebSocketConnection(this.wsUrl);

    this.wsConnection.onData((packet) => {
      this.handleDataPacket(packet);
    });

    this.wsConnection.onDisconnect(() => {
      this.clearConfigLiveValues();
      this.onSensorDisconnect();
    });

    this.wsConnection.onConnect((info: WebSocketDeviceInfo) => {
      this.deviceProfile = resolveDeviceProfile(info as any);
      this.updateConfigFromProfile();
      this.sendSensorConfig(true);
    });

    const connected = await this.wsConnection.connect();
    if (!connected) {
      return false;
    }

    return true;
  }

  // ─── Private methods ───

  private handleDataPacket(packet: BLEDataPacket): void {
    this.hasDataFlag = true;
    const data: NewSensorData = {};

    for (const [channelId, value] of Object.entries(packet.channels)) {
      data[channelId] = [[packet.time, value]];

      // Update live value in config
      if (this.internalConfig.columns[channelId]) {
        this.internalConfig.columns[channelId].liveValue = value.toString();
        this.internalConfig.columns[channelId].liveValueTimeStamp = new Date();
      }
    }

    this.onSensorData(data);
    this.onSensorStatus(new SensorConfiguration(this.internalConfig));
  }

  private updateConfigFromProfile(): void {
    if (!this.deviceProfile) return;

    this.internalConfig = buildSensorConfigFromProfile(this.deviceProfile);
    this.supportsDualCollection = this.deviceProfile.supportsDualCollection;
  }

  private sendSensorConfig(includeOnConnect: boolean) {
    const sensorConfig = new SensorConfiguration(this.internalConfig);
    if (includeOnConnect) {
      this.onSensorConnect(sensorConfig);
    }
    this.onSensorStatus(sensorConfig);
  }

  private clearConfigLiveValues() {
    Object.keys(this.internalConfig.columns).forEach((id) => {
      this.internalConfig.columns[id].liveValue = "NaN";
    });
    this.sendSensorConfig(true);
  }

  private createEmptyConfig(): SensorConfig {
    return {
      collection: { canControl: true, isCollecting: false },
      columnListTimeStamp: new Date(),
      columns: {},
      currentInterface: "ESP32 Sensor",
      currentState: "unknown",
      os: { name: "ESP32", version: "1.0.0" },
      requestTimeStamp: new Date(),
      server: { arch: "ESP32", version: "1.0.0" },
      sessionDesc: "ESP32 Sensor",
      sessionID: "esp32-session",
      sets: { "100": { name: "Run 1", colIDs: [] } }
    };
  }
}