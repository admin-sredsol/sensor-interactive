// src/models/__tests__/phone-sensor-smoothing.test.ts

import {
  MovingAverageFilter,
  LowPassFilter,
  SmoothingEngine,
  SmoothingConfig,
  SmoothingMode,
  DEFAULT_SMOOTHING_CONFIG,
} from "../phone-sensor-smoothing";

describe("MovingAverageFilter", () => {
  let filter: MovingAverageFilter;

  beforeEach(() => {
    filter = new MovingAverageFilter(3);
  });

  test("returns value directly when buffer has one element", () => {
    expect(filter.filter(10)).toBe(10);
  });

  test("computes average of all values when buffer is smaller than window", () => {
    filter.filter(10);
    const result = filter.filter(20);
    expect(result).toBeCloseTo(15);
  });

  test("computes moving average over window size", () => {
    filter.filter(10);  // buffer: [10]
    filter.filter(20);  // buffer: [10, 20]
    filter.filter(30);  // buffer: [10, 20, 30] → avg = 20
    const result = filter.filter(40); // buffer: [20, 30, 40] → avg = 30
    expect(result).toBeCloseTo(30);
  });

  test("slides window correctly", () => {
    filter.filter(10);  // [10]
    filter.filter(20);  // [10, 20]
    filter.filter(30);  // [10, 20, 30] → avg = 20
    filter.filter(40);  // [20, 30, 40] → avg = 30
    const result = filter.filter(50); // [30, 40, 50] → avg = 40
    expect(result).toBeCloseTo(40);
  });

  test("reset clears the buffer", () => {
    filter.filter(10);
    filter.filter(20);
    expect(filter.getBufferLength()).toBe(2);
    filter.reset();
    expect(filter.getBufferLength()).toBe(0);
    // After reset, first value is returned directly
    expect(filter.filter(100)).toBe(100);
  });

  test("default window size is 5", () => {
    const defaultFilter = new MovingAverageFilter();
    expect(defaultFilter.getWindowSize()).toBe(5);
  });

  test("setWindowSize clears buffer and updates size", () => {
    filter.filter(10);
    filter.filter(20);
    expect(filter.getBufferLength()).toBe(2);
    filter.setWindowSize(7);
    expect(filter.getWindowSize()).toBe(7);
    expect(filter.getBufferLength()).toBe(0);
  });

  test("handles single value correctly", () => {
    const singleFilter = new MovingAverageFilter(1);
    expect(singleFilter.filter(42)).toBe(42);
    expect(singleFilter.filter(100)).toBe(100);
  });

  test("handles negative values", () => {
    filter.filter(-10);
    filter.filter(-20);
    const result = filter.filter(-30);
    expect(result).toBeCloseTo(-20);
  });

  test("handles zero values", () => {
    filter.filter(0);
    filter.filter(0);
    filter.filter(0);
    expect(filter.filter(0)).toBe(0);
  });
});

describe("LowPassFilter", () => {
  let filter: LowPassFilter;

  beforeEach(() => {
    filter = new LowPassFilter(0.5);
  });

  test("returns first value directly (no previous output)", () => {
    expect(filter.filter(10)).toBe(10);
  });

  test("applies low-pass filter: output = alpha * input + (1 - alpha) * previousOutput", () => {
    filter.filter(10); // first value = 10
    // output = 0.5 * 20 + 0.5 * 10 = 15
    const result = filter.filter(20);
    expect(result).toBeCloseTo(15);
  });

  test("smooths noisy data toward a steady value", () => {
    const lpf = new LowPassFilter(0.2);
    let output = lpf.filter(100); // first = 100
    // Apply constant input of 100
    for (let i = 0; i < 20; i++) {
      output = lpf.filter(100);
    }
    // After many iterations, output should converge to 100
    expect(output).toBeCloseTo(100, 0);
  });

  test("reset clears previous output", () => {
    filter.filter(10);
    filter.filter(20);
    filter.reset();
    // After reset, first value is returned directly
    expect(filter.filter(50)).toBe(50);
  });

  test("alpha = 1 means no smoothing (pass-through)", () => {
    const passThrough = new LowPassFilter(1.0);
    passThrough.filter(10);
    expect(passThrough.filter(20)).toBe(20);
    expect(passThrough.filter(30)).toBe(30);
  });

  test("alpha = 0 means output never changes from first value", () => {
    const noChange = new LowPassFilter(0);
    noChange.filter(10);
    expect(noChange.filter(20)).toBeCloseTo(10);
    expect(noChange.filter(30)).toBeCloseTo(10);
  });

  test("getAlpha returns current alpha", () => {
    expect(filter.getAlpha()).toBe(0.5);
  });

  test("setAlpha clamps to [0, 1] and resets", () => {
    filter.filter(10);
    filter.setAlpha(0.3);
    expect(filter.getAlpha()).toBe(0.3);
    // After setAlpha, filter is reset
    expect(filter.filter(50)).toBe(50);
  });

  test("setAlpha clamps values above 1", () => {
    filter.setAlpha(5);
    expect(filter.getAlpha()).toBe(1);
  });

  test("setAlpha clamps values below 0", () => {
    filter.setAlpha(-1);
    expect(filter.getAlpha()).toBe(0);
  });

  test("handles negative values", () => {
    filter.filter(-10);
    const result = filter.filter(-20);
    expect(result).toBeCloseTo(-15);
  });
});

describe("SmoothingEngine", () => {
  test("mode 'none' passes data through unchanged", () => {
    const engine = new SmoothingEngine({ mode: "none" });
    const data = { "100": [[1, 10]], "101": [[1, 20]] };
    const result = engine.smoothData(data);
    expect(result).toEqual(data);
  });

  test("mode 'none' smooth method returns value unchanged", () => {
    const engine = new SmoothingEngine({ mode: "none" });
    expect(engine.smooth("100", 42)).toBe(42);
  });

  test("moving-average mode smooths data", () => {
    const engine = new SmoothingEngine({ mode: "moving-average", windowSize: 3 });
    const data1 = { "100": [[1, 10]] };
    const result1 = engine.smoothData(data1);
    expect(result1["100"][0][1]).toBeCloseTo(10);

    const data2 = { "100": [[2, 20]] };
    const result2 = engine.smoothData(data2);
    expect(result2["100"][0][1]).toBeCloseTo(15); // avg of 10 and 20
  });

  test("low-pass mode smooths data", () => {
    const engine = new SmoothingEngine({ mode: "low-pass", alpha: 0.5 });
    const data1 = { "100": [[1, 10]] };
    const result1 = engine.smoothData(data1);
    expect(result1["100"][0][1]).toBeCloseTo(10);

    const data2 = { "100": [[2, 20]] };
    const result2 = engine.smoothData(data2);
    expect(result2["100"][0][1]).toBeCloseTo(15); // 0.5 * 20 + 0.5 * 10
  });

  test("each channel is smoothed independently", () => {
    const engine = new SmoothingEngine({ mode: "low-pass", alpha: 0.5 });
    engine.smoothData({ "100": [[1, 10]] });
    engine.smoothData({ "101": [[1, 30]] }); // different channel, starts fresh

    const result = engine.smoothData({ "100": [[2, 20]], "101": [[2, 40]] });
    // Channel 100: 0.5 * 20 + 0.5 * 10 = 15
    expect(result["100"][0][1]).toBeCloseTo(15);
    // Channel 101: 0.5 * 40 + 0.5 * 30 = 35
    expect(result["101"][0][1]).toBeCloseTo(35);
  });

  test("reset clears all filter state", () => {
    const engine = new SmoothingEngine({ mode: "moving-average", windowSize: 3 });
    engine.smoothData({ "100": [[1, 10]] });
    engine.smoothData({ "100": [[2, 20]] });
    engine.reset();
    // After reset, first value is returned directly
    const result = engine.smoothData({ "100": [[3, 50]] });
    expect(result["100"][0][1]).toBeCloseTo(50);
  });

  test("getConfig returns current config", () => {
    const config: SmoothingConfig = { mode: "low-pass", alpha: 0.3 };
    const engine = new SmoothingEngine(config);
    const returned = engine.getConfig();
    expect(returned.mode).toBe("low-pass");
    expect(returned.alpha).toBe(0.3);
  });

  test("setConfig updates config and resets state", () => {
    const engine = new SmoothingEngine({ mode: "moving-average", windowSize: 3 });
    engine.smoothData({ "100": [[1, 10]] });
    engine.smoothData({ "100": [[2, 20]] });

    engine.setConfig({ mode: "low-pass", alpha: 0.5 });
    expect(engine.getMode()).toBe("low-pass");

    // After setConfig, filter state is reset
    const result = engine.smoothData({ "100": [[3, 50]] });
    expect(result["100"][0][1]).toBeCloseTo(50); // first value after reset
  });

  test("setConfig with partial update preserves other fields", () => {
    const engine = new SmoothingEngine({ mode: "moving-average", windowSize: 5 });
    engine.setConfig({ windowSize: 10 });
    const config = engine.getConfig();
    expect(config.mode).toBe("moving-average");
    expect(config.windowSize).toBe(10);
  });

  test("getMode returns current mode", () => {
    const engine = new SmoothingEngine({ mode: "low-pass" });
    expect(engine.getMode()).toBe("low-pass");
  });

  test("smoothData with empty data returns empty object", () => {
    const engine = new SmoothingEngine({ mode: "moving-average" });
    const result = engine.smoothData({});
    expect(result).toEqual({});
  });

  test("smoothData with empty points array preserves channel with empty array", () => {
    const engine = new SmoothingEngine({ mode: "moving-average" });
    const result = engine.smoothData({ "100": [] });
    expect(result["100"]).toEqual([]);
  });

  test("handles multiple points in a single data object", () => {
    const engine = new SmoothingEngine({ mode: "moving-average", windowSize: 3 });
    // First call seeds the filter
    engine.smoothData({ "100": [[1, 10]] });
    // Second call with multiple points
    const result = engine.smoothData({ "100": [[2, 20], [3, 30]] });
    // Both points should be smoothed
    expect(result["100"].length).toBe(2);
    expect(typeof result["100"][0][1]).toBe("number");
    expect(typeof result["100"][1][1]).toBe("number");
  });
});

describe("DEFAULT_SMOOTHING_CONFIG", () => {
  test("defaults to no smoothing", () => {
    expect(DEFAULT_SMOOTHING_CONFIG.mode).toBe("none");
  });

  test("has default windowSize", () => {
    expect(DEFAULT_SMOOTHING_CONFIG.windowSize).toBe(5);
  });

  test("has default alpha", () => {
    expect(DEFAULT_SMOOTHING_CONFIG.alpha).toBe(0.2);
  });
});

describe("SmoothingMode type", () => {
  test("accepts valid modes", () => {
    const modes: SmoothingMode[] = ["none", "moving-average", "low-pass"];
    modes.forEach(mode => {
      const config: SmoothingConfig = { mode };
      expect(config.mode).toBe(mode);
    });
  });
});