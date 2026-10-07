// Task 436 — client-safe constants for the personal Drive (no server imports here: the UI imports
// this file too). Server-only storage helpers live in ./storage.ts.

export const DRIVE_BUCKET = "user-drive";
export const DRIVE_MAX_FILE_SIZE = 200 * 1024 * 1024; // matches the bucket's file_size_limit
export const DRIVE_MAX_SIZE_LABEL = "200 MB";

// Every staff role gets a drive; `client` is blocked at the page, the API and RLS.
export const DRIVE_STAFF_ROLES = ["admin", "super_admin", "pm", "developer", "hr", "marketing"] as const;
export type DriveStaffRole = (typeof DRIVE_STAFF_ROLES)[number];
export const DRIVE_SHARE_ROLES = DRIVE_STAFF_ROLES;

export function isDriveStaffRole(role: string | null | undefined): role is DriveStaffRole {
  return !!role && (DRIVE_STAFF_ROLES as readonly string[]).includes(role);
}

// Meeting recordings (D6). Drive-only: the shared customer-asset allowlist is unchanged. Both
// `.m4a` variants are listed because browsers disagree on `file.type`. The bucket's
// allowed_mime_types (migration 166) must stay in lockstep with this list.
export const DRIVE_MEDIA_MIME_TYPES = [
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg",
  "video/mp4", "video/quicktime", "video/webm",
];
export const DRIVE_MEDIA_LABEL = "MP3, M4A, WAV, MP4, MOV, WEBM";

// `video/mp2t` is a `.ts` source file in this codebase's allowlist, not a recording.
export const isDriveMedia = (mime: string) =>
  mime.startsWith("audio/") || (mime.startsWith("video/") && mime !== "video/mp2t");
