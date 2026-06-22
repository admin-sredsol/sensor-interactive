import { BLESensorManager } from "../ble-sensor-manager";
import {
  ESP32_DEVICE_PROFILES,
  BLE_SENSOR_SERVICE_UUID,
  BLEDataPacket,
  BLEDeviceInfo
} from "../esp32-device-profiles";
import { BLEConnection } from "../ble-connection";
import { WebSocketConnection, WebSocketDeviceInfo } from "../websocket-connection";

// Polyfill TextEncoder/TextDecoder for jsdom test environment
import { TextEncoder, TextDecoder } from "util";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// ─── Tests ───

describe("BLESensorManager", () => {
  let manager: BLESensorManager;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers();
    manager = new BLESensorManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("construction", () => {
    it("should create a manager with default empty config", () => {
      expect(manager.isWirelessDevice()).toBe(true);
      expect(manager.hasSensorData()).toBe(false);
      expect(manager.deviceConnected).toBe(false);
    });

    it("should support dual collection by default", () => {
      expect(manager.supportsDualCollection).toBe(true);
    });

    it("should support heartbeat", () => {
      expect(manager.supportsHeartbeat).toBe(true);
    });

    it("should return variableMeasurementPeriods as unsupported without a device profile", () => {
      const periods = manager.variableMeasurementPeriods();
      expect(periods.supported).toBe(false);
      expect(periods.periods).toEqual([]);
      expect(periods.defaultPeriod).toBe(100);
    });
  });

  describe("static methods", () => {
    it("should return correct optional services UUID", () => {
      const services = BLESensorManager.getOptionalServices();
      expect(services).toEqual([BLE_SENSOR_SERVICE_UUID]);
    });

    it("should return correct wireless filters", () => {
      const filters = BLESensorManager.getWirelessFilters();
      expect(filters).toEqual([{ services: [BLE_SENSOR_SERVICE_UUID] }]);
    });
  });

  describe("connectToDevice", () => {
    it("should connect and read device info, updating config", async () => {
      jest.spyOn(BLEConnection.prototype, "connect").mockImplementation(async function(this: BLEConnection) {
        // Simulate successful connection
        return true;
      });
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockResolvedValue({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      } as BLEDeviceInfo);
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function(this: BLEConnection) {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function(this: BLEConnection) {});
      // Mock isConnected getter to return true after connect
      jest.spyOn(BLEConnection.prototype, "isConnected", "get").mockReturnValue(true);

      const result = await manager.connectToDevice({} as BluetoothDevice);

      expect(result).toBe(true);
      expect(manager.deviceConnected).toBe(true);
    });

    it("should fall back to generic profile if device info read fails", async () => {
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockRejectedValue(new Error("Read failed"));
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function() {});

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await manager.connectToDevice({} as BluetoothDevice);

      expect(result).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not read device info"),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it("should return false if BLE connection fails", async () => {
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(false);
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function() {});

      const result = await manager.connectToDevice({} as BluetoothDevice);

      expect(result).toBe(false);
      expect(manager.deviceConnected).toBe(false);
    });
  });

  describe("disconnectFromDevice", () => {
    it("should disconnect and clear live values", async () => {
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockResolvedValue({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      } as BLEDeviceInfo);
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function() {});
      const disconnectSpy = jest.spyOn(BLEConnection.prototype, "disconnect").mockImplementation(async function() {});

      await manager.connectToDevice({} as BluetoothDevice);
      manager.disconnectFromDevice();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe("data handling", () => {
    it("should process data packets and update live values", () => {
      // Manually set up a profile so we can test data handling
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      // Simulate receiving data
      const packet: BLEDataPacket = {
        type: "data",
        time: 1.5,
        channels: {
          "100": 25.4,
          "101": 60.2
        }
      };

      const dataListener = jest.fn();
      const statusListener = jest.fn();
      manager.addListener("onSensorData", dataListener);
      manager.addListener("onSensorStatus", statusListener);

      (manager as any).handleDataPacket(packet);

      expect(dataListener).toHaveBeenCalledWith({
        "100": [[1.5, 25.4]],
        "101": [[1.5, 60.2]]
      });

      // Check live values were updated
      const config = (manager as any).internalConfig;
      expect(config.columns["100"].liveValue).toBe("25.4");
      expect(config.columns["101"].liveValue).toBe("60.2");
    });

    it("should set hasDataFlag to true when data is received", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      expect(manager.hasSensorData()).toBe(false);

      const packet: BLEDataPacket = {
        type: "data",
        time: 1.0,
        channels: { "100": 25.0 }
      };
      (manager as any).handleDataPacket(packet);

      expect(manager.hasSensorData()).toBe(true);
    });

    it("should ignore data for unknown channel IDs", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      const packet: BLEDataPacket = {
        type: "data",
        time: 1.0,
        channels: { "999": 42.0 }
      };

      const dataListener = jest.fn();
      manager.addListener("onSensorData", dataListener);

      (manager as any).handleDataPacket(packet);

      // Data should still be emitted even for unknown channels
      expect(dataListener).toHaveBeenCalledWith({
        "999": [[1.0, 42.0]]
      });

      // But live value for unknown channel should not be updated
      const config = (manager as any).internalConfig;
      expect(config.columns["999"]).toBeUndefined();
    });
  });

  describe("requestStart / requestStop", () => {
    it("should send start command via BLE connection", async () => {
      const sendCommandSpy = jest.spyOn(BLEConnection.prototype, "sendCommand").mockResolvedValue(undefined);
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockResolvedValue({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      } as BLEDeviceInfo);
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function() {});

      await manager.connectToDevice({} as BluetoothDevice);
      manager.requestStart(100);

      expect(sendCommandSpy).toHaveBeenCalledWith({
        type: "command",
        action: "start",
        period_ms: 100
      });
    });

    it("should send stop command via BLE connection", async () => {
      const sendCommandSpy = jest.spyOn(BLEConnection.prototype, "sendCommand").mockResolvedValue(undefined);
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockResolvedValue({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      } as BLEDeviceInfo);
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation(function() {});

      await manager.connectToDevice({} as BluetoothDevice);

      const stopListener = jest.fn();
      manager.addListener("onSensorCollectionStopped", stopListener);

      manager.requestStop();

      expect(sendCommandSpy).toHaveBeenCalledWith({
        type: "command",
        action: "stop"
      });
      expect(stopListener).toHaveBeenCalled();
    });

    it("should not send commands when not connected", () => {
      // Manager not connected — requestStart/requestStop should not throw
      expect(() => manager.requestStart(100)).not.toThrow();
      expect(() => manager.requestStop()).not.toThrow();
    });
  });

  describe("variableMeasurementPeriods", () => {
    it("should return supported periods when device profile is set", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;

      const periods = manager.variableMeasurementPeriods();
      expect(periods.supported).toBe(true);
      expect(periods.periods).toEqual([10, 20, 50, 100, 200, 500, 1000, 2000]);
      expect(periods.defaultPeriod).toBe(2000);
    });

    it("should return MPU6050 default period", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-MPU6050"];
      (manager as any).deviceProfile = profile;

      const periods = manager.variableMeasurementPeriods();
      expect(periods.defaultPeriod).toBe(10);
    });

    it("should return unsupported when no device profile", () => {
      const periods = manager.variableMeasurementPeriods();
      expect(periods.supported).toBe(false);
      expect(periods.periods).toEqual([]);
      expect(periods.defaultPeriod).toBe(100);
    });
  });

  describe("startPolling", () => {
    it("should send sensor config on start", () => {
      const connectListener = jest.fn();
      const statusListener = jest.fn();
      manager.addListener("onSensorConnect", connectListener);
      manager.addListener("onSensorStatus", statusListener);

      manager.startPolling();

      expect(connectListener).toHaveBeenCalled();
      expect(statusListener).toHaveBeenCalled();
    });

    it("should start heartbeat interval", () => {
      const statusListener = jest.fn();
      manager.addListener("onSensorStatus", statusListener);

      manager.startPolling();

      // Clear the initial calls
      statusListener.mockClear();

      // Advance timer to trigger heartbeat
      jest.advanceTimersByTime(1000);

      // Heartbeat should have sent another status update
      expect(statusListener).toHaveBeenCalled();
    });
  });

  describe("requestHeartbeat", () => {
    it("should enable heartbeat and send periodic status updates", () => {
      const statusListener = jest.fn();
      manager.addListener("onSensorStatus", statusListener);

      manager.requestHeartbeat(true);

      // Clear initial calls from startPolling if any
      statusListener.mockClear();

      // Advance timer to trigger heartbeat
      jest.advanceTimersByTime(1000);

      expect(statusListener).toHaveBeenCalled();
    });

    it("should disable heartbeat", () => {
      const statusListener = jest.fn();
      manager.addListener("onSensorStatus", statusListener);

      manager.requestHeartbeat(true);
      statusListener.mockClear();

      // Advance timer — should trigger
      jest.advanceTimersByTime(1000);
      expect(statusListener).toHaveBeenCalled();

      // Now disable heartbeat
      statusListener.mockClear();
      manager.requestHeartbeat(false);

      jest.advanceTimersByTime(2000);
      // Should NOT have been called again after disabling
      expect(statusListener).not.toHaveBeenCalled();
    });
  });

  describe("config management", () => {
    it("should build config from DHT22 profile", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      const config = (manager as any).internalConfig;
      expect(config.columns["100"].name).toBe("Temperature");
      expect(config.columns["100"].units).toBe("°C");
      expect(config.columns["101"].name).toBe("Humidity");
      expect(config.columns["101"].units).toBe("%");
      expect(config.sets["100"].colIDs).toEqual([100, 101]);
      expect(config.currentInterface).toBe("ESP32 DHT22 Sensor");
    });

    it("should build config from MPU6050 profile", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-MPU6050"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      const config = (manager as any).internalConfig;
      expect(Object.keys(config.columns)).toHaveLength(6);
      expect(config.columns["100"].name).toBe("Acceleration X");
      expect(config.columns["105"].name).toBe("Gyro Z");
      expect(config.sets["100"].colIDs).toEqual([100, 101, 102, 103, 104, 105]);
    });

    it("should clear live values on disconnect", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      // Set some live values
      (manager as any).internalConfig.columns["100"].liveValue = "25.4";
      (manager as any).internalConfig.columns["101"].liveValue = "60.2";

      (manager as any).clearConfigLiveValues();

      expect((manager as any).internalConfig.columns["100"].liveValue).toBe("NaN");
      expect((manager as any).internalConfig.columns["101"].liveValue).toBe("NaN");
    });

    it("should set supportsDualCollection from profile", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-HCSR04"];
      (manager as any).deviceProfile = profile;
      (manager as any).updateConfigFromProfile();

      expect(manager.supportsDualCollection).toBe(false);
    });
  });

  describe("disconnect callback", () => {
    it("should clear live values and notify on BLE disconnect", async () => {
      jest.spyOn(BLEConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(BLEConnection.prototype, "readDeviceInfo").mockResolvedValue({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      } as BLEDeviceInfo);

      const disconnectCallbacks: Array<() => void> = [];
      jest.spyOn(BLEConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(BLEConnection.prototype, "onDisconnect").mockImplementation((cb: () => void) => {
        disconnectCallbacks.push(cb);
      });

      const disconnectListener = jest.fn();
      manager.addListener("onSensorDisconnect", disconnectListener);

      await manager.connectToDevice({} as BluetoothDevice);

      // Set some live values
      (manager as any).internalConfig.columns["100"].liveValue = "25.4";

      // Simulate BLE disconnect
      disconnectCallbacks.forEach(cb => cb());

      expect(disconnectListener).toHaveBeenCalled();
      expect((manager as any).internalConfig.columns["100"].liveValue).toBe("NaN");
    });
  });

  // ─── WebSocket Mode Tests ───

  describe("WebSocket mode", () => {
    it("should construct with websocket mode", () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });
      expect(wsManager.isWirelessDevice()).toBe(true);
      expect(wsManager.deviceConnected).toBe(false);
    });

    it("should construct with custom WebSocket URL", () => {
      const wsManager = new BLESensorManager({ mode: "websocket", wsUrl: "ws://192.168.1.100:8080" });
      expect((wsManager as any).wsUrl).toBe("ws://192.168.1.100:8080");
    });

    it("should connect via WebSocket and resolve device info", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      // Mock WebSocketConnection methods
      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function(cb: (info: WebSocketDeviceInfo) => void) {
        // Simulate device_info callback
        cb({
          type: "device_info",
          name: "ESP32-DHT22",
          firmware: "1.0.0",
          sensors: [
            { id: "100", name: "Temperature", units: "°C" },
            { id: "101", name: "Humidity", units: "%" }
          ]
        });
      });
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      const result = await wsManager.connectViaWebSocket();

      expect(result).toBe(true);
      expect(wsManager.deviceConnected).toBe(true);
    });

    it("should return false if WebSocket connection fails", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(false);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});

      const result = await wsManager.connectViaWebSocket();

      expect(result).toBe(false);
      expect(wsManager.deviceConnected).toBe(false);
    });

    it("should send start command via WebSocket", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      const sendCommandSpy = jest.spyOn(WebSocketConnection.prototype, "sendCommand").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      await wsManager.connectViaWebSocket();
      wsManager.requestStart(100);

      expect(sendCommandSpy).toHaveBeenCalledWith({
        type: "command",
        action: "start",
        period_ms: 100
      });
    });

    it("should send stop command via WebSocket", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      const sendCommandSpy = jest.spyOn(WebSocketConnection.prototype, "sendCommand").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      await wsManager.connectViaWebSocket();

      const stopListener = jest.fn();
      wsManager.addListener("onSensorCollectionStopped", stopListener);

      wsManager.requestStop();

      expect(sendCommandSpy).toHaveBeenCalledWith({
        type: "command",
        action: "stop"
      });
      expect(stopListener).toHaveBeenCalled();
    });

    it("should disconnect from WebSocket", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});
      const disconnectSpy = jest.spyOn(WebSocketConnection.prototype, "disconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      await wsManager.connectViaWebSocket();
      wsManager.disconnectFromDevice();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it("should handle WebSocket data packets", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      // Capture the data callback
      const dataCallbacks: Array<(packet: BLEDataPacket) => void> = [];
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation((cb: (packet: BLEDataPacket) => void) => {
        dataCallbacks.push(cb);
      });

      await wsManager.connectViaWebSocket();

      // Set up a profile so data handling works
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (wsManager as any).deviceProfile = profile;
      (wsManager as any).updateConfigFromProfile();

      const dataListener = jest.fn();
      wsManager.addListener("onSensorData", dataListener);

      // Simulate data packet
      dataCallbacks.forEach(cb => cb({
        type: "data",
        time: 2.5,
        channels: { "100": 22.1, "101": 55.3 }
      }));

      expect(dataListener).toHaveBeenCalledWith({
        "100": [[2.5, 22.1]],
        "101": [[2.5, 55.3]]
      });
    });

    it("should handle WebSocket disconnect", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket" });

      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(true);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "isConnected", "get").mockReturnValue(true);

      // Capture the disconnect callback
      const disconnectCallbacks: Array<() => void> = [];
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation((cb: () => void) => {
        disconnectCallbacks.push(cb);
      });

      const disconnectListener = jest.fn();
      wsManager.addListener("onSensorDisconnect", disconnectListener);

      await wsManager.connectViaWebSocket();

      // Set some live values
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      (wsManager as any).deviceProfile = profile;
      (wsManager as any).updateConfigFromProfile();
      (wsManager as any).internalConfig.columns["100"].liveValue = "22.1";

      // Simulate WebSocket disconnect
      disconnectCallbacks.forEach(cb => cb());

      expect(disconnectListener).toHaveBeenCalled();
      expect((wsManager as any).internalConfig.columns["100"].liveValue).toBe("NaN");
    });

    it("should use custom WebSocket URL in connectViaWebSocket", async () => {
      const wsManager = new BLESensorManager({ mode: "websocket", wsUrl: "ws://custom:9090" });

      // We can verify the URL was stored by checking the constructor set it
      expect((wsManager as any).wsUrl).toBe("ws://custom:9090");

      // And connectViaWebSocket with a new URL should update it
      jest.spyOn(WebSocketConnection.prototype, "connect").mockResolvedValue(false);
      jest.spyOn(WebSocketConnection.prototype, "onData").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onDisconnect").mockImplementation(function() {});
      jest.spyOn(WebSocketConnection.prototype, "onConnect").mockImplementation(function() {});

      await wsManager.connectViaWebSocket("ws://newurl:1234");

      expect((wsManager as any).wsUrl).toBe("ws://newurl:1234");
    });
  });
});