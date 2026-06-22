import { WebSocketConnection, WebSocketDataPacket, WebSocketDeviceInfo } from "../websocket-connection";

// ─── Mock WebSocket ───
// jsdom doesn't have a real WebSocket, so we mock it entirely.

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Store reference for test access
    MockWebSocket.lastInstance = this;
  }

  // Track the most recently created instance
  static lastInstance: MockWebSocket | null = null;

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }
}

// Replace global WebSocket with our mock
const OriginalWebSocket = global.WebSocket;

beforeAll(() => {
  (global as any).WebSocket = MockWebSocket;
});

afterAll(() => {
  (global as any).WebSocket = OriginalWebSocket;
});

// ─── Tests ───

describe("WebSocketConnection", () => {
  let connection: WebSocketConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    MockWebSocket.lastInstance = null;
    connection = new WebSocketConnection("ws://192.168.4.1:81");
  });

  afterEach(() => {
    connection.disconnect();
    jest.useRealTimers();
  });

  function getSocket(): MockWebSocket {
    return MockWebSocket.lastInstance!;
  }

  describe("construction", () => {
    it("should create a connection with default URL", () => {
      const conn = new WebSocketConnection();
      expect(conn.isConnected).toBe(false);
    });

    it("should create a connection with custom URL", () => {
      const conn = new WebSocketConnection("ws://192.168.1.100:8080");
      expect(conn.isConnected).toBe(false);
    });
  });

  describe("connect", () => {
    it("should connect and resolve true when device_info is received", async () => {
      const connectPromise = connection.connect();

      // Advance timers to let the constructor run
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      }));

      const result = await connectPromise;
      expect(result).toBe(true);
      expect(connection.isConnected).toBe(true);
    });

    it("should send get_info command on connection", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      expect(socket.sentMessages).toHaveLength(1);
      expect(JSON.parse(socket.sentMessages[0])).toEqual({
        type: "command",
        action: "get_info"
      });
    });

    it("should resolve false on connection error", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateError();

      const result = await connectPromise;
      expect(result).toBe(false);
    });

    it("should resolve false on timeout", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      // No device_info sent — should timeout

      jest.advanceTimersByTime(6000);

      const result = await connectPromise;
      expect(result).toBe(false);
    });

    it("should resolve false on connection close before device_info", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateClose();

      const result = await connectPromise;
      expect(result).toBe(false);
    });
  });

  describe("data reception", () => {
    it("should call onData callback when data packet is received", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      const receivedData: WebSocketDataPacket[] = [];
      connection.onData((packet) => {
        receivedData.push(packet);
      });

      socket.simulateMessage(JSON.stringify({
        type: "data",
        time: 1.5,
        channels: { "100": 25.4, "101": 60.2 }
      }));

      expect(receivedData).toHaveLength(1);
      expect(receivedData[0].type).toBe("data");
      expect(receivedData[0].time).toBe(1.5);
      expect(receivedData[0].channels["100"]).toBe(25.4);
      expect(receivedData[0].channels["101"]).toBe(60.2);
    });

    it("should ignore packets with unknown type", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      const receivedData: WebSocketDataPacket[] = [];
      connection.onData((packet) => {
        receivedData.push(packet);
      });

      socket.simulateMessage(JSON.stringify({
        type: "unknown_type",
        data: "something"
      }));

      expect(receivedData).toHaveLength(0);
    });

    it("should handle malformed JSON gracefully", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      socket.simulateMessage("not valid json{{{");

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("sendCommand", () => {
    it("should send a command when connected", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      connection.sendCommand({ type: "command", action: "start", period_ms: 100 });

      expect(socket.sentMessages).toHaveLength(2); // get_info + start
      expect(JSON.parse(socket.sentMessages[1])).toEqual({
        type: "command",
        action: "start",
        period_ms: 100
      });
    });

    it("should not send a command when not connected", () => {
      // Not connected — sendCommand should not throw
      expect(() => {
        connection.sendCommand({ type: "command", action: "start" });
      }).not.toThrow();
    });
  });

  describe("onConnect callback", () => {
    it("should call onConnect callback when device_info is received", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const receivedInfo: WebSocketDeviceInfo[] = [];
      connection.onConnect((info) => {
        receivedInfo.push(info);
      });

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" }
        ]
      }));

      await connectPromise;

      expect(receivedInfo).toHaveLength(1);
      expect(receivedInfo[0].name).toBe("ESP32-DHT22");
      expect(receivedInfo[0].sensors).toHaveLength(1);
    });
  });

  describe("disconnect handling", () => {
    it("should call onDisconnect callback when connection closes", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      let disconnectCalled = false;
      connection.onDisconnect(() => {
        disconnectCalled = true;
      });

      socket.simulateClose();

      expect(disconnectCalled).toBe(true);
    });

    it("should report isConnected as false after disconnect", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;
      expect(connection.isConnected).toBe(true);

      connection.disconnect();
      expect(connection.isConnected).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should clean up event handlers on disconnect", async () => {
      const connectPromise = connection.connect();
      await jest.advanceTimersByTimeAsync(0);

      const socket = getSocket();
      socket.simulateOpen();
      socket.simulateMessage(JSON.stringify({
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: []
      }));

      await connectPromise;

      connection.disconnect();

      // After disconnect, the socket should be null
      expect(connection.isConnected).toBe(false);

      // Verify event handlers are cleaned up
      expect(socket.onopen).toBeNull();
      expect(socket.onmessage).toBeNull();
      expect(socket.onclose).toBeNull();
      expect(socket.onerror).toBeNull();
    });
  });
});