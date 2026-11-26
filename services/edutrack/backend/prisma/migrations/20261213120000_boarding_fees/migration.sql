-- Fee items billed to everyone, or only to boarders (all, boys or girls).
-- CreateEnum
CREATE TYPE "fee_audience" AS ENUM ('EVERYONE', 'BOARDERS', 'BOY_BOARDERS', 'GIRL_BOARDERS');

-- AlterTable
ALTER TABLE "fee_items" ADD COLUMN     "applies_to" "fee_audience" NOT NULL DEFAULT 'EVERYONE';

