const DEVICE_ID_KEY = "hub_device_id";

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceId(): string {
  return localStorage.getItem(DEVICE_ID_KEY) ?? "";
}
