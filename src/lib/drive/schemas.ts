import { z } from "zod";
import { DRIVE_SHARE_ROLES } from "./constants";

const uuid = z.string().uuid();
const name = z.string().trim().min(1, "Enter a name.").max(255, "Names can be up to 255 characters.");

export const createFolderSchema = z.object({ name, parentFolderId: uuid.nullable().default(null) });
export const renameFolderSchema = z.object({ name });

export const signUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  folderId: uuid.nullable().default(null),
});

export const registerFileSchema = z.object({
  file_path: z.string().min(1),
  file_name: name,
  file_size: z.number().int().nonnegative().nullable().default(null),
  file_mime_type: z.string().nullable().default(null),
  folder_id: uuid.nullable().default(null),
});

export const patchFileSchema = z.object({ name: name.optional(), folderId: uuid.nullable().optional() })
  .refine((b) => b.name !== undefined || b.folderId !== undefined, { message: "Nothing to update." });

export const manifestSchema = z.object({
  fileIds: z.array(uuid).max(2000).default([]),
  folderIds: z.array(uuid).max(500).default([]),
}).refine((b) => b.fileIds.length + b.folderIds.length > 0, { message: "Nothing selected" });

const target = { folderId: uuid.optional(), fileId: uuid.optional() };
const oneTarget = (b: { folderId?: string; fileId?: string }) => (b.folderId === undefined) !== (b.fileId === undefined);

export const createShareSchema = z.object({
  ...target,
  userId: uuid.optional(),
  role: z.enum(DRIVE_SHARE_ROLES).optional(),
  permission: z.enum(["view", "edit"]),
}).refine(oneTarget, { message: "Share a folder or a file." })
  .refine((b) => (b.userId === undefined) !== (b.role === undefined), { message: "Pick a person or a role." });

export const updateShareSchema = z.object({ permission: z.enum(["view", "edit"]) });
export const listSharesSchema = z.object(target).refine(oneTarget, { message: "folderId or fileId is required." });
