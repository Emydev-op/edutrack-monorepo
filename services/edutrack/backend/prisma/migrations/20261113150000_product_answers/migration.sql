-- Product-owner answers (13 Nov 2026): branch levels, bell times per section, dated class
-- teachers, curriculum per session, invoice kinds, platform-wide ticket numbers, SMS fee-reminder
-- opt-out, retention columns. The NOT NULL columns added without defaults are safe only because
-- these tables are still empty (pre-launch); do not copy that pattern once data exists.

-- CreateEnum
CREATE TYPE "invoice_kind" AS ENUM ('TERM_FEES', 'AD_HOC');

-- CreateEnum
CREATE TYPE "platform_number_kind" AS ENUM ('TICKET', 'PLATFORM_INVOICE');

-- AlterEnum
BEGIN;
CREATE TYPE "number_kind_new" AS ENUM ('ADMISSION', 'STAFF', 'INVOICE', 'RECEIPT', 'REFUND', 'EXPENSE', 'TRANSFER', 'APPLICATION');
ALTER TABLE "number_sequences" ALTER COLUMN "kind" TYPE "number_kind_new" USING ("kind"::text::"number_kind_new");
ALTER TYPE "number_kind" RENAME TO "number_kind_old";
ALTER TYPE "number_kind_new" RENAME TO "number_kind";
DROP TYPE "public"."number_kind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "curriculum_entries" DROP CONSTRAINT "curriculum_entries_school_id_level_id_fkey";

-- DropForeignKey
ALTER TABLE "result_sheets" DROP CONSTRAINT "result_sheets_school_id_arm_id_fkey";

-- DropForeignKey
ALTER TABLE "result_sheets" DROP CONSTRAINT "result_sheets_school_id_term_id_fkey";

-- DropForeignKey
ALTER TABLE "teaching_assignments" DROP CONSTRAINT "teaching_assignments_school_id_arm_id_fkey";

-- DropForeignKey
ALTER TABLE "teaching_assignments" DROP CONSTRAINT "teaching_assignments_school_id_term_id_fkey";

-- DropIndex
DROP INDEX "class_teacher_assignments_session_id_arm_id_key";

-- DropIndex
DROP INDEX "curriculum_entries_level_id_subject_id_key";

-- DropIndex
DROP INDEX "elective_groups_section_id_name_key";

-- DropIndex
DROP INDEX "invoices_one_live_per_term_key";

-- DropIndex
DROP INDEX "support_tickets_school_id_number_key";

-- DropIndex
DROP INDEX "timetable_periods_school_id_sort_order_key";

-- AlterTable
ALTER TABLE "attendance_registers" ADD COLUMN     "taken_by_staff_id" UUID;

-- AlterTable
ALTER TABLE "class_teacher_assignments" ADD COLUMN     "ends_on" DATE,
ADD COLUMN     "starts_on" DATE NOT NULL;

-- AlterTable
ALTER TABLE "curriculum_entries" ADD COLUMN     "session_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "elective_groups" ADD COLUMN     "session_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "guardians" DROP COLUMN "email_opt_out",
DROP COLUMN "sms_opt_out",
ADD COLUMN     "sms_fee_reminders_opted_out_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "kind" "invoice_kind" NOT NULL DEFAULT 'TERM_FEES',
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "purged_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "report_cards" ADD COLUMN     "class_teacher_staff_id" UUID;

-- AlterTable
ALTER TABLE "result_sheets" ADD COLUMN     "level_id" UUID NOT NULL,
ADD COLUMN     "session_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "purged_at" TIMESTAMPTZ(3),
ADD COLUMN     "retain_until" DATE;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "left_on" DATE;

-- AlterTable
ALTER TABLE "teaching_assignments" ADD COLUMN     "level_id" UUID NOT NULL,
ADD COLUMN     "session_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "timetable_periods" ADD COLUMN     "section_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "branch_levels" (
    "school_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_levels_pkey" PRIMARY KEY ("branch_id","level_id")
);

