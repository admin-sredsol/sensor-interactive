import {
  ESP32_DEVICE_PROFILES,
  BLE_SENSOR_SERVICE_UUID,
  BLE_SENSOR_CONFIG_UUID,
  BLE_SENSOR_DATA_UUID,
  BLE_DEVICE_INFO_UUID,
  buildSensorConfigFromProfile,
  resolveDeviceProfile,
  BLEDeviceInfo,
  BLEDataPacket,
  BLECommandPacket
} from "../esp32-device-profiles";

describe("esp32-device-profiles", () => {

  describe("UUID constants", () => {
    it("should define BLE service and characteristic UUIDs", () => {
      expect(BLE_SENSOR_SERVICE_UUID).toBe("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
      expect(BLE_SENSOR_CONFIG_UUID).toBe("beb5483e-36e1-4688-b7f5-ea07361b26a8");
      expect(BLE_SENSOR_DATA_UUID).toBe("1c95d598-a761-4f1e-8ca1-7b4a3f7e9eb1");
      expect(BLE_DEVICE_INFO_UUID).toBe("8bdf0e1a-0fde-4c7d-8a6e-5d3e9f1a2b4c");
    });
  });

  describe("ESP32_DEVICE_PROFILES", () => {
    it("should define all expected device profiles", () => {
      const profileIds = Object.keys(ESP32_DEVICE_PROFILES);
      expect(profileIds).toContain("ESP32-DHT22");
      expect(profileIds).toContain("ESP32-MPU6050");
      expect(profileIds).toContain("ESP32-DHT22-MPU6050");
      expect(profileIds).toContain("ESP32-HCSR04");
      expect(profileIds).toContain("ESP32-HX711");
      expect(profileIds).toContain("ESP32-BMP280");
      expect(profileIds).toContain("ESP32-GENERIC");
    });

    it("should have DHT22 profile with temperature and humidity channels", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      expect(profile.name).toBe("ESP32 DHT22 Sensor");
      expect(profile.channels).toHaveLength(2);
      expect(profile.channels[0].name).toBe("Temperature");
      expect(profile.channels[0].units).toBe("°C");
      expect(profile.channels[1].name).toBe("Humidity");
      expect(profile.channels[1].units).toBe("%");
      expect(profile.defaultPeriodMs).toBe(2000);
      expect(profile.supportsDualCollection).toBe(true);
    });

    it("should have MPU6050 profile with 6 channels", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-MPU6050"];
      expect(profile.channels).toHaveLength(6);
      expect(profile.defaultPeriodMs).toBe(10); // 100 Hz
    });

    it("should have HCSR04 profile with single distance channel", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-HCSR04"];
      expect(profile.channels).toHaveLength(1);
      expect(profile.channels[0].name).toBe("Distance");
      expect(profile.supportsDualCollection).toBe(false);
    });

    it("should have HX711 profile with force and mass channels", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-HX711"];
      expect(profile.channels).toHaveLength(2);
      expect(profile.channels[0].name).toBe("Force");
      expect(profile.channels[1].name).toBe("Mass");
    });

    it("should have BMP280 profile with pressure, temperature, altitude", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-BMP280"];
      expect(profile.channels).toHaveLength(3);
      expect(profile.channels[0].name).toBe("Pressure");
      expect(profile.channels[1].name).toBe("Temperature");
      expect(profile.channels[2].name).toBe("Altitude");
    });

    it("should have GENERIC profile with empty channels", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-GENERIC"];
      expect(profile.channels).toHaveLength(0);
      expect(profile.defaultPeriodMs).toBe(100);
    });

    it("should use numeric string IDs for all channels", () => {
      // All channel IDs should be numeric strings matching SensorConfig convention
      for (const profileId of Object.keys(ESP32_DEVICE_PROFILES)) {
        const profile = ESP32_DEVICE_PROFILES[profileId];
        for (const channel of profile.channels) {
          expect(channel.id).toMatch(/^\d+$/);
          expect(parseInt(channel.id, 10)).toBeGreaterThanOrEqual(100);
        }
      }
    });
  });

  describe("buildSensorConfigFromProfile", () => {
    it("should build a valid SensorConfig from DHT22 profile", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      const config = buildSensorConfigFromProfile(profile);

      expect(config.currentInterface).toBe("ESP32 DHT22 Sensor");
      expect(config.collection.canControl).toBe(true);
      expect(config.collection.isCollecting).toBe(false);

      // Check columns
      expect(Object.keys(config.columns)).toHaveLength(2);
      expect(config.columns["100"].name).toBe("Temperature");
      expect(config.columns["100"].units).toBe("°C");
      expect(config.columns["100"].setID).toBe("100");
      expect(config.columns["101"].name).toBe("Humidity");
      expect(config.columns["101"].units).toBe("%");

      // Check sets
      expect(config.sets["100"].name).toBe("Run 1");
      expect(config.sets["100"].colIDs).toEqual([100, 101]);
    });

    it("should build a valid SensorConfig from MPU6050 profile", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-MPU6050"];
      const config = buildSensorConfigFromProfile(profile);

      expect(Object.keys(config.columns)).toHaveLength(6);
      expect(config.sets["100"].colIDs).toEqual([100, 101, 102, 103, 104, 105]);
    });

    it("should set liveValue to NaN for all columns", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      const config = buildSensorConfigFromProfile(profile);

      for (const colId of Object.keys(config.columns)) {
        expect(config.columns[colId].liveValue).toBe("NaN");
      }
    });

    it("should set ESP32 as os and server arch", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-DHT22"];
      const config = buildSensorConfigFromProfile(profile);

      expect(config.os.name).toBe("ESP32");
      expect(config.server.arch).toBe("ESP32");
    });

    it("should handle GENERIC profile with empty channels", () => {
      const profile = ESP32_DEVICE_PROFILES["ESP32-GENERIC"];
      const config = buildSensorConfigFromProfile(profile);

      expect(Object.keys(config.columns)).toHaveLength(0);
      expect(config.sets["100"].colIDs).toEqual([]);
    });
  });

  describe("resolveDeviceProfile", () => {
    it("should match known device by name", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "ESP32-DHT22",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Temperature", units: "°C" },
          { id: "101", name: "Humidity", units: "%" }
        ]
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.deviceId).toBe("ESP32-DHT22");
      expect(profile.channels).toHaveLength(2);
      // Should return the pre-defined profile, not build dynamically
      expect(profile.name).toBe("ESP32 DHT22 Sensor");
    });

    it("should build profile dynamically from device info sensors", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "ESP32-CustomBoard",
        firmware: "2.1.0",
        sensors: [
          { id: "100", name: "Light", units: "lux" },
          { id: "101", name: "Sound", units: "dB" }
        ]
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.deviceId).toBe("ESP32-CustomBoard");
      expect(profile.name).toBe("ESP32-CustomBoard");
      expect(profile.channels).toHaveLength(2);
      expect(profile.channels[0].name).toBe("Light");
      expect(profile.channels[0].units).toBe("lux");
      expect(profile.channels[1].name).toBe("Sound");
    });

    it("should assign numeric IDs to sensors without IDs", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "ESP32-Unknown",
        firmware: "1.0.0",
        sensors: [
          { name: "Sensor A", units: "V" },
          { name: "Sensor B", units: "A" }
        ]
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.channels[0].id).toBe("100");
      expect(profile.channels[1].id).toBe("101");
    });

    it("should fall back to GENERIC profile when no sensors provided", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "UnknownDevice",
        firmware: "1.0.0",
        sensors: []
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.deviceId).toBe("ESP32-GENERIC");
      expect(profile.channels).toHaveLength(0);
    });

    it("should use defaultPeriodMs from device info when available", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "ESP32-Custom",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Custom", units: "u" }
        ],
        defaultPeriodMs: 250
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.defaultPeriodMs).toBe(250);
    });

    it("should default to 100ms period when not specified", () => {
      const deviceInfo: BLEDeviceInfo = {
        type: "device_info",
        name: "ESP32-Custom",
        firmware: "1.0.0",
        sensors: [
          { id: "100", name: "Custom", units: "u" }
        ]
      };

      const profile = resolveDeviceProfile(deviceInfo);
      expect(profile.defaultPeriodMs).toBe(100);
    });
  });

  describe("BLEDataPacket and BLECommandPacket types", () => {
    it("should create a valid BLEDataPacket", () => {
      const packet: BLEDataPacket = {
        type: "data",
        time: 12.35,
        channels: {
          temperature: 28.4,
          humidity: 65.0
        }
      };

      expect(packet.type).toBe("data");
      expect(packet.time).toBe(12.35);
      expect(packet.channels.temperature).toBe(28.4);
      expect(packet.channels.humidity).toBe(65.0);
    });

    it("should create a valid BLECommandPacket for start", () => {
      const command: BLECommandPacket = {
        type: "command",
        action: "start",
        period_ms: 100
      };

      expect(command.type).toBe("command");
      expect(command.action).toBe("start");
      expect(command.period_ms).toBe(100);
    });

    it("should create a valid BLECommandPacket for stop", () => {
      const command: BLECommandPacket = {
        type: "command",
        action: "stop"
      };

      expect(command.type).toBe("command");
      expect(command.action).toBe("stop");
      expect(command.period_ms).toBeUndefined();
    });
  });
});