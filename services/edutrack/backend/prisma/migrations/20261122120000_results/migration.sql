-- AlterEnum
ALTER TYPE "sheet_action" ADD VALUE 'RECALLED';

-- AlterTable
ALTER TABLE "report_cards" ADD COLUMN     "held_at" TIMESTAMPTZ(3),
ADD COLUMN     "held_by_id" UUID,
ADD COLUMN     "held_reason" TEXT;