-- CreateTable
CREATE TABLE "platform_sequences" (
    "id" UUID NOT NULL,
    "kind" "platform_number_kind" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_levels_school_id_level_id_idx" ON "branch_levels"("school_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_levels_school_id_branch_id_level_id_key" ON "branch_levels"("school_id", "branch_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sequences_kind_scope_key" ON "platform_sequences"("kind", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "class_arms_school_id_level_id_id_key" ON "class_arms"("school_id", "level_id", "id");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_school_id_session_id_arm_id_start_idx" ON "class_teacher_assignments"("school_id", "session_id", "arm_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "class_teacher_assignments_one_current_key" ON "class_teacher_assignments"("session_id", "arm_id") WHERE (ends_on IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_entries_session_id_level_id_subject_id_key" ON "curriculum_entries"("session_id", "level_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_entries_school_id_session_id_level_id_subject_id_key" ON "curriculum_entries"("school_id", "session_id", "level_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_session_id_section_id_name_key" ON "elective_groups"("session_id", "section_id", "name");

-- CreateIndex
CREATE INDEX "invoices_school_id_kind_term_id_idx" ON "invoices"("school_id", "kind", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_one_live_per_term_key" ON "invoices"("student_id", "term_id") WHERE (status <> 'CANCELLED' AND kind = 'TERM_FEES');

-- CreateIndex
CREATE INDEX "message_deliveries_created_at_idx" ON "message_deliveries"("created_at");

-- CreateIndex
CREATE INDEX "message_recipients_created_at_idx" ON "message_recipients"("created_at");

-- CreateIndex
CREATE INDEX "messages_purge_idx" ON "messages"("created_at") WHERE (purged_at IS NULL);

-- CreateIndex
CREATE INDEX "staff_left_on_idx" ON "staff"("left_on") WHERE (left_on IS NOT NULL);

-- CreateIndex
CREATE INDEX "stored_files_purge_idx" ON "stored_files"("retain_until") WHERE (purged_at IS NULL AND retain_until IS NOT NULL);

-- CreateIndex
CREATE INDEX "students_left_on_idx" ON "students"("left_on") WHERE (left_on IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE UNIQUE INDEX "terms_school_id_session_id_id_key" ON "terms"("school_id", "session_id", "id");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_section_id_idx" ON "timetable_periods"("school_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_section_id_sort_order_key" ON "timetable_periods"("section_id", "sort_order");

-- AddForeignKey
ALTER TABLE "branch_levels" ADD CONSTRAINT "branch_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_levels" ADD CONSTRAINT "branch_levels_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_levels" ADD CONSTRAINT "branch_levels_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_school_id_branch_id_level_id_fkey" FOREIGN KEY ("school_id", "branch_id", "level_id") REFERENCES "branch_levels"("school_id", "branch_id", "level_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_session_id_term_id_fkey" FOREIGN KEY ("school_id", "session_id", "term_id") REFERENCES "terms"("school_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_level_id_arm_id_fkey" FOREIGN KEY ("school_id", "level_id", "arm_id") REFERENCES "class_arms"("school_id", "level_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_session_id_level_id_subject_fkey" FOREIGN KEY ("school_id", "session_id", "level_id", "subject_id") REFERENCES "curriculum_entries"("school_id", "session_id", "level_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_taken_by_staff_id_fkey" FOREIGN KEY ("school_id", "taken_by_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_session_id_term_id_fkey" FOREIGN KEY ("school_id", "session_id", "term_id") REFERENCES "terms"("school_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_level_id_arm_id_fkey" FOREIGN KEY ("school_id", "level_id", "arm_id") REFERENCES "class_arms"("school_id", "level_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_session_id_level_id_subject_id_fkey" FOREIGN KEY ("school_id", "session_id", "level_id", "subject_id") REFERENCES "curriculum_entries"("school_id", "session_id", "level_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_class_teacher_staff_id_fkey" FOREIGN KEY ("school_id", "class_teacher_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Checks Prisma can't express (Migrate ignores CHECKs when diffing).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_dates_chk"
  CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- Ad-hoc bills must say what they are for.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ad_hoc_title_chk"
  CHECK (kind <> 'AD_HOC' OR (title IS NOT NULL AND length(btrim(title)) > 0));
ALTER TABLE "platform_sequences" ADD CONSTRAINT "platform_sequences_next_value_chk" CHECK (next_value >= 1);
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_next_value_chk" CHECK (next_value >= 1);
