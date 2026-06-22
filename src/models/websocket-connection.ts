/**
 * WebSocketConnection handles WebSocket-based communication with an ESP32 device.
 * This is an alternative to BLE for scenarios where:
 * - Higher data rates are needed (MPU6050 at 100Hz)
 * - Web Bluetooth API is not available (Firefox, etc.)
 * - The ESP32 is on the same WiFi network
 *
 * The ESP32 runs a WebSocket server (typically on port 81) and sends
 * JSON data packets in the same format as BLE notifications.
 *
 * Usage:
 *   const conn = new WebSocketConnection("ws://192.168.4.1:81");
 *   conn.onConnect(info => { ... });
 *   conn.onData(packet => { ... });
 *   conn.onDisconnect(() => { ... });
 *   const connected = await conn.connect();
 */

export interface WebSocketDataPacket {
  type: "data";
  time: number;
  channels: Record<string, number>;
}

export interface WebSocketDeviceInfo {
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

export class WebSocketConnection {
  private socket: WebSocket | null = null;
  private onDataCallback: ((packet: WebSocketDataPacket) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onConnectCallback: ((info: WebSocketDeviceInfo) => void) | null = null;
  private url: string;

  constructor(url: string = "ws://192.168.4.1:81") {
    this.url = url;
  }

  /**
   * Connect to the ESP32 WebSocket server.
   * On successful connection, sends a "get_info" command to request device info.
   * Resolves to true once device_info is received, false on failure/timeout.
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.socket = new WebSocket(this.url);

        let resolved = false;

        this.socket.onopen = () => {
          // Request device info on connection
          this.sendCommand({ type: "command", action: "get_info" });
        };

        this.socket.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data as string);

            if (packet.type === "device_info") {
              if (this.onConnectCallback) {
                this.onConnectCallback(packet as WebSocketDeviceInfo);
              }
              if (!resolved) {
                resolved = true;
                resolve(true);
              }
            } else if (packet.type === "data") {
              if (this.onDataCallback) {
                this.onDataCallback(packet as WebSocketDataPacket);
              }
            }
          } catch (e) {
            console.warn("[WebSocketConnection] Failed to parse packet:", event.data, e);
          }
        };

        this.socket.onclose = () => {
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        };

        this.socket.onerror = () => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }, 5000);
      } catch (error) {
        console.error("[WebSocketConnection] Connection failed:", error);
        resolve(false);
      }
    });
  }

  /**
   * Send a command to the ESP32 via WebSocket.
   * Commands include: start, stop, set_period, get_info.
   */
  sendCommand(command: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(command));
    }
  }

  /**
   * Register a callback for data packets received from the ESP32.
   */
  onData(callback: (packet: WebSocketDataPacket) => void): void {
    this.onDataCallback = callback;
  }

  /**
   * Register a callback for when the WebSocket connection is lost.
   */
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Register a callback for when device info is received on connection.
   * The callback receives the parsed WebSocketDeviceInfo.
   */
  onConnect(callback: (info: WebSocketDeviceInfo) => void): void {
    this.onConnectCallback = callback;
  }

  /**
   * Whether the WebSocket is currently connected.
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from the WebSocket server and clean up.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
  }
}