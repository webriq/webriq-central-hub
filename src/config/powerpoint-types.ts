// Task 418 — presentation file types, defined once and spread into each upload surface's own
// allowlist (attachment-types.ts, customer-asset-storage.ts, _file-upload-constants.ts, the
// onboarding upload route/component, comment-attachment lists, StackShift order uploads).
// The surfaces' lists stay independent (tasks 273/372/377); only these entries are shared.
// Data only, no logic. Wiki uploads deliberately do not use this module.

const PPT_MIME = "application/vnd.ms-powerpoint";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PPSX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.slideshow";
const ODP_MIME = "application/vnd.oasis.opendocument.presentation";

export const POWERPOINT_MIME_TYPES = [PPT_MIME, PPTX_MIME, PPSX_MIME, ODP_MIME];

// MIME -> label, for surfaces that build their "allowed types" copy from MIME strings.
export const POWERPOINT_MIME_LABELS: Record<string, string> = {
  [PPT_MIME]: "PPT",
  [PPTX_MIME]: "PPTX",
  [PPSX_MIME]: "PPSX",
  [ODP_MIME]: "ODP",
};

// Office Online can't render OpenDocument, so .odp is accepted and gets a tile but no inline preview.
export const POWERPOINT_PREVIEWABLE_MIME_TYPES = [PPT_MIME, PPTX_MIME, PPSX_MIME];

export const POWERPOINT_EXTENSIONS = ["ppt", "pptx", "pps", "ppsx", "odp"];
export const POWERPOINT_PREVIEWABLE_EXTENSIONS = ["ppt", "pptx", "pps", "ppsx"];

// `accept` attribute value for <input type="file">.
export const POWERPOINT_ACCEPT = POWERPOINT_EXTENSIONS.map((ext) => `.${ext}`).join(",");

// Extension -> info, shaped like attachment-types.ts's EXTENSION_INFO entries.
export const POWERPOINT_EXTENSION_INFO = {
  ppt: { category: "powerpoint" as const, mime: PPT_MIME, label: "PPT" },
  pps: { category: "powerpoint" as const, mime: PPT_MIME, label: "PPS" },
  pptx: { category: "powerpoint" as const, mime: PPTX_MIME, label: "PPTX" },
  ppsx: { category: "powerpoint" as const, mime: PPSX_MIME, label: "PPSX" },
  odp: { category: "powerpoint" as const, mime: ODP_MIME, label: "ODP" },
};
