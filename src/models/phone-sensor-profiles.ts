// src/models/phone-sensor-profiles.ts
//
// Channel definitions and presets for PhoneSensorManager.
// Provides the mapping between browser sensor APIs (DeviceMotion, DeviceOrientation,
// Geolocation) and the SensorConfig column format used by sensor-interactive.
//
// Channel IDs use numeric strings (e.g., "100", "101") to match the SensorConfig
// convention used by other managers in this project. colIDs in sets are numbers.

export type PhoneSensorType = "motion" | "orientation" | "location";

export interface PhoneSensorChannel {
  /** Numeric string ID matching SensorConfig convention (e.g., "100") */
  id: string;
  /** Human-readable channel name */
  name: string;
  /** Unit string (e.g., "m/s²", "°") */
  units: string;
  /** Display order position */
  position: number;
  /** Which browser API provides this channel */
  source: PhoneSensorType;
  /** Dot-path into the event object (e.g., "accelerationIncludingGravity.x") */
  property: string;
}

export interface PhoneSensorPreset {
  id: string;
  name: string;
  description: string;
  channels: PhoneSensorChannel[];
  defaultPeriodMs: number;
}

// ─── All available channels ───
// IDs start at 100 to match the convention used by other managers.

export const ALL_CHANNELS: PhoneSensorChannel[] = [
  // Motion channels (devicemotion event)
  { id: "100", name: "Acceleration X",       units: "m/s²", position: 1,  source: "motion",      property: "accelerationIncludingGravity.x" },
  { id: "101", name: "Acceleration Y",       units: "m/s²", position: 2,  source: "motion",      property: "accelerationIncludingGravity.y" },
  { id: "102", name: "Acceleration Z",       units: "m/s²", position: 3,  source: "motion",      property: "accelerationIncludingGravity.z" },
  { id: "103", name: "Linear Accel X",       units: "m/s²", position: 4,  source: "motion",      property: "acceleration.x" },
  { id: "104", name: "Linear Accel Y",       units: "m/s²", position: 5,  source: "motion",      property: "acceleration.y" },
  { id: "105", name: "Linear Accel Z",       units: "m/s²", position: 6,  source: "motion",      property: "acceleration.z" },
  { id: "106", name: "Rotation Rate α",      units: "°/s",  position: 7,  source: "motion",      property: "rotationRate.alpha" },
  { id: "107", name: "Rotation Rate β",      units: "°/s",  position: 8,  source: "motion",      property: "rotationRate.beta" },
  { id: "108", name: "Rotation Rate γ",      units: "°/s",  position: 9,  source: "motion",      property: "rotationRate.gamma" },
  // Orientation channels (deviceorientation event)
  { id: "109", name: "Compass Heading",      units: "°",    position: 10, source: "orientation", property: "alpha" },
  { id: "110", name: "Tilt Front/Back",      units: "°",    position: 11, source: "orientation", property: "beta" },
  { id: "111", name: "Tilt Left/Right",      units: "°",    position: 12, source: "orientation", property: "gamma" },
  // Location channels (geolocation API)
  { id: "112", name: "Latitude",             units: "°",    position: 13, source: "location",    property: "latitude" },
  { id: "113", name: "Longitude",            units: "°",    position: 14, source: "location",    property: "longitude" },
  { id: "114", name: "Altitude",             units: "m",    position: 15, source: "location",    property: "altitude" },
  { id: "115", name: "Speed",                units: "m/s",  position: 16, source: "location",    property: "speed" },
];

// ─── Presets for common experiment types ───

export const PHONE_SENSOR_PRESETS: Record<string, PhoneSensorPreset> = {
  accelerometer: {
    id: "accelerometer",
    name: "Accelerometer",
    description: "3-axis acceleration including gravity",
    channels: ALL_CHANNELS.filter(c => ["100", "101", "102"].includes(c.id)),
    defaultPeriodMs: 20,  // 50 Hz
  },
  accelerometer_gyro: {
    id: "accelerometer_gyro",
    name: "Accelerometer + Gyroscope",
    description: "6-axis motion: acceleration and rotation rate",
    channels: ALL_CHANNELS.filter(c =>
      ["100", "101", "102", "106", "107", "108"].includes(c.id)
    ),
    defaultPeriodMs: 20,
  },
  orientation: {
    id: "orientation",
    name: "Orientation (Compass + Tilt)",
    description: "Device heading and tilt angles",
    channels: ALL_CHANNELS.filter(c => ["109", "110", "111"].includes(c.id)),
    defaultPeriodMs: 50,  // 20 Hz
  },
  full_motion: {
    id: "full_motion",
    name: "Full Motion",
    description: "All motion and orientation channels",
    channels: ALL_CHANNELS.filter(c => c.source !== "location"),
    defaultPeriodMs: 20,
  },
  location: {
    id: "location",
    name: "GPS Location",
    description: "Latitude, longitude, altitude, speed",
    channels: ALL_CHANNELS.filter(c => c.source === "location"),
    defaultPeriodMs: 1000,  // GPS is slow (1 Hz typical)
  },
  motion_location: {
    id: "motion_location",
    name: "Motion + Location",
    description: "Accelerometer and GPS combined",
    channels: ALL_CHANNELS.filter(c =>
      ["100", "101", "102", "112", "113", "114", "115"].includes(c.id)
    ),
    defaultPeriodMs: 100,
  },
};

/**
 * Look up a channel by its numeric string ID.
 */
export function getChannelById(id: string): PhoneSensorChannel | undefined {
  return ALL_CHANNELS.find(c => c.id === id);
}

/**
 * Get the set of unique sensor sources required by a list of channels.
 */
export function getRequiredSources(channels: PhoneSensorChannel[]): Set<PhoneSensorType> {
  return new Set(channels.map(c => c.source));
}