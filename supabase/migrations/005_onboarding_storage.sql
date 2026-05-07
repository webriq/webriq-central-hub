-- Migration 005: Onboarding Storage Bucket + RLS Policies
-- Creates the onboarding-assets bucket for file uploads during customer onboarding.
-- Public read access (unauthenticated customers need to view their files).
-- Authenticated write access via the upload API route.

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-assets',
  'onboarding-assets',
  true,
  26214400, -- 25MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public read access for onboarding-assets
-- Anyone can view files in the onboarding-assets bucket (needed for unauthenticated customers)
DROP POLICY IF EXISTS "Public read access for onboarding assets" ON storage.objects;
CREATE POLICY "Public read access for onboarding assets"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'onboarding-assets');

-- Policy: Authenticated insert for onboarding-assets
-- Any authenticated user can upload to onboarding-assets
-- The upload API route uses the service role (admin client) for actual uploads,
-- but this policy is here for future direct authenticated uploads.
DROP POLICY IF EXISTS "Authenticated insert to onboarding assets" ON storage.objects;
CREATE POLICY "Authenticated insert to onboarding assets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'onboarding-assets');

-- Policy: Authenticated delete for onboarding-assets
DROP POLICY IF EXISTS "Authenticated delete from onboarding assets" ON storage.objects;
CREATE POLICY "Authenticated delete from onboarding assets"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'onboarding-assets');