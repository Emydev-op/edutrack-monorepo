-- AlterTable
ALTER TABLE "finance_settings" ADD COLUMN     "hold_report_cards" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "proof_name" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "attachment_name" TEXT,
ADD COLUMN     "attachment_size" TEXT;

