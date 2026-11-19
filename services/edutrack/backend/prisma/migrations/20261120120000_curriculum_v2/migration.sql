-- DropIndex
DROP INDEX "teaching_assignments_term_id_arm_id_subject_id_key";

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "section_id" UUID;

-- AlterTable
ALTER TABLE "curriculum_entries" ADD COLUMN     "periods_per_week" INTEGER;

-- AlterTable
ALTER TABLE "teaching_assignments" ADD COLUMN     "lead" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "curriculum_arms" (
    "school_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "periods_per_week" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_arms_pkey" PRIMARY KEY ("entry_id","arm_id")
);

-- CreateTable
CREATE TABLE "membership_sections" (
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_sections_pkey" PRIMARY KEY ("membership_id","section_id")
);

-- CreateIndex
CREATE INDEX "curriculum_arms_school_id_arm_id_idx" ON "curriculum_arms"("school_id", "arm_id");

-- CreateIndex
CREATE INDEX "membership_sections_school_id_section_id_idx" ON "membership_sections"("school_id", "section_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_section_id_idx" ON "subjects"("school_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_entries_school_id_id_key" ON "curriculum_entries"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_one_lead_key" ON "teaching_assignments"("term_id", "arm_id", "subject_id") WHERE (lead);

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_term_id_arm_id_subject_id_staff_id_key" ON "teaching_assignments"("term_id", "arm_id", "subject_id", "staff_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_arms" ADD CONSTRAINT "curriculum_arms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_arms" ADD CONSTRAINT "curriculum_arms_school_id_entry_id_fkey" FOREIGN KEY ("school_id", "entry_id") REFERENCES "curriculum_entries"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_arms" ADD CONSTRAINT "curriculum_arms_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_sections" ADD CONSTRAINT "membership_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_sections" ADD CONSTRAINT "membership_sections_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_sections" ADD CONSTRAINT "membership_sections_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: a subject offered by only one section's class levels belongs to that section.
-- Subjects offered across sections stay shared (section_id null) until the school splits them.
UPDATE "subjects" s
SET "section_id" = only_one.section_id
FROM (
  SELECT ce.subject_id, MIN(cl.section_id::text)::uuid AS section_id
  FROM "curriculum_entries" ce
  JOIN "class_levels" cl ON cl.id = ce.level_id
  GROUP BY ce.subject_id
  HAVING COUNT(DISTINCT cl.section_id) = 1
) only_one
WHERE s.id = only_one.subject_id;
