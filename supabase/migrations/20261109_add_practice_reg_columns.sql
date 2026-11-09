ALTER TABLE "Setting"
ADD COLUMN IF NOT EXISTS "practiceTitle" text,
ADD COLUMN IF NOT EXISTS "practiceNumber" text,
ADD COLUMN IF NOT EXISTS "hpcsaNumber" text;
