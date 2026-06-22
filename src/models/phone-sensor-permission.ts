// src/models/phone-sensor-permission.ts
//
// Permission utilities for PhoneSensorManager.
// Handles iOS 13+ explicit permission requests for DeviceMotion/DeviceOrientation
// and the standard Geolocation permission prompt.

import { PhoneSensorType } from "./phone-sensor-profiles";

export type PermissionStatus = "granted" | "denied" | "unavailable" | "pending";

export interface PhoneSensorPermissions {
  motion: PermissionStatus;
  orientation: PermissionStatus;
  location: PermissionStatus;
}

/**
 * Check which sensor APIs are available in the current browser.
 * Note: API existence doesn't guarantee data — desktop browsers define
 * the APIs but never fire events.
 */
export function detectAvailableSensors(): PhoneSensorType[] {
  const sensors: PhoneSensorType[] = [];
  if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
    sensors.push("motion");
  }
  if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
    sensors.push("orientation");
  }
  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    sensors.push("location");
  }
  return sensors;
}

/**
 * Check if the current browser requires explicit permission for motion events.
 * iOS 13+ requires a user gesture to call DeviceMotionEvent.requestPermission().
 */
export function requiresMotionPermission(): boolean {
  return typeof window !== "undefined" &&
    typeof DeviceMotionEvent !== "undefined" &&
    typeof (DeviceMotionEvent as any).requestPermission === "function";
}

/**
 * Check if the current browser requires explicit permission for orientation events.
 * iOS 13+ requires a user gesture to call DeviceOrientationEvent.requestPermission().
 */
export function requiresOrientationPermission(): boolean {
  return typeof window !== "undefined" &&
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof (DeviceOrientationEvent as any).requestPermission === "function";
}

/**
 * Request permission for device motion events.
 * MUST be called from a user gesture (click, touch) on iOS.
 */
export async function requestMotionPermission(): Promise<PermissionStatus> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
    return "unavailable";
  }
  if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
    try {
      const permission = await (DeviceMotionEvent as any).requestPermission();
      return permission === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  // No permission required (Android, desktop)
  return "granted";
}

/**
 * Request permission for device orientation events.
 * MUST be called from a user gesture (click, touch) on iOS.
 */
export async function requestOrientationPermission(): Promise<PermissionStatus> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return "unavailable";
  }
  if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
    try {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      return permission === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

/**
 * Request permission for geolocation.
 * Browser will show a prompt automatically on first use.
 */
export function requestLocationPermission(): Promise<PermissionStatus> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (error) => {
        // PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3
        if (error.code === 1) {
          resolve("denied");
        } else {
          resolve("unavailable");
        }
      },
      { timeout: 10000 }
    );
  });
}

/**
 * Request all permissions needed for the given sensor types.
 * Returns the status of each permission.
 */
export async function requestAllPermissions(
  sensorTypes: PhoneSensorType[]
): Promise<PhoneSensorPermissions> {
  const result: PhoneSensorPermissions = {
    motion: "unavailable",
    orientation: "unavailable",
    location: "unavailable",
  };

  if (sensorTypes.includes("motion")) {
    result.motion = await requestMotionPermission();
  }
  if (sensorTypes.includes("orientation")) {
    result.orientation = await requestOrientationPermission();
  }
  if (sensorTypes.includes("location")) {
    result.location = await requestLocationPermission();
  }

  return result;
}

/**
 * Check if we're running on a mobile device.
 * Used to show appropriate UI messages (desktop browsers have APIs but no hardware).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}