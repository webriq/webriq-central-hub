import { ALLOWED_UPLOAD_TYPES, ALLOWED_TYPES_LABEL } from "./_reuse";
import { DRIVE_MEDIA_LABEL, DRIVE_MEDIA_MIME_TYPES } from "@/lib/drive/constants";

// Client-side upload gate for the Drive: Project Files' allowlist plus meeting recordings (D6).
// Must stay in lockstep with DRIVE_ALLOWED_MIME_TYPES (server) and the bucket's allowed_mime_types.
export const DRIVE_UPLOAD_TYPES = [...ALLOWED_UPLOAD_TYPES, ...DRIVE_MEDIA_MIME_TYPES];
export const DRIVE_TYPES_LABEL = `${ALLOWED_TYPES_LABEL}, ${DRIVE_MEDIA_LABEL}`;

// The shared upload queue keys uploads by a string folder id; the drive root is a sentinel.
export const ROOT_KEY = "__root__";
export const MAX_TREE_FILES = 200;
