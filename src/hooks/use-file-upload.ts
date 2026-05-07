"use client";

import { useState, useCallback } from "react";
import type { UploadedFile } from "@/types/onboarding";

interface UseFileUploadReturn {
  uploadFile: (file: File, customerId: string, productName: string) => Promise<UploadedFile>;
  removeFile: (fileId: string) => void;
  uploading: boolean;
  progress: number;
  error: string | null;
  uploadedFiles: UploadedFile[];
}

export function useFileUpload(): UseFileUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const uploadFile = useCallback(
    async (file: File, customerId: string, productName: string): Promise<UploadedFile> => {
      setUploading(true);
      setProgress(0);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("customerId", customerId);
        formData.append("productName", productName);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Upload failed");
        }

        const result: UploadedFile = await response.json();
        setUploadedFiles((prev) => [...prev, result]);
        setProgress(100);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        throw err;
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const removeFile = useCallback((path: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  return { uploadFile, removeFile, uploading, progress, error, uploadedFiles };
}