import {
  ALL_CHANNELS,
  PHONE_SENSOR_PRESETS,
  getChannelById,
  getRequiredSources,
} from "../phone-sensor-profiles";

describe("phone-sensor-profiles", () => {

  describe("ALL_CHANNELS", () => {
    it("should define 16 channels", () => {
      expect(ALL_CHANNELS).toHaveLength(16);
    });

    it("should have unique IDs for all channels", () => {
      const ids = ALL_CHANNELS.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should use numeric string IDs starting at 100", () => {
      for (const channel of ALL_CHANNELS) {
        const num = parseInt(channel.id, 10);
        expect(num).toBeGreaterThanOrEqual(100);
        expect(num).toBeLessThanOrEqual(115);
      }
    });

    it("should have required fields for each channel", () => {
      for (const channel of ALL_CHANNELS) {
        expect(channel).toHaveProperty("id");
        expect(channel).toHaveProperty("name");
        expect(channel).toHaveProperty("units");
        expect(channel).toHaveProperty("position");
        expect(channel).toHaveProperty("source");
        expect(channel).toHaveProperty("property");
        expect(typeof channel.id).toBe("string");
        expect(typeof channel.name).toBe("string");
        expect(typeof channel.units).toBe("string");
        expect(typeof channel.position).toBe("number");
        expect(["motion", "orientation", "location"]).toContain(channel.source);
      }
    });

    it("should have 9 motion channels", () => {
      const motionChannels = ALL_CHANNELS.filter(c => c.source === "motion");
      expect(motionChannels).toHaveLength(9);
    });

    it("should have 3 orientation channels", () => {
      const orientationChannels = ALL_CHANNELS.filter(c => c.source === "orientation");
      expect(orientationChannels).toHaveLength(3);
    });

    it("should have 4 location channels", () => {
      const locationChannels = ALL_CHANNELS.filter(c => c.source === "location");
      expect(locationChannels).toHaveLength(4);
    });

    it("should have sequential positions starting at 1", () => {
      for (let i = 0; i < ALL_CHANNELS.length; i++) {
        expect(ALL_CHANNELS[i].position).toBe(i + 1);
      }
    });
  });

  describe("PHONE_SENSOR_PRESETS", () => {
    it("should define 6 presets", () => {
      const presetKeys = Object.keys(PHONE_SENSOR_PRESETS);
      expect(presetKeys).toHaveLength(6);
    });

    it("should have expected preset IDs", () => {
      const expectedIds = [
        "accelerometer",
        "accelerometer_gyro",
        "orientation",
        "full_motion",
        "location",
        "motion_location",
      ];
      expect(Object.keys(PHONE_SENSOR_PRESETS)).toEqual(expect.arrayContaining(expectedIds));
    });

    it("should have accelerometer preset with 3 channels", () => {
      const preset = PHONE_SENSOR_PRESETS.accelerometer;
      expect(preset.channels).toHaveLength(3);
      expect(preset.channels.every(c => c.source === "motion")).toBe(true);
      expect(preset.defaultPeriodMs).toBe(20);
    });

    it("should have accelerometer_gyro preset with 6 channels", () => {
      const preset = PHONE_SENSOR_PRESETS.accelerometer_gyro;
      expect(preset.channels).toHaveLength(6);
      expect(preset.defaultPeriodMs).toBe(20);
    });

    it("should have orientation preset with 3 channels", () => {
      const preset = PHONE_SENSOR_PRESETS.orientation;
      expect(preset.channels).toHaveLength(3);
      expect(preset.channels.every(c => c.source === "orientation")).toBe(true);
      expect(preset.defaultPeriodMs).toBe(50);
    });

    it("should have full_motion preset with 12 channels (no location)", () => {
      const preset = PHONE_SENSOR_PRESETS.full_motion;
      expect(preset.channels).toHaveLength(12);
      expect(preset.channels.every(c => c.source !== "location")).toBe(true);
    });

    it("should have location preset with 4 channels", () => {
      const preset = PHONE_SENSOR_PRESETS.location;
      expect(preset.channels).toHaveLength(4);
      expect(preset.channels.every(c => c.source === "location")).toBe(true);
      expect(preset.defaultPeriodMs).toBe(1000);
    });

    it("should have motion_location preset with 7 channels", () => {
      const preset = PHONE_SENSOR_PRESETS.motion_location;
      expect(preset.channels).toHaveLength(7);
    });

    it("each preset should have required fields", () => {
      for (const [key, preset] of Object.entries(PHONE_SENSOR_PRESETS)) {
        expect(preset.id).toBe(key);
        expect(typeof preset.name).toBe("string");
        expect(preset.name.length).toBeGreaterThan(0);
        expect(typeof preset.description).toBe("string");
        expect(Array.isArray(preset.channels)).toBe(true);
        expect(preset.channels.length).toBeGreaterThan(0);
        expect(typeof preset.defaultPeriodMs).toBe("number");
        expect(preset.defaultPeriodMs).toBeGreaterThan(0);
      }
    });

    it("each preset channel should reference a valid ALL_CHANNELS entry", () => {
      const allChannelIds = new Set(ALL_CHANNELS.map(c => c.id));
      for (const preset of Object.values(PHONE_SENSOR_PRESETS)) {
        for (const channel of preset.channels) {
          expect(allChannelIds).toContain(channel.id);
        }
      }
    });
  });

  describe("getChannelById", () => {
    it("should return the correct channel for a valid ID", () => {
      const channel = getChannelById("100");
      expect(channel).toBeDefined();
      expect(channel!.id).toBe("100");
      expect(channel!.name).toBe("Acceleration X");
      expect(channel!.units).toBe("m/s²");
      expect(channel!.source).toBe("motion");
    });

    it("should return undefined for an invalid ID", () => {
      const channel = getChannelById("999");
      expect(channel).toBeUndefined();
    });

    it("should return orientation channel by ID", () => {
      const channel = getChannelById("109");
      expect(channel).toBeDefined();
      expect(channel!.name).toBe("Compass Heading");
      expect(channel!.source).toBe("orientation");
    });

    it("should return location channel by ID", () => {
      const channel = getChannelById("112");
      expect(channel).toBeDefined();
      expect(channel!.name).toBe("Latitude");
      expect(channel!.source).toBe("location");
    });
  });

  describe("getRequiredSources", () => {
    it("should return motion source for accelerometer channels", () => {
      const channels = PHONE_SENSOR_PRESETS.accelerometer.channels;
      const sources = getRequiredSources(channels);
      expect(sources.size).toBe(1);
      expect(sources.has("motion")).toBe(true);
    });

    it("should return motion and orientation for full_motion preset", () => {
      const channels = PHONE_SENSOR_PRESETS.full_motion.channels;
      const sources = getRequiredSources(channels);
      expect(sources.size).toBe(2);
      expect(sources.has("motion")).toBe(true);
      expect(sources.has("orientation")).toBe(true);
    });

    it("should return location source for location preset", () => {
      const channels = PHONE_SENSOR_PRESETS.location.channels;
      const sources = getRequiredSources(channels);
      expect(sources.size).toBe(1);
      expect(sources.has("location")).toBe(true);
    });

    it("should return all three sources for motion_location preset", () => {
      const channels = PHONE_SENSOR_PRESETS.motion_location.channels;
      const sources = getRequiredSources(channels);
      expect(sources.size).toBe(2); // motion + location (no orientation)
      expect(sources.has("motion")).toBe(true);
      expect(sources.has("location")).toBe(true);
    });

    it("should return empty set for empty channels", () => {
      const sources = getRequiredSources([]);
      expect(sources.size).toBe(0);
    });
  });
});