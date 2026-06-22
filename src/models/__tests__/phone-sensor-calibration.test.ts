// src/models/__tests__/phone-sensor-calibration.test.ts

import {
  PhoneSensorCalibration,
  DEFAULT_CALIBRATION,
} from "../phone-sensor-calibration";

describe("DEFAULT_CALIBRATION", () => {
  test("has zero offset and unit scale factor", () => {
    expect(DEFAULT_CALIBRATION.offset).toBe(0);
    expect(DEFAULT_CALIBRATION.scaleFactor).toBe(1);
  });
});

describe("PhoneSensorCalibration", () => {
  let calibration: PhoneSensorCalibration;

  beforeEach(() => {
    calibration = new PhoneSensorCalibration();
  });

  // ─── Basic get/set ───

  test("returns default calibration for unset channel", () => {
    const cal = calibration.getCalibration("100");
    expect(cal.offset).toBe(0);
    expect(cal.scaleFactor).toBe(1);
  });

  test("sets and gets calibration for a channel", () => {
    calibration.setCalibration("100", { offset: 9.8, scaleFactor: 1 });
    const cal = calibration.getCalibration("100");
    expect(cal.offset).toBe(9.8);
    expect(cal.scaleFactor).toBe(1);
  });

  test("sets partial calibration (offset only)", () => {
    calibration.setCalibration("100", { offset: 5 });
    const cal = calibration.getCalibration("100");
    expect(cal.offset).toBe(5);
    expect(cal.scaleFactor).toBe(1); // default preserved
  });

  test("sets partial calibration (scaleFactor only)", () => {
    calibration.setCalibration("100", { scaleFactor: 2.5 });
    const cal = calibration.getCalibration("100");
    expect(cal.offset).toBe(0); // default preserved
    expect(cal.scaleFactor).toBe(2.5);
  });

  test("different channels have independent calibrations", () => {
    calibration.setCalibration("100", { offset: 1 });
    calibration.setCalibration("101", { offset: 2 });
    expect(calibration.getCalibration("100").offset).toBe(1);
    expect(calibration.getCalibration("101").offset).toBe(2);
  });

  // ─── calibrateValue ───

  test("calibrateValue with default calibration returns raw value", () => {
    expect(calibration.calibrateValue("100", 42)).toBe(42);
  });

  test("calibrateValue applies offset subtraction", () => {
    calibration.setCalibration("100", { offset: 9.8 });
    expect(calibration.calibrateValue("100", 10.0)).toBeCloseTo(0.2);
  });

  test("calibrateValue applies scale factor", () => {
    calibration.setCalibration("100", { scaleFactor: 2 });
    expect(calibration.calibrateValue("100", 5)).toBe(10);
  });

  test("calibrateValue applies offset then scale factor", () => {
    // calibrated = (raw - offset) * scaleFactor
    calibration.setCalibration("100", { offset: 10, scaleFactor: 2 });
    // (15 - 10) * 2 = 10
    expect(calibration.calibrateValue("100", 15)).toBe(10);
  });

  test("calibrateValue with negative offset", () => {
    calibration.setCalibration("100", { offset: -5 });
    // (3 - (-5)) * 1 = 8
    expect(calibration.calibrateValue("100", 3)).toBe(8);
  });

  test("calibrateValue with fractional scale factor", () => {
    calibration.setCalibration("100", { scaleFactor: 0.5 });
    // (10 - 0) * 0.5 = 5
    expect(calibration.calibrateValue("100", 10)).toBe(5);
  });

  // ─── calibrateData ───

  test("calibrateData with no calibration returns data unchanged", () => {
    const data = { "100": [[1, 10]], "101": [[1, 20]] };
    const result = calibration.calibrateData(data);
    expect(result).toEqual(data);
  });

  test("calibrateData applies calibration per channel", () => {
    calibration.setCalibration("100", { offset: 5 });
    const data = { "100": [[1, 10]], "101": [[1, 20]] };
    const result = calibration.calibrateData(data);
    // Channel 100: (10 - 5) * 1 = 5
    expect(result["100"][0][1]).toBeCloseTo(5);
    // Channel 101: no calibration, unchanged
    expect(result["101"][0][1]).toBe(20);
  });

  test("calibrateData preserves timestamps", () => {
    calibration.setCalibration("100", { offset: 1 });
    const data = { "100": [[2.5, 10]] };
    const result = calibration.calibrateData(data);
    expect(result["100"][0][0]).toBe(2.5);
    expect(result["100"][0][1]).toBeCloseTo(9);
  });

  test("calibrateData handles multiple points per channel", () => {
    calibration.setCalibration("100", { offset: 1 });
    const data = { "100": [[1, 10], [2, 11], [3, 12]] };
    const result = calibration.calibrateData(data);
    expect(result["100"][0][1]).toBeCloseTo(9);
    expect(result["100"][1][1]).toBeCloseTo(10);
    expect(result["100"][2][1]).toBeCloseTo(11);
  });

  test("calibrateData with scale factor", () => {
    calibration.setCalibration("100", { scaleFactor: 2 });
    const data = { "100": [[1, 5]] };
    const result = calibration.calibrateData(data);
    expect(result["100"][0][1]).toBeCloseTo(10);
  });

  test("calibrateData with offset and scale factor", () => {
    calibration.setCalibration("100", { offset: 2, scaleFactor: 3 });
    const data = { "100": [[1, 10]] };
    // (10 - 2) * 3 = 24
    const result = calibration.calibrateData(data);
    expect(result["100"][0][1]).toBeCloseTo(24);
  });

  // ─── tare ───

  test("tare sets offset for all reference values", () => {
    calibration.tare({ "100": 9.8, "101": 0.5, "102": -0.1 });
    expect(calibration.getCalibration("100").offset).toBe(9.8);
    expect(calibration.getCalibration("101").offset).toBe(0.5);
    expect(calibration.getCalibration("102").offset).toBe(-0.1);
  });

  test("tare preserves existing scale factors", () => {
    calibration.setCalibration("100", { offset: 0, scaleFactor: 2 });
    calibration.tare({ "100": 5 });
    expect(calibration.getCalibration("100").offset).toBe(5);
    expect(calibration.getCalibration("100").scaleFactor).toBe(2);
  });

  test("tare with empty object does nothing", () => {
    calibration.tare({});
    expect(calibration.hasCalibration()).toBe(false);
  });

  // ─── reset ───

  test("reset clears all calibrations", () => {
    calibration.setCalibration("100", { offset: 5 });
    calibration.setCalibration("101", { offset: 10 });
    expect(calibration.hasCalibration()).toBe(true);
    calibration.reset();
    expect(calibration.hasCalibration()).toBe(false);
    expect(calibration.getCalibration("100").offset).toBe(0);
  });

  test("resetChannel clears specific channel", () => {
    calibration.setCalibration("100", { offset: 5 });
    calibration.setCalibration("101", { offset: 10 });
    calibration.resetChannel("100");
    expect(calibration.getCalibration("100").offset).toBe(0);
    expect(calibration.getCalibration("101").offset).toBe(10);
  });

  // ─── snapshot/restore ───

  test("getSnapshot returns current calibration state", () => {
    calibration.setCalibration("100", { offset: 5, scaleFactor: 2 });
    calibration.setCalibration("101", { offset: 10 });
    const snapshot = calibration.getSnapshot();
    expect(snapshot["100"].offset).toBe(5);
    expect(snapshot["100"].scaleFactor).toBe(2);
    expect(snapshot["101"].offset).toBe(10);
  });

  test("restoreSnapshot restores calibration state", () => {
    calibration.setCalibration("100", { offset: 5 });
    const snapshot = calibration.getSnapshot();
    calibration.reset();
    expect(calibration.hasCalibration()).toBe(false);
    calibration.restoreSnapshot(snapshot);
    expect(calibration.getCalibration("100").offset).toBe(5);
  });

  test("snapshot is a deep copy", () => {
    calibration.setCalibration("100", { offset: 5 });
    const snapshot = calibration.getSnapshot();
    snapshot["100"].offset = 99;
    // Original should not be affected
    expect(calibration.getCalibration("100").offset).toBe(5);
  });

  // ─── hasCalibration ───

  test("hasCalibration returns false when no calibration is set", () => {
    expect(calibration.hasCalibration()).toBe(false);
  });

  test("hasCalibration returns true when offset is set", () => {
    calibration.setCalibration("100", { offset: 5 });
    expect(calibration.hasCalibration()).toBe(true);
  });

  test("hasCalibration returns true when scaleFactor is set", () => {
    calibration.setCalibration("100", { scaleFactor: 2 });
    expect(calibration.hasCalibration()).toBe(true);
  });

  test("hasCalibration returns false when calibration is default", () => {
    calibration.setCalibration("100", { offset: 0, scaleFactor: 1 });
    expect(calibration.hasCalibration()).toBe(false);
  });

  // ─── getCalibratedChannelIds ───

  test("getCalibratedChannelIds returns empty array when no calibration", () => {
    expect(calibration.getCalibratedChannelIds()).toEqual([]);
  });

  test("getCalibratedChannelIds returns channel IDs with calibration", () => {
    calibration.setCalibration("100", { offset: 5 });
    calibration.setCalibration("101", { offset: 10 });
    const ids = calibration.getCalibratedChannelIds();
    expect(ids).toContain("100");
    expect(ids).toContain("101");
    expect(ids).toHaveLength(2);
  });
});