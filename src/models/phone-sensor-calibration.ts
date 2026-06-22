// src/models/phone-sensor-calibration.ts
//
// Calibration utilities for PhoneSensorManager.
// Provides zero-offset (tare) and scale factor calibration for sensor channels.

/**
 * Calibration settings for a single channel.
 * The calibrated value is computed as: calibrated = (raw - offset) * scaleFactor
 */
export interface ChannelCalibration {
  /** Zero offset — subtracted from raw value. Default: 0 */
  offset: number;
  /** Scale factor — multiplied after offset subtraction. Default: 1 */
  scaleFactor: number;
}

/**
 * Calibration profile — maps channel IDs to their calibration settings.
 */
export type CalibrationProfile = Record<string, ChannelCalibration>;

/**
 * Default calibration (no offset, unit scale).
 */
export const DEFAULT_CALIBRATION: ChannelCalibration = {
  offset: 0,
  scaleFactor: 1,
};

/**
 * PhoneSensorCalibration manages per-channel calibration settings.
 * It supports:
 * - Zero offset (tare): subtract a reference value from all readings
 * - Scale factor: multiply readings by a constant
 * - Per-channel calibration: different settings for each sensor channel
 * - Snapshot/restore: save and restore calibration state
 */
export class PhoneSensorCalibration {
  private calibrations: CalibrationProfile = {};

  /**
   * Get the calibration for a specific channel.
   * Returns default calibration if none is set.
   */
  getCalibration(channelId: string): ChannelCalibration {
    return this.calibrations[channelId] ?? { ...DEFAULT_CALIBRATION };
  }

  /**
   * Set the calibration for a specific channel.
   */
  setCalibration(channelId: string, calibration: Partial<ChannelCalibration>): void {
    const existing = this.getCalibration(channelId);
    this.calibrations[channelId] = {
      offset: calibration.offset ?? existing.offset,
      scaleFactor: calibration.scaleFactor ?? existing.scaleFactor,
    };
  }

  /**
   * Apply calibration to a raw value for a specific channel.
   * Formula: calibrated = (raw - offset) * scaleFactor
   */
  calibrateValue(channelId: string, rawValue: number): number {
    const cal = this.getCalibration(channelId);
    return (rawValue - cal.offset) * cal.scaleFactor;
  }

  /**
   * Apply calibration to a NewSensorData object.
   * Each channel is calibrated independently.
   */
  calibrateData(data: Record<string, number[][]>): Record<string, number[][]> {
    // Check if any calibration is non-default
    const hasCalibration = Object.keys(this.calibrations).some(
      id => this.calibrations[id].offset !== 0 || this.calibrations[id].scaleFactor !== 1
    );
    if (!hasCalibration) {
      return data;
    }

    const calibrated: Record<string, number[][]> = {};
    for (const [channelId, points] of Object.entries(data)) {
      const cal = this.getCalibration(channelId);
      if (cal.offset === 0 && cal.scaleFactor === 1) {
        // No calibration needed for this channel
        calibrated[channelId] = points;
      } else {
        calibrated[channelId] = points.map(([time, value]) => [
          time,
          (value - cal.offset) * cal.scaleFactor,
        ]);
      }
    }
    return calibrated;
  }

  /**
   * Tare (zero) all active channels.
   * Sets the offset for each channel to the given reference values.
   * This is typically called when the user presses a "Zero" button
   * while the sensor is at rest.
   */
  tare(referenceValues: Record<string, number>): void {
    for (const [channelId, value] of Object.entries(referenceValues)) {
      this.setCalibration(channelId, { offset: value });
    }
  }

  /**
   * Reset all calibrations to default (no offset, unit scale).
   */
  reset(): void {
    this.calibrations = {};
  }

  /**
   * Reset calibration for a specific channel.
   */
  resetChannel(channelId: string): void {
    delete this.calibrations[channelId];
  }

  /**
   * Get a snapshot of all calibration settings.
   * Useful for saving/restoring calibration state.
   * Returns a deep copy — modifications to the snapshot do not affect the original.
   */
  getSnapshot(): CalibrationProfile {
    const snapshot: CalibrationProfile = {};
    for (const [id, cal] of Object.entries(this.calibrations)) {
      snapshot[id] = { ...cal };
    }
    return snapshot;
  }

  /**
   * Restore calibration from a snapshot.
   */
  restoreSnapshot(snapshot: CalibrationProfile): void {
    this.calibrations = { ...snapshot };
  }

  /**
   * Check if any channel has non-default calibration.
   */
  hasCalibration(): boolean {
    return Object.keys(this.calibrations).some(
      id => this.calibrations[id].offset !== 0 || this.calibrations[id].scaleFactor !== 1
    );
  }

  /**
   * Get all channel IDs that have calibration settings.
   */
  getCalibratedChannelIds(): string[] {
    return Object.keys(this.calibrations);
  }
}