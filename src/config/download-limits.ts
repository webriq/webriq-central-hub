// Task 419 — per-zip ceilings for Files tab bulk download. The browser builds the zip in memory
// (client-zip → Blob), so these bound memory use, not server cost (the server only signs URLs).
export const MAX_ZIP_FILES = 500;
export const MAX_ZIP_BYTES = 750 * 1024 * 1024;
export const MAX_ZIP_LABEL = "750 MB";
