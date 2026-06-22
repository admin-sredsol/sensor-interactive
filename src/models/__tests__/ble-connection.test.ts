import { BLEConnection } from "../ble-connection";
import {
  BLE_SENSOR_SERVICE_UUID,
  BLE_SENSOR_CONFIG_UUID,
  BLE_SENSOR_DATA_UUID,
  BLE_DEVICE_INFO_UUID
} from "../esp32-device-profiles";

// Polyfill TextEncoder/TextDecoder for jsdom test environment
import { TextEncoder, TextDecoder } from "util";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

const encoder = new TextEncoder();

function createMockDataView(json: string) {
  const bytes = encoder.encode(json);
  return new DataView(bytes.buffer);
}

// ─── Mock BLE Objects ───
// These mocks simulate the Web Bluetooth API objects that BLEConnection uses.
// The key insight is that device.gatt.connect() returns the GATT server,
// and then we call server.getPrimaryService() etc.

function createMockCharacteristic(uuid: string) {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  let notifying = false;
  let storedValue: DataView | null = null;

  return {
    uuid,
    startNotifications: jest.fn().mockImplementation(async () => {
      notifying = true;
    }),
    stopNotifications: jest.fn().mockImplementation(async () => {
      notifying = false;
    }),
    addEventListener: jest.fn().mockImplementation((event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: jest.fn().mockImplementation((event: string, handler: any) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    }),
    writeValue: jest.fn().mockImplementation(async () => {}),
    readValue: jest.fn().mockImplementation(async () => storedValue),
    set storedValue(v: DataView | null) { storedValue = v; },
    get isNotifying() { return notifying; },
    // Test helper: simulate a BLE notification
    simulateNotification(data: DataView) {
      storedValue = data;
      const event = { target: { value: data } };
      if (listeners["characteristicvaluechanged"]) {
        listeners["characteristicvaluechanged"].forEach(h => h(event));
      }
    }
  };
}

function createMockService() {
  const configChar = createMockCharacteristic(BLE_SENSOR_CONFIG_UUID);
  const dataChar = createMockCharacteristic(BLE_SENSOR_DATA_UUID);
  const infoChar = createMockCharacteristic(BLE_DEVICE_INFO_UUID);

  return {
    uuid: BLE_SENSOR_SERVICE_UUID,
    getCharacteristic: jest.fn().mockImplementation((uuid: string) => {
      if (uuid === BLE_SENSOR_CONFIG_UUID) return Promise.resolve(configChar);
      if (uuid === BLE_SENSOR_DATA_UUID) return Promise.resolve(dataChar);
      if (uuid === BLE_DEVICE_INFO_UUID) return Promise.resolve(infoChar);
      return Promise.reject(new Error(`Unknown characteristic: ${uuid}`));
    }),
    configChar,
    dataChar,
    infoChar
  };
}

function createMockGATTServer(service: any) {
  let connected = true;
  const server = {
    get connected() { return connected; },
    connect: jest.fn().mockImplementation(async () => {
      connected = true;
      // In Web Bluetooth, gatt.connect() returns the BluetoothRemoteGATTServer
      // which has getPrimaryService(). Our mock server IS the GATT server.
      return server;
    }),
    disconnect: jest.fn().mockImplementation(() => {
      connected = false;
    }),
    getPrimaryService: jest.fn().mockResolvedValue(service),
    simulateDisconnect() { connected = false; }
  };
  return server;
}

function createMockDevice(name: string = "ESP32-DHT22", gattServer: any) {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  return {
    name,
    gatt: gattServer,
    addEventListener: jest.fn().mockImplementation((event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: jest.fn().mockImplementation((event: string, handler: any) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    }),
    simulateDisconnect() {
      gattServer.simulateDisconnect();
      if (listeners["gattserverdisconnected"]) {
        listeners["gattserverdisconnected"].forEach(h => h({}));
      }
    }
  };
}

// ─── Tests ───

describe("BLEConnection", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("static methods", () => {
    it("should return correct optional services UUID", () => {
      const services = BLEConnection.getOptionalServices();
      expect(services).toEqual([BLE_SENSOR_SERVICE_UUID]);
    });

    it("should return correct wireless filters", () => {
      const filters = BLEConnection.getWirelessFilters();
      expect(filters).toEqual([{ services: [BLE_SENSOR_SERVICE_UUID] }]);
    });
  });

  describe("connect", () => {
    it("should connect to a provided BLE device", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();

      const result = await connection.connect(mockDevice as any);

      expect(result).toBe(true);
      expect(gatt.connect).toHaveBeenCalled();
      expect(service.getCharacteristic).toHaveBeenCalledWith(BLE_SENSOR_CONFIG_UUID);
      expect(service.getCharacteristic).toHaveBeenCalledWith(BLE_SENSOR_DATA_UUID);
      expect(service.getCharacteristic).toHaveBeenCalledWith(BLE_DEVICE_INFO_UUID);
    });

    it("should subscribe to data notifications after connecting", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();

      await connection.connect(mockDevice as any);

      expect(service.dataChar.startNotifications).toHaveBeenCalled();
      expect(service.dataChar.addEventListener).toHaveBeenCalledWith(
        "characteristicvaluechanged",
        expect.any(Function)
      );
    });

    it("should register disconnect listener after connecting", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();

      await connection.connect(mockDevice as any);

      expect(mockDevice.addEventListener).toHaveBeenCalledWith(
        "gattserverdisconnected",
        expect.any(Function)
      );
    });

    it("should return false on connection failure", async () => {
      const connection = new BLEConnection();
      const mockDevice = {
        name: "BadDevice",
        gatt: {
          connect: jest.fn().mockRejectedValue(new Error("Connection failed")),
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      const result = await connection.connect(mockDevice as any);
      expect(result).toBe(false);
    });

    it("should report isConnected as true after successful connection", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();

      await connection.connect(mockDevice as any);

      expect(connection.isConnected).toBe(true);
    });
  });

  describe("readDeviceInfo", () => {
    it("should parse device info JSON from BLE characteristic", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      const deviceInfoJson = JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      });
      service.infoChar.storedValue = createMockDataView(deviceInfoJson);

      const info = await connection.readDeviceInfo();

      expect(info.name).toBe("ESP32-DHT22");
      expect(info.firmware).toBe("1.0.0");
      expect(info.sensors).toHaveLength(2);
      expect(info.sensors[0].name).toBe("Temperature");
    });

    it("should throw error if not connected", async () => {
      const connection = new BLEConnection();

      await expect(connection.readDeviceInfo()).rejects.toThrow(
        "Device info characteristic not available"
      );
    });
  });

  describe("sendCommand", () => {
    it("should send a start command", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      await connection.sendCommand({ type: "command", action: "start", period_ms: 100 });

      expect(service.configChar.writeValue).toHaveBeenCalled();
    });

    it("should send a stop command", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      await connection.sendCommand({ type: "command", action: "stop" });

      expect(service.configChar.writeValue).toHaveBeenCalled();
    });

    it("should throw error if not connected", async () => {
      const connection = new BLEConnection();

      await expect(connection.sendCommand({ type: "command", action: "start" }))
        .rejects.toThrow("Config characteristic not available");
    });
  });

  describe("data reception", () => {
    it("should call onData callback when data notification is received", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      const receivedData: any[] = [];
      connection.onData((packet) => {
        receivedData.push(packet);
      });

      const dataPacket = JSON.stringify({
        type: "data",
        time: 1.23,
        channels: { temperature: 25.4, humidity: 60.2 }
      });
      service.dataChar.simulateNotification(createMockDataView(dataPacket));

      expect(receivedData).toHaveLength(1);
      expect(receivedData[0].type).toBe("data");
      expect(receivedData[0].time).toBe(1.23);
      expect(receivedData[0].channels.temperature).toBe(25.4);
      expect(receivedData[0].channels.humidity).toBe(60.2);
    });

    it("should ignore non-data packets", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      const receivedData: any[] = [];
      connection.onData((packet) => {
        receivedData.push(packet);
      });

      const infoPacket = JSON.stringify({ type: "device_info", name: "ESP32" });
      service.dataChar.simulateNotification(createMockDataView(infoPacket));

      expect(receivedData).toHaveLength(0);
    });

    it("should handle malformed JSON gracefully", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const receivedData: any[] = [];
      connection.onData((packet) => {
        receivedData.push(packet);
      });

      service.dataChar.simulateNotification(createMockDataView("not valid json{{{"));

      expect(receivedData).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe("disconnect handling", () => {
    it("should call onDisconnect callback when device disconnects", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      let disconnectCalled = false;
      connection.onDisconnect(() => {
        disconnectCalled = true;
      });

      mockDevice.simulateDisconnect();

      expect(disconnectCalled).toBe(true);
    });

    it("should report isConnected as false after disconnect", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      expect(connection.isConnected).toBe(true);

      await connection.disconnect();

      expect(connection.isConnected).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on disconnect", async () => {
      const service = createMockService();
      const gatt = createMockGATTServer(service);
      const mockDevice = createMockDevice("ESP32-DHT22", gatt);
      const connection = new BLEConnection();
      await connection.connect(mockDevice as any);

      await connection.disconnect();

      expect(service.dataChar.removeEventListener).toHaveBeenCalledWith(
        "characteristicvaluechanged",
        expect.any(Function)
      );
      expect(mockDevice.removeEventListener).toHaveBeenCalledWith(
        "gattserverdisconnected",
        expect.any(Function)
      );
    });
  });
});