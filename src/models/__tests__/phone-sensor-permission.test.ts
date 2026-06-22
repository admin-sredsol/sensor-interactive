import {
  detectAvailableSensors,
  requiresMotionPermission,
  requiresOrientationPermission,
  requestMotionPermission,
  requestOrientationPermission,
  requestLocationPermission,
  requestAllPermissions,
  isMobileDevice,
} from "../phone-sensor-permission";

// ─── Tests ───

describe("phone-sensor-permission", () => {

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up any globals we set
    delete (global as any).DeviceMotionEvent;
    delete (global as any).DeviceOrientationEvent;
  });

  describe("detectAvailableSensors", () => {
    it("should detect motion when DeviceMotionEvent is in window", () => {
      (global as any).DeviceMotionEvent = function() {};
      const sensors = detectAvailableSensors();
      expect(sensors).toContain("motion");
    });

    it("should detect orientation when DeviceOrientationEvent is in window", () => {
      (global as any).DeviceOrientationEvent = function() {};
      const sensors = detectAvailableSensors();
      expect(sensors).toContain("orientation");
    });

    it("should detect location when geolocation is in navigator", () => {
      // jsdom should have navigator.geolocation
      const sensors = detectAvailableSensors();
      if ("geolocation" in navigator) {
        expect(sensors).toContain("location");
      }
    });

    it("should return empty array when no APIs are available", () => {
      // Remove DeviceMotionEvent and DeviceOrientationEvent from global
      delete (global as any).DeviceMotionEvent;
      delete (global as any).DeviceOrientationEvent;

      // In jsdom, navigator.geolocation may still exist, so we just verify
      // that motion and orientation are not detected when their APIs are missing
      const sensors = detectAvailableSensors();
      expect(sensors).not.toContain("motion");
      expect(sensors).not.toContain("orientation");
    });
  });

  describe("requiresMotionPermission", () => {
    it("should return false when requestPermission is not available", () => {
      expect(requiresMotionPermission()).toBe(false);
    });

    it("should return true when requestPermission is available", () => {
      (global as any).DeviceMotionEvent = function() {};
      (global as any).DeviceMotionEvent.requestPermission = jest.fn();
      expect(requiresMotionPermission()).toBe(true);
    });
  });

  describe("requiresOrientationPermission", () => {
    it("should return false when requestPermission is not available", () => {
      expect(requiresOrientationPermission()).toBe(false);
    });

    it("should return true when requestPermission is available", () => {
      (global as any).DeviceOrientationEvent = function() {};
      (global as any).DeviceOrientationEvent.requestPermission = jest.fn();
      expect(requiresOrientationPermission()).toBe(true);
    });
  });

  describe("requestMotionPermission", () => {
    it("should return unavailable when DeviceMotionEvent is not defined", async () => {
      delete (global as any).DeviceMotionEvent;
      const status = await requestMotionPermission();
      expect(status).toBe("unavailable");
    });

    it("should return granted when no permission is required", async () => {
      (global as any).DeviceMotionEvent = function() {};
      const status = await requestMotionPermission();
      expect(status).toBe("granted");
    });

    it("should return granted when requestPermission resolves with granted", async () => {
      (global as any).DeviceMotionEvent = function() {};
      (global as any).DeviceMotionEvent.requestPermission = jest.fn().mockResolvedValue("granted");
      const status = await requestMotionPermission();
      expect(status).toBe("granted");
    });

    it("should return denied when requestPermission resolves with denied", async () => {
      (global as any).DeviceMotionEvent = function() {};
      (global as any).DeviceMotionEvent.requestPermission = jest.fn().mockResolvedValue("denied");
      const status = await requestMotionPermission();
      expect(status).toBe("denied");
    });

    it("should return denied when requestPermission throws", async () => {
      (global as any).DeviceMotionEvent = function() {};
      (global as any).DeviceMotionEvent.requestPermission = jest.fn().mockRejectedValue(new Error("Not allowed"));
      const status = await requestMotionPermission();
      expect(status).toBe("denied");
    });
  });

  describe("requestOrientationPermission", () => {
    it("should return unavailable when DeviceOrientationEvent is not defined", async () => {
      delete (global as any).DeviceOrientationEvent;
      const status = await requestOrientationPermission();
      expect(status).toBe("unavailable");
    });

    it("should return granted when no permission is required", async () => {
      (global as any).DeviceOrientationEvent = function() {};
      const status = await requestOrientationPermission();
      expect(status).toBe("granted");
    });

    it("should return granted when requestPermission resolves with granted", async () => {
      (global as any).DeviceOrientationEvent = function() {};
      (global as any).DeviceOrientationEvent.requestPermission = jest.fn().mockResolvedValue("granted");
      const status = await requestOrientationPermission();
      expect(status).toBe("granted");
    });

    it("should return denied when requestPermission resolves with denied", async () => {
      (global as any).DeviceOrientationEvent = function() {};
      (global as any).DeviceOrientationEvent.requestPermission = jest.fn().mockResolvedValue("denied");
      const status = await requestOrientationPermission();
      expect(status).toBe("denied");
    });

    it("should return denied when requestPermission throws", async () => {
      (global as any).DeviceOrientationEvent = function() {};
      (global as any).DeviceOrientationEvent.requestPermission = jest.fn().mockRejectedValue(new Error("Not allowed"));
      const status = await requestOrientationPermission();
      expect(status).toBe("denied");
    });
  });

  describe("requestLocationPermission", () => {
    it("should return granted when geolocation succeeds", async () => {
      const origGeo = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (success: PositionCallback) => {
            success({} as GeolocationPosition);
          },
          watchPosition: jest.fn(),
          clearWatch: jest.fn(),
        },
        configurable: true,
      });
      const status = await requestLocationPermission();
      expect(status).toBe("granted");
      Object.defineProperty(navigator, "geolocation", {
        value: origGeo,
        configurable: true,
      });
    });

    it("should return denied when geolocation permission is denied", async () => {
      const origGeo = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
            if (error) {
              error({ code: 1, message: "Permission denied" } as GeolocationPositionError);
            }
          },
          watchPosition: jest.fn(),
          clearWatch: jest.fn(),
        },
        configurable: true,
      });
      const status = await requestLocationPermission();
      expect(status).toBe("denied");
      Object.defineProperty(navigator, "geolocation", {
        value: origGeo,
        configurable: true,
      });
    });

    it("should return unavailable when geolocation has a non-permission error", async () => {
      const origGeo = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
            if (error) {
              error({ code: 2, message: "Position unavailable" } as GeolocationPositionError);
            }
          },
          watchPosition: jest.fn(),
          clearWatch: jest.fn(),
        },
        configurable: true,
      });
      const status = await requestLocationPermission();
      expect(status).toBe("unavailable");
      Object.defineProperty(navigator, "geolocation", {
        value: origGeo,
        configurable: true,
      });
    });
  });

  describe("requestAllPermissions", () => {
    it("should request motion permission when motion is in sensorTypes", async () => {
      (global as any).DeviceMotionEvent = function() {};
      const result = await requestAllPermissions(["motion"]);
      expect(result.motion).toBe("granted"); // No permission required
      expect(result.orientation).toBe("unavailable");
      expect(result.location).toBe("unavailable");
    });

    it("should request orientation permission when orientation is in sensorTypes", async () => {
      (global as any).DeviceOrientationEvent = function() {};
      const result = await requestAllPermissions(["orientation"]);
      expect(result.motion).toBe("unavailable");
      expect(result.orientation).toBe("granted"); // No permission required
      expect(result.location).toBe("unavailable");
    });

    it("should request location permission when location is in sensorTypes", async () => {
      const origGeo = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (success: PositionCallback) => {
            success({} as GeolocationPosition);
          },
          watchPosition: jest.fn(),
          clearWatch: jest.fn(),
        },
        configurable: true,
      });
      const result = await requestAllPermissions(["location"]);
      expect(result.motion).toBe("unavailable");
      expect(result.orientation).toBe("unavailable");
      expect(result.location).toBe("granted");
      Object.defineProperty(navigator, "geolocation", {
        value: origGeo,
        configurable: true,
      });
    });

    it("should request all permissions when all sensor types are specified", async () => {
      (global as any).DeviceMotionEvent = function() {};
      (global as any).DeviceOrientationEvent = function() {};
      const origGeo = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (success: PositionCallback) => {
            success({} as GeolocationPosition);
          },
          watchPosition: jest.fn(),
          clearWatch: jest.fn(),
        },
        configurable: true,
      });
      const result = await requestAllPermissions(["motion", "orientation", "location"]);
      expect(result.motion).toBe("granted");
      expect(result.orientation).toBe("granted");
      expect(result.location).toBe("granted");
      Object.defineProperty(navigator, "geolocation", {
        value: origGeo,
        configurable: true,
      });
    });

    it("should return all unavailable when no sensor types are specified", async () => {
      const result = await requestAllPermissions([]);
      expect(result.motion).toBe("unavailable");
      expect(result.orientation).toBe("unavailable");
      expect(result.location).toBe("unavailable");
    });
  });

  describe("isMobileDevice", () => {
    it("should return false in jsdom (desktop user agent)", () => {
      expect(isMobileDevice()).toBe(false);
    });

    it("should return true for Android user agent", () => {
      const originalUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36",
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
      Object.defineProperty(navigator, "userAgent", {
        value: originalUserAgent,
        configurable: true,
      });
    });

    it("should return true for iPhone user agent", () => {
      const originalUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)",
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
      Object.defineProperty(navigator, "userAgent", {
        value: originalUserAgent,
        configurable: true,
      });
    });

    it("should return true for iPad user agent", () => {
      const originalUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPad; CPU OS 13_0 like Mac OS X)",
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
      Object.defineProperty(navigator, "userAgent", {
        value: originalUserAgent,
        configurable: true,
      });
    });
  });
});