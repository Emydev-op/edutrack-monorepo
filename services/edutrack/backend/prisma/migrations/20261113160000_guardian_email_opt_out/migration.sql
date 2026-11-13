-- Guardians can opt out of non-essential school email (product owner, 13 Nov 2026).
-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "email_opted_out_at" TIMESTAMPTZ(3);

