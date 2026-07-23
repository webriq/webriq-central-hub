ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS otp_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMPTZ NULL;

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'device_verification'
    CHECK (purpose IN ('device_verification', 'password_reset'));
