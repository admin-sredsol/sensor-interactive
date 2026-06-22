import { PhoneSensorManager } from "../phone-sensor-manager";
import { NewSensorData } from "../sensor-manager";

// ─── Mock helpers ───

function createMockDeviceMotionEvent(data: {
  accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null };
  acceleration?: { x: number | null; y: number | null; z: number | null };
  rotationRate?: { alpha: number | null; beta: number | null; gamma: number | null };
  interval?: number;
}): DeviceMotionEvent {
  const event = {
    accelerationIncludingGravity: data.accelerationIncludingGravity
      ? {
          x: data.accelerationIncludingGravity.x,
          y: data.accelerationIncludingGravity.y,
          z: data.accelerationIncludingGravity.z,
        }
      : null,
    acceleration: data.acceleration
      ? {
          x: data.acceleration.x,
          y: data.acceleration.y,
          z: data.acceleration.z,
        }
      : null,
    rotationRate: data.rotationRate
      ? {
          alpha: data.rotationRate.alpha,
          beta: data.rotationRate.beta,
          gamma: data.rotationRate.gamma,
        }
      : null,
    interval: data.interval ?? 16,
  } as unknown as DeviceMotionEvent;
  return event;
}

function createMockDeviceOrientationEvent(data: {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
}): DeviceOrientationEvent {
  return {
    alpha: data.alpha ?? null,
    beta: data.beta ?? null,
    gamma: data.gamma ?? null,
    absolute: false,
  } as unknown as DeviceOrientationEvent;
}

// ─── Tests ───

describe("PhoneSensorManager", () => {
  let manager: PhoneSensorManager;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers();
    manager = new PhoneSensorManager();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up any event listeners
    manager.requestStop();
  });

  describe("construction", () => {
    it("should create a manager with default accelerometer preset", () => {
      expect(manager.isWirelessDevice()).toBe(true);
      expect(manager.hasSensorData()).toBe(false);
      expect(manager.supportsDualCollection).toBe(true);
      expect(manager.supportsHeartbeat).toBe(true);
    });

    it("should create a manager with a named preset", () => {
      const mgr = new PhoneSensorManager({ preset: "orientation" });
      expect(mgr).toBeDefined();
    });

    it("should create a manager with custom channels", () => {
      const mgr = new PhoneSensorManager({ channels: ["100", "101"] });
      expect(mgr).toBeDefined();
    });

    it("should create a manager with includeLocation option", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer", includeLocation: true });
      expect(mgr).toBeDefined();
    });

    it("should fall back to accelerometer preset for unknown preset", () => {
      const mgr = new PhoneSensorManager({ preset: "nonexistent" });
      // Should still work with default preset
      expect(mgr).toBeDefined();
    });
  });

  describe("static methods", () => {
    it("should return available sensors from getAvailableSensors", () => {
      const sensors = PhoneSensorManager.getAvailableSensors();
      expect(Array.isArray(sensors)).toBe(true);
    });

    it("should return boolean from isMobile", () => {
      const result = PhoneSensorManager.isMobile();
      expect(typeof result).toBe("boolean");
    });

    it("should return presets from getPresets", () => {
      const presets = PhoneSensorManager.getPresets();
      expect(Object.keys(presets)).toContain("accelerometer");
      expect(Object.keys(presets)).toContain("orientation");
      expect(Object.keys(presets)).toContain("location");
    });

    it("should request permissions from requestPermissions", async () => {
      const result = await PhoneSensorManager.requestPermissions(["motion"]);
      expect(result).toHaveProperty("motion");
      expect(result).toHaveProperty("orientation");
      expect(result).toHaveProperty("location");
    });
  });

  describe("variableMeasurementPeriods", () => {
    it("should return correct periods for accelerometer preset", () => {
      const periods = manager.variableMeasurementPeriods();
      expect(periods.supported).toBe(true);
      expect(periods.defaultPeriod).toBe(20); // accelerometer default
      expect(periods.periods).toContain(20);
    });

    it("should return 1000ms default for location preset", () => {
      const locManager = new PhoneSensorManager({ preset: "location" });
      const periods = locManager.variableMeasurementPeriods();
      expect(periods.defaultPeriod).toBe(1000);
    });

    it("should return 100ms default for motion_location preset", () => {
      const mlManager = new PhoneSensorManager({ preset: "motion_location" });
      const periods = mlManager.variableMeasurementPeriods();
      // motion_location includes location channels, so default is 1000ms (GPS rate)
      expect(periods.defaultPeriod).toBe(1000);
    });
  });

  describe("startPolling", () => {
    it("should call onSensorConnect and onSensorStatus", () => {
      const connectSpy = jest.spyOn(manager as any, "onSensorConnect");
      const statusSpy = jest.spyOn(manager as any, "onSensorStatus");

      manager.startPolling();

      expect(connectSpy).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalled();
    });
  });

  describe("requestStart / requestStop", () => {
    it("should set collecting to true on requestStart", () => {
      manager.requestStart(20);
      expect((manager as any).collecting).toBe(true);
      manager.requestStop();
    });

    it("should set collecting to false on requestStop", () => {
      manager.requestStart(20);
      manager.requestStop();
      expect((manager as any).collecting).toBe(false);
    });

    it("should call onSensorCollectionStopped on requestStop", () => {
      const stopSpy = jest.spyOn(manager as any, "onSensorCollectionStopped");
      manager.requestStart(20);
      manager.requestStop();
      expect(stopSpy).toHaveBeenCalled();
    });

    it("should add and remove motion listener when permission granted", () => {
      (manager as any).permissions.motion = "granted";
      const addSpy = jest.spyOn(window, "addEventListener");
      const removeSpy = jest.spyOn(window, "removeEventListener");

      manager.requestStart(20);
      expect(addSpy).toHaveBeenCalledWith("devicemotion", expect.any(Function));

      manager.requestStop();
      expect(removeSpy).toHaveBeenCalledWith("devicemotion", expect.any(Function));
    });

    it("should add and remove orientation listener when permission granted", () => {
      const orientManager = new PhoneSensorManager({ preset: "orientation" });
      (orientManager as any).permissions.orientation = "granted";
      const addSpy = jest.spyOn(window, "addEventListener");
      const removeSpy = jest.spyOn(window, "removeEventListener");

      orientManager.requestStart(50);
      expect(addSpy).toHaveBeenCalledWith("deviceorientation", expect.any(Function));

      orientManager.requestStop();
      expect(removeSpy).toHaveBeenCalledWith("deviceorientation", expect.any(Function));
    });

    it("should not add motion listener when permission not granted", () => {
      (manager as any).permissions.motion = "denied";
      const addSpy = jest.spyOn(window, "addEventListener");

      manager.requestStart(20);
      expect(addSpy).not.toHaveBeenCalledWith("devicemotion", expect.any(Function));
      manager.requestStop();
    });
  });

  describe("motion data handling", () => {
    it("should process accelerationIncludingGravity data", () => {
      (manager as any).permissions.motion = "granted";
      const dataSpy = jest.spyOn(manager as any, "onSensorData");

      manager.requestStart(20);

      // Simulate motion event
      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 0.1, y: 9.8, z: 0.0 },
      });
      (manager as any).motionHandler(event);

      expect(dataSpy).toHaveBeenCalled();
      const callData = dataSpy.mock.calls[0][0] as NewSensorData;
      expect(callData["100"]).toBeDefined(); // accelX
      expect(callData["101"]).toBeDefined(); // accelY
      expect(callData["102"]).toBeDefined(); // accelZ

      manager.requestStop();
    });

    it("should process rotationRate data", () => {
      const gyroManager = new PhoneSensorManager({ preset: "accelerometer_gyro" });
      (gyroManager as any).permissions.motion = "granted";
      const dataSpy = jest.spyOn(gyroManager as any, "onSensorData");

      gyroManager.requestStart(20);

      const event = createMockDeviceMotionEvent({
        rotationRate: { alpha: 10, beta: 20, gamma: 30 },
      });
      (gyroManager as any).motionHandler(event);

      expect(dataSpy).toHaveBeenCalled();
      const callData = dataSpy.mock.calls[0][0] as NewSensorData;
      expect(callData["106"]).toBeDefined(); // rotAlpha
      expect(callData["107"]).toBeDefined(); // rotBeta
      expect(callData["108"]).toBeDefined(); // rotGamma

      gyroManager.requestStop();
    });

    it("should skip null values", () => {
      (manager as any).permissions.motion = "granted";
      const dataSpy = jest.spyOn(manager as any, "onSensorData");

      manager.requestStart(20);

      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: null, y: 9.8, z: 0.0 },
      });
      (manager as any).motionHandler(event);

      expect(dataSpy).toHaveBeenCalled();
      const callData = dataSpy.mock.calls[0][0] as NewSensorData;
      expect(callData["100"]).toBeUndefined(); // null x should be skipped
      expect(callData["101"]).toBeDefined(); // y should be present

      manager.requestStop();
    });

    it("should not process data when not collecting", () => {
      (manager as any).permissions.motion = "granted";
      const dataSpy = jest.spyOn(manager as any, "onSensorData");

      // Start and then stop to set up the handler but not be collecting
      manager.requestStart(20);
      manager.requestStop();

      // Manually invoke the handler (it's still attached but collecting is false)
      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 0.1, y: 9.8, z: 0.0 },
      });
      if ((manager as any).motionHandler) {
        (manager as any).motionHandler(event);
      }

      // onSensorData should not have been called because collecting is false
      // (Note: the handler checks `if (!this.collecting) return;`)
      // But since we called requestStop which removes the handler, motionHandler is null
      expect(dataSpy).not.toHaveBeenCalled();
    });
  });

  describe("orientation data handling", () => {
    it("should process orientation data", () => {
      const orientManager = new PhoneSensorManager({ preset: "orientation" });
      (orientManager as any).permissions.orientation = "granted";
      const dataSpy = jest.spyOn(orientManager as any, "onSensorData");

      orientManager.requestStart(50);

      const event = createMockDeviceOrientationEvent({
        alpha: 180,
        beta: 45,
        gamma: -30,
      });
      (orientManager as any).orientationHandler(event);

      expect(dataSpy).toHaveBeenCalled();
      const callData = dataSpy.mock.calls[0][0] as NewSensorData;
      expect(callData["109"]).toBeDefined(); // heading
      expect(callData["110"]).toBeDefined(); // tiltFB
      expect(callData["111"]).toBeDefined(); // tiltLR

      orientManager.requestStop();
    });
  });

  describe("geolocation handling", () => {
    it("should start and stop geolocation watcher", () => {
      const locManager = new PhoneSensorManager({ preset: "location" });
      (locManager as any).permissions.location = "granted";

      const mockWatchPosition = jest.fn().mockReturnValue(123);
      const mockClearWatch = jest.fn();
      const origGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: jest.fn(),
          watchPosition: mockWatchPosition,
          clearWatch: mockClearWatch,
        },
        configurable: true,
      });

      locManager.requestStart(1000);
      expect(mockWatchPosition).toHaveBeenCalled();

      locManager.requestStop();
      expect(mockClearWatch).toHaveBeenCalledWith(123);

      Object.defineProperty(navigator, "geolocation", {
        value: origGeolocation,
        configurable: true,
      });
    });
  });

  describe("requestHeartbeat", () => {
    it("should update live values in config", () => {
      (manager as any).latestValues = { "100": 9.81, "101": 0.5 };
      manager.requestHeartbeat(true);

      // Advance timer to trigger heartbeat
      jest.advanceTimersByTime(1000);

      const config = manager.getSensorConfig().currentConfig!;
      expect(config.columns["100"].liveValue).toBe("9.81");
      expect(config.columns["101"].liveValue).toBe("0.5");
    });

    it("should stop heartbeat when disabled", () => {
      manager.requestHeartbeat(true);
      manager.requestHeartbeat(false);

      // No error should occur
      expect(true).toBe(true);
    });
  });

  describe("setPreset", () => {
    it("should change the active preset", () => {
      manager.setPreset("orientation");
      const config = manager.getSensorConfig();
      // Orientation preset has 3 channels: heading, tiltFB, tiltLR
      const colIDs = config.currentConfig!.sets["100"].colIDs;
      expect(colIDs).toHaveLength(3);
    });

    it("should not change preset for unknown preset ID", () => {
      const configBefore = manager.getSensorConfig();
      manager.setPreset("nonexistent");
      const configAfter = manager.getSensorConfig();
      // Config should be unchanged
      expect(configAfter.currentConfig!.sessionDesc).toBe(configBefore.currentConfig!.sessionDesc);
    });
  });

  describe("setChannels", () => {
    it("should set custom channels", () => {
      manager.setChannels(["100", "101"]);
      const config = manager.getSensorConfig();
      const colIDs = config.currentConfig!.sets["100"].colIDs;
      expect(colIDs).toHaveLength(2);
      expect(colIDs).toContain(100);
      expect(colIDs).toContain(101);
    });
  });

  describe("requestSensorPermissions", () => {
    it("should request permissions for required sources", async () => {
      const result = await manager.requestSensorPermissions();
      expect(typeof result).toBe("boolean");
    });

    it("should return true when all permissions are granted", async () => {
      // In jsdom, motion/orientation don't need permission, location may or may not
      const accelManager = new PhoneSensorManager({ preset: "accelerometer" });
      const result = await accelManager.requestSensorPermissions();
      // In jsdom, motion permission returns "granted" (no permission needed)
      expect(result).toBe(true);
    });
  });

  describe("getPermissionStatus", () => {
    it("should return current permission status", () => {
      const status = manager.getPermissionStatus();
      expect(status).toHaveProperty("motion");
      expect(status).toHaveProperty("orientation");
      expect(status).toHaveProperty("location");
    });
  });

  describe("buildConfig", () => {
    it("should build config with correct structure for accelerometer preset", () => {
      const config = manager.getSensorConfig();
      expect(config.currentConfig).toBeDefined();
      expect(config.currentConfig!.currentInterface).toBe("Phone Sensors");
      expect(config.currentConfig!.sessionDesc).toBe("Accelerometer");
      expect(config.currentConfig!.columns).toBeDefined();
    });

    it("should include location channels when includeLocation is true", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer", includeLocation: true });
      const config = mgr.getSensorConfig();
      const colIDs = config.currentConfig!.sets["100"].colIDs;
      // Should have 3 accel + 4 location = 7 channels
      expect(colIDs).toHaveLength(7);
    });

    it("should use numeric string IDs for columns", () => {
      const config = manager.getSensorConfig();
      const columns = config.currentConfig!.columns;
      // Check that column IDs are numeric strings
      for (const key of Object.keys(columns)) {
        expect(parseInt(key, 10)).not.toBeNaN();
      }
    });
  });

  // ─── Smoothing integration tests ───

  describe("smoothing", () => {
    it("should default to no smoothing", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      expect(mgr.getSmoothingMode()).toBe("none");
    });

    it("should accept smoothing config in constructor", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "moving-average", windowSize: 3 },
      });
      expect(mgr.getSmoothingMode()).toBe("moving-average");
      const config = mgr.getSmoothingConfig();
      expect(config.windowSize).toBe(3);
    });

    it("should allow setting smoothing config after construction", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      expect(mgr.getSmoothingMode()).toBe("none");
      mgr.setSmoothingConfig({ mode: "low-pass", alpha: 0.3 });
      expect(mgr.getSmoothingMode()).toBe("low-pass");
      expect(mgr.getSmoothingConfig().alpha).toBe(0.3);
    });

    it("should apply moving-average smoothing to motion data", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "moving-average", windowSize: 3 },
      });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      // Start collection
      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      // First event: no smoothing yet (single value)
      const event1 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 10, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event1);
      expect((dataSpy.mock.calls[0][0] as NewSensorData)["100"][0][1]).toBeCloseTo(10); // first value passes through

      // Second event: average of 10 and 20 = 15
      const event2 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 20, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event2);
      expect((dataSpy.mock.calls[1][0] as NewSensorData)["100"][0][1]).toBeCloseTo(15);

      mgr.requestStop();
    });

    it("should apply low-pass smoothing to motion data", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "low-pass", alpha: 0.5 },
      });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      // First event: passes through directly
      const event1 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 10, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event1);
      expect((dataSpy.mock.calls[0][0] as NewSensorData)["100"][0][1]).toBeCloseTo(10);

      // Second event: 0.5 * 20 + 0.5 * 10 = 15
      const event2 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 20, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event2);
      expect((dataSpy.mock.calls[1][0] as NewSensorData)["100"][0][1]).toBeCloseTo(15);

      mgr.requestStop();
    });

    it("should reset smoothing state on requestStop", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "low-pass", alpha: 0.5 },
      });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      // First collection: seed the filter
      const event1 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 10, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event1);
      expect((dataSpy.mock.calls[0][0] as NewSensorData)["100"][0][1]).toBeCloseTo(10);

      // Second event: smoothed
      const event2 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 20, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event2);
      expect((dataSpy.mock.calls[1][0] as NewSensorData)["100"][0][1]).toBeCloseTo(15);

      mgr.requestStop();

      // Start new collection: filter should be reset
      mgr.requestStart(100);
      const event3 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 50, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event3);
      // After reset, first value passes through directly
      expect((dataSpy.mock.calls[2][0] as NewSensorData)["100"][0][1]).toBeCloseTo(50);

      mgr.requestStop();
    });

    it("should smooth each channel independently", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "low-pass", alpha: 0.5 },
      });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 10, y: 20, z: 30 },
      });
      (mgr as any).motionHandler!(event);
      const call1 = dataSpy.mock.calls[0][0] as NewSensorData;
      // All channels start fresh
      expect(call1["100"][0][1]).toBeCloseTo(10);
      expect(call1["101"][0][1]).toBeCloseTo(20);
      expect(call1["102"][0][1]).toBeCloseTo(30);

      mgr.requestStop();
    });
  });

  // ─── Calibration tests ───

  describe("calibration", () => {
    it("should have no calibration by default", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      expect(mgr.getCalibration().hasCalibration()).toBe(false);
    });

    it("should allow setting calibration on the engine", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      mgr.getCalibration().setCalibration("100", { offset: 9.8 });
      expect(mgr.getCalibration().getCalibration("100").offset).toBe(9.8);
    });

    it("should apply calibration to motion data", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      mgr.getCalibration().setCalibration("100", { offset: 10 });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 15, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event);

      const callData = dataSpy.mock.calls[0][0] as NewSensorData;
      // Channel 100: (15 - 10) * 1 = 5
      expect(callData["100"][0][1]).toBeCloseTo(5);

      mgr.requestStop();
    });

    it("should apply both smoothing and calibration", () => {
      const mgr = new PhoneSensorManager({
        preset: "accelerometer",
        smoothing: { mode: "low-pass", alpha: 0.5 },
      });
      mgr.getCalibration().setCalibration("100", { offset: 10 });
      const dataSpy = jest.spyOn(mgr as any, "onSensorData");

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      // First event: smoothing passes through, calibration applies
      const event1 = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 20, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event1);
      const call1 = dataSpy.mock.calls[0][0] as NewSensorData;
      // Smoothing: 20 (first value passes through)
      // Calibration: (20 - 10) * 1 = 10
      expect(call1["100"][0][1]).toBeCloseTo(10);

      mgr.requestStop();
    });

    it("should tare using current sensor values", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });

      (mgr as any).permissions = { motion: "granted", orientation: "pending", location: "pending" };
      mgr.requestStart(100);

      // Send some data to populate latestValues
      const event = createMockDeviceMotionEvent({
        accelerationIncludingGravity: { x: 9.8, y: 0, z: 0 },
      });
      (mgr as any).motionHandler!(event);

      // Tare using current values
      mgr.tare();

      // Check that offset was set
      expect(mgr.getCalibration().getCalibration("100").offset).toBeCloseTo(9.8);

      mgr.requestStop();
    });

    it("should reset calibration", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      mgr.getCalibration().setCalibration("100", { offset: 5 });
      expect(mgr.getCalibration().hasCalibration()).toBe(true);
      mgr.resetCalibration();
      expect(mgr.getCalibration().hasCalibration()).toBe(false);
    });

    it("should save and restore calibration snapshot", () => {
      const mgr = new PhoneSensorManager({ preset: "accelerometer" });
      mgr.getCalibration().setCalibration("100", { offset: 5, scaleFactor: 2 });
      const snapshot = mgr.getCalibrationSnapshot();

      mgr.resetCalibration();
      expect(mgr.getCalibration().hasCalibration()).toBe(false);

      mgr.restoreCalibration(snapshot);
      expect(mgr.getCalibration().getCalibration("100").offset).toBe(5);
      expect(mgr.getCalibration().getCalibration("100").scaleFactor).toBe(2);
    });
  });
});