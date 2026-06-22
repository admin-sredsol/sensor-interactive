// src/models/phone-sensor-smoothing.ts
//
// Data smoothing/filtering utilities for PhoneSensorManager.
// Provides moving average and low-pass filter implementations to reduce
// noise in phone sensor data (accelerometer, gyroscope, etc.).

/**
 * Smoothing mode for phone sensor data.
 * - "none": No smoothing, raw data is passed through
 * - "moving-average": Simple moving average over a configurable window size
 * - "low-pass": Exponential low-pass filter with configurable alpha (0-1)
 */
export type SmoothingMode = "none" | "moving-average" | "low-pass";

/**
 * Configuration for data smoothing.
 */
export interface SmoothingConfig {
  /** The smoothing algorithm to apply. Default: "none" */
  mode: SmoothingMode;
  /** Window size for moving average (number of samples). Default: 5 */
  windowSize?: number;
  /** Alpha for low-pass filter (0 = no change, 1 = no smoothing). Default: 0.2 */
  alpha?: number;
}

/** Default smoothing config (no smoothing) */
export const DEFAULT_SMOOTHING_CONFIG: SmoothingConfig = {
  mode: "none",
  windowSize: 5,
  alpha: 0.2,
};

/**
 * MovingAverageFilter maintains a sliding window of recent values
 * and returns the arithmetic mean of the window.
 */
export class MovingAverageFilter {
  private buffer: number[] = [];
  private windowSize: number;

  constructor(windowSize: number = 5) {
    this.windowSize = windowSize;
  }

  /**
   * Add a value and get the smoothed result.
   * Returns the moving average of the last `windowSize` values.
   */
  filter(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }
    return this.buffer.reduce((sum, v) => sum + v, 0) / this.buffer.length;
  }

  /** Reset the filter state. */
  reset(): void {
    this.buffer = [];
  }

  /** Get the current window size. */
  getWindowSize(): number {
    return this.windowSize;
  }

  /** Update the window size. Clears the buffer. */
  setWindowSize(size: number): void {
    this.windowSize = size;
    this.buffer = [];
  }

  /** Get the current buffer length. */
  getBufferLength(): number {
    return this.buffer.length;
  }
}

/**
 * LowPassFilter implements a simple exponential low-pass filter.
 * Output = alpha * input + (1 - alpha) * previousOutput
 * A smaller alpha means more smoothing (slower response).
 */
export class LowPassFilter {
  private previousOutput: number | null = null;
  private alpha: number;

  constructor(alpha: number = 0.2) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  /**
   * Apply the low-pass filter to a value.
   * For the first value, returns the value directly.
   */
  filter(value: number): number {
    if (this.previousOutput === null) {
      this.previousOutput = value;
      return value;
    }
    this.previousOutput = this.alpha * value + (1 - this.alpha) * this.previousOutput;
    return this.previousOutput;
  }

  /** Reset the filter state. */
  reset(): void {
    this.previousOutput = null;
  }

  /** Get the current alpha value. */
  getAlpha(): number {
    return this.alpha;
  }

  /** Update the alpha value. Resets the filter. */
  setAlpha(alpha: number): void {
    this.alpha = Math.max(0, Math.min(1, alpha));
    this.reset();
  }
}

/**
 * SmoothingEngine applies smoothing to multiple channels independently.
 * Each channel gets its own filter instance so they don't interfere.
 */
export class SmoothingEngine {
  private config: SmoothingConfig;
  private movingAverageFilters: Map<string, MovingAverageFilter> = new Map();
  private lowPassFilters: Map<string, LowPassFilter> = new Map();

  constructor(config: SmoothingConfig = DEFAULT_SMOOTHING_CONFIG) {
    this.config = { ...DEFAULT_SMOOTHING_CONFIG, ...config };
  }

  /**
   * Apply smoothing to a single channel value.
   * Returns the smoothed value, or the original value if mode is "none".
   */
  smooth(channelId: string, value: number): number {
    switch (this.config.mode) {
      case "moving-average": {
        let filter = this.movingAverageFilters.get(channelId);
        if (!filter) {
          filter = new MovingAverageFilter(this.config.windowSize ?? 5);
          this.movingAverageFilters.set(channelId, filter);
        }
        return filter.filter(value);
      }
      case "low-pass": {
        let filter = this.lowPassFilters.get(channelId);
        if (!filter) {
          filter = new LowPassFilter(this.config.alpha ?? 0.2);
          this.lowPassFilters.set(channelId, filter);
        }
        return filter.filter(value);
      }
      case "none":
      default:
        return value;
    }
  }

  /**
   * Apply smoothing to a NewSensorData object.
   * Each channel is smoothed independently.
   */
  smoothData(data: Record<string, number[][]>): Record<string, number[][]> {
    if (this.config.mode === "none") {
      return data;
    }

    const smoothed: Record<string, number[][]> = {};
    for (const [channelId, points] of Object.entries(data)) {
      if (points.length === 0) {
        smoothed[channelId] = [];
        continue;
      }
      // Each point is [time, value] — smooth the value, keep the time
      smoothed[channelId] = points.map(([time, value]) => [
        time,
        this.smooth(channelId, value),
      ]);
    }
    return smoothed;
  }

  /** Reset all filter state. */
  reset(): void {
    this.movingAverageFilters.clear();
    this.lowPassFilters.clear();
  }

  /** Get the current smoothing config. */
  getConfig(): SmoothingConfig {
    return { ...this.config };
  }

  /** Update the smoothing config. Resets all filter state. */
  setConfig(config: Partial<SmoothingConfig>): void {
    this.config = { ...this.config, ...config };
    this.reset();
  }

  /** Get the current smoothing mode. */
  getMode(): SmoothingMode {
    return this.config.mode;
  }
}