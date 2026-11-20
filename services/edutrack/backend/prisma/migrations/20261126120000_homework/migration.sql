-- AlterEnum
ALTER TYPE "comms_event" ADD VALUE 'ASSIGNMENT_RETURNED';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "submitted_by_guardian_id" UUID;

