"use client";

import React, { useState, useRef, useCallback } from "react";
import type { UploadedFile } from "@/types/onboarding";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/hooks/use-file-upload";
import Image from "next/image";

interface FileUploadProps {
  fieldName: string;
  customerId: string;
  productName: string;
  value: unknown;
  onChange: (fileData: UploadedFile | null) => void;
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function FileUpload({
  fieldName: _fieldName,
  customerId,
  productName,
  value,
  onChange,
}: FileUploadProps) {
  const { uploadFile, uploading, error } = useFileUpload();
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadedFile = value as UploadedFile | null | undefined;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type}. Supported: images, PDF, Word, Excel.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max 25MB.`;
    }
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      setLocalError(null);
      try {
        const result = await uploadFile(file, customerId, productName);
        onChange(result);
      } catch {
        // error handled by hook
      }
    },
    [uploadFile, customerId, productName, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [onChange]);

  const isImage = uploadedFile?.mimeType?.startsWith("image/");

  if (uploadedFile) {
    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center gap-3">
        {isImage ? (
          <Image
            src={uploadedFile.url}
            alt={uploadedFile.filename}
            width={48}
            height={48}
            className="w-12 h-12 rounded object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-indigo-50 flex items-center justify-center text-lg text-brand">
            📄
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-900 m-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {uploadedFile.filename}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-0">
            {(uploadedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <button
          onClick={handleRemove}
          className="bg-none border-none cursor-pointer text-red-500 text-lg px-2 py-1"
          title="Remove file"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg py-6 px-4 text-center cursor-pointer transition-colors duration-200",
          dragOver ? "border-brand bg-indigo-50" : "border-slate-200 bg-[#FAFBFC]"
        )}
      >
        <div className="text-2xl mb-2">📁</div>
        <p className="text-[13px] text-slate-500 mb-1">
          Drag &amp; drop a file here, or{" "}
          <span className="text-brand font-semibold">click to browse</span>
        </p>
        <p className="text-[11px] text-slate-400">
          Supported: images, PDF, Word, Excel &bull; Max 25MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {uploading && (
        <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-brand rounded-full animate-upload-progress" />
        </div>
      )}

      {(localError || error) && (
        <p className="text-xs text-red-500 mt-2">{localError || error}</p>
      )}
    </div>
  );
}
