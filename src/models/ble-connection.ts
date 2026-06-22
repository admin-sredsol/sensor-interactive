import {
  BLE_SENSOR_SERVICE_UUID,
  BLE_SENSOR_CONFIG_UUID,
  BLE_SENSOR_DATA_UUID,
  BLE_DEVICE_INFO_UUID,
  BLEDataPacket,
  BLECommandPacket,
  BLEDeviceInfo
} from "./esp32-device-profiles";

/**
 * BLEConnection handles the low-level Web Bluetooth API communication
 * with an ESP32 device. It manages GATT service/characteristic discovery,
 * notification subscriptions, and command/data packet encoding/decoding.
 *
 * Usage:
 *   const conn = new BLEConnection();
 *   conn.onData(packet => { ... });
 *   conn.onDisconnect(() => { ... });
 *   const connected = await conn.connect(device);
 *   const info = await conn.readDeviceInfo();
 *   await conn.sendCommand({ type: "command", action: "start" });
 */
export class BLEConnection {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private configCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private dataCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private infoCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private onDataCallback: ((packet: BLEDataPacket) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  /**
   * Returns the BLE service UUID for device discovery filters.
   * Used by app.tsx to build the requestDevice() filter list.
   */
  static getOptionalServices(): string[] {
    return [BLE_SENSOR_SERVICE_UUID];
  }

  /**
   * Returns the BLE device filter for navigator.bluetooth.requestDevice().
   * Used by app.tsx to build the requestDevice() filter list.
   */
  static getWirelessFilters(): any[] {
    return [{ services: [BLE_SENSOR_SERVICE_UUID] }];
  }

  /**
   * Connect to a BLE device. If no device is provided, prompts the user
   * to select one via the browser's Bluetooth device picker.
   *
   * @param device - Optional pre-selected BluetoothDevice (from requestDevice)
   * @returns true if connection succeeded, false otherwise
   */
  async connect(device?: BluetoothDevice): Promise<boolean> {
    try {
      // Step 1: Request device if not provided
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          filters: BLEConnection.getWirelessFilters(),
          optionalServices: BLEConnection.getOptionalServices()
        });
      }
      this.device = device;

      // Step 2: Connect to GATT server
      this.server = await this.device.gatt!.connect();

      // Step 3: Get the sensor service
      this.service = await this.server.getPrimaryService(BLE_SENSOR_SERVICE_UUID);

      // Step 4: Get characteristics
      this.configCharacteristic = await this.service.getCharacteristic(BLE_SENSOR_CONFIG_UUID);
      this.dataCharacteristic = await this.service.getCharacteristic(BLE_SENSOR_DATA_UUID);
      this.infoCharacteristic = await this.service.getCharacteristic(BLE_DEVICE_INFO_UUID);

      // Step 5: Subscribe to data notifications
      await this.dataCharacteristic.startNotifications();
      this.dataCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleDataNotification
      );

      // Step 6: Listen for disconnection
      this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);

      return true;
    } catch (error) {
      console.error("[BLEConnection] Connection failed:", error);
      this.cleanup();
      return false;
    }
  }

  /**
   * Read device info from the BLE device info characteristic.
   * Returns parsed device info including name, firmware version,
   * and available sensors.
   */
  async readDeviceInfo(): Promise<BLEDeviceInfo> {
    if (!this.infoCharacteristic) {
      throw new Error("[BLEConnection] Device info characteristic not available");
    }
    const value = await this.infoCharacteristic.readValue();
    const decoder = new TextDecoder();
    const json = decoder.decode(value);
    return JSON.parse(json) as BLEDeviceInfo;
  }

  /**
   * Send a command to the ESP32 via the config characteristic.
   * Commands include start, stop, and set_period.
   */
  async sendCommand(command: BLECommandPacket): Promise<void> {
    if (!this.configCharacteristic) {
      throw new Error("[BLEConnection] Config characteristic not available");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(command));
    await this.configCharacteristic.writeValue(data);
  }

  /**
   * Register a callback for data packets received from the ESP32.
   */
  onData(callback: (packet: BLEDataPacket) => void): void {
    this.onDataCallback = callback;
  }

  /**
   * Register a callback for when the BLE device disconnects.
   */
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Whether the BLE device is currently connected.
   */
  get isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  /**
   * Disconnect from the BLE device and clean up all listeners.
   */
  async disconnect(): Promise<void> {
    this.cleanup();
  }

  // ─── Private methods ───

  /**
   * Handle incoming BLE notification data.
   * Parses JSON data packets and forwards them to the registered callback.
   */
  private handleDataNotification = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const decoder = new TextDecoder();
    const json = decoder.decode(characteristic.value);
    try {
      const packet = JSON.parse(json) as BLEDataPacket;
      if (packet.type === "data" && this.onDataCallback) {
        this.onDataCallback(packet);
      }
    } catch (e) {
      console.warn("[BLEConnection] Failed to parse BLE data packet:", json, e);
    }
  };

  /**
   * Handle BLE device disconnection event.
   */
  private handleDisconnect = () => {
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback();
    }
  };

  /**
   * Clean up all BLE resources: remove event listeners, disconnect GATT,
   * and null out references.
   */
  private cleanup(): void {
    if (this.dataCharacteristic) {
      this.dataCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.handleDataNotification
      );
    }
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    }
    if (this.server?.connected) {
      this.device?.gatt?.disconnect();
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.configCharacteristic = null;
    this.dataCharacteristic = null;
    this.infoCharacteristic = null;
  }
}