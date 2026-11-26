-- Boarding house management: approved pickup people, exeats with gate sign-out and return, gate visitors, hostel roll calls, the sick bay, visiting days, hostel incidents and property checklists.
-- CreateEnum
CREATE TYPE "exeat_kind" AS ENUM ('WEEKEND', 'MEDICAL', 'FAMILY', 'EMERGENCY', 'TERM_BREAK', 'OTHER');

-- CreateEnum
CREATE TYPE "exeat_status" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'CANCELLED', 'OUT', 'RETURNED');

-- CreateEnum
CREATE TYPE "roll_mark" AS ENUM ('PRESENT', 'ABSENT', 'EXEAT', 'SICK_BAY', 'EXCUSED');

-- CreateEnum
CREATE TYPE "sick_bay_outcome" AS ENUM ('RETURNED', 'ADMITTED', 'SENT_HOME', 'REFERRED');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "property_check_kind" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- AlterTable
ALTER TABLE "hostels" ADD COLUMN     "roll_call_slots" TEXT[] DEFAULT ARRAY['Morning', 'Night']::TEXT[];

-- CreateTable
CREATE TABLE "pickup_people" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "added_by_user_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exeats" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" "exeat_kind" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "leave_at" TIMESTAMPTZ(3) NOT NULL,
    "return_by" TIMESTAMPTZ(3) NOT NULL,
    "pickup_person_id" UUID,
    "status" "exeat_status" NOT NULL,
    "requested_by_user_id" UUID,
    "requested_by_parent" BOOLEAN NOT NULL DEFAULT false,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT NOT NULL DEFAULT '',
    "signed_out_at" TIMESTAMPTZ(3),
    "signed_out_by_user_id" UUID,
    "collected_by" TEXT,
    "signed_in_at" TIMESTAMPTZ(3),
    "signed_in_by_user_id" UUID,
    "batch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_visitors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL,
    "student_id" UUID,
    "in_at" TIMESTAMPTZ(3) NOT NULL,
    "out_at" TIMESTAMPTZ(3),
    "logged_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roll_calls" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "taken_by_user_id" UUID,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roll_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roll_call_marks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "roll_call_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mark" "roll_mark" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roll_call_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sick_bay_visits" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL,
    "complaint" TEXT NOT NULL,
    "assessment" TEXT NOT NULL DEFAULT '',
    "treatment" TEXT NOT NULL DEFAULT '',
    "medication" TEXT NOT NULL DEFAULT '',
    "outcome" "sick_bay_outcome" NOT NULL,
    "discharged_at" TIMESTAMPTZ(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sick_bay_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visiting_days" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "branch_id" UUID,
    "date" DATE NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visiting_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_incidents" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "hostel_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "status" "incident_status" NOT NULL DEFAULT 'OPEN',
    "shared_with_parent" BOOLEAN NOT NULL DEFAULT false,
    "reported_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_checklist_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_checks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "kind" "property_check_kind" NOT NULL,
    "items" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "checked_by_user_id" UUID,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pickup_people_school_id_student_id_idx" ON "pickup_people"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_people_school_id_id_key" ON "pickup_people"("school_id", "id");

-- CreateIndex
CREATE INDEX "exeats_school_id_status_leave_at_idx" ON "exeats"("school_id", "status", "leave_at");

-- CreateIndex
CREATE INDEX "exeats_school_id_student_id_leave_at_idx" ON "exeats"("school_id", "student_id", "leave_at");

-- CreateIndex
CREATE UNIQUE INDEX "exeats_school_id_id_key" ON "exeats"("school_id", "id");

-- CreateIndex
CREATE INDEX "gate_visitors_school_id_branch_id_in_at_idx" ON "gate_visitors"("school_id", "branch_id", "in_at");

-- CreateIndex
CREATE INDEX "roll_calls_school_id_date_idx" ON "roll_calls"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "roll_calls_school_id_id_key" ON "roll_calls"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roll_calls_hostel_id_scope_date_slot_key" ON "roll_calls"("hostel_id", "scope", "date", "slot");

-- CreateIndex
CREATE INDEX "roll_call_marks_school_id_student_id_idx" ON "roll_call_marks"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "roll_call_marks_roll_call_id_student_id_key" ON "roll_call_marks"("roll_call_id", "student_id");

-- CreateIndex
CREATE INDEX "sick_bay_visits_school_id_student_id_seen_at_idx" ON "sick_bay_visits"("school_id", "student_id", "seen_at");

-- CreateIndex
CREATE INDEX "sick_bay_visits_school_id_outcome_discharged_at_idx" ON "sick_bay_visits"("school_id", "outcome", "discharged_at");

-- CreateIndex
CREATE UNIQUE INDEX "sick_bay_visits_school_id_id_key" ON "sick_bay_visits"("school_id", "id");

-- CreateIndex
CREATE INDEX "visiting_days_school_id_date_idx" ON "visiting_days"("school_id", "date");

-- CreateIndex
CREATE INDEX "hostel_incidents_school_id_student_id_occurred_at_idx" ON "hostel_incidents"("school_id", "student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "hostel_incidents_school_id_hostel_id_occurred_at_idx" ON "hostel_incidents"("school_id", "hostel_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_checklist_items_school_id_name_key" ON "boarding_checklist_items"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "property_checks_student_id_term_id_kind_key" ON "property_checks"("student_id", "term_id", "kind");

-- AddForeignKey
ALTER TABLE "pickup_people" ADD CONSTRAINT "pickup_people_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_people" ADD CONSTRAINT "pickup_people_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exeats" ADD CONSTRAINT "exeats_school_id_pickup_person_id_fkey" FOREIGN KEY ("school_id", "pickup_person_id") REFERENCES "pickup_people"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_visitors" ADD CONSTRAINT "gate_visitors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_visitors" ADD CONSTRAINT "gate_visitors_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_visitors" ADD CONSTRAINT "gate_visitors_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_school_id_hostel_id_fkey" FOREIGN KEY ("school_id", "hostel_id") REFERENCES "hostels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_call_marks" ADD CONSTRAINT "roll_call_marks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_call_marks" ADD CONSTRAINT "roll_call_marks_school_id_roll_call_id_fkey" FOREIGN KEY ("school_id", "roll_call_id") REFERENCES "roll_calls"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roll_call_marks" ADD CONSTRAINT "roll_call_marks_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sick_bay_visits" ADD CONSTRAINT "sick_bay_visits_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visiting_days" ADD CONSTRAINT "visiting_days_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visiting_days" ADD CONSTRAINT "visiting_days_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_incidents" ADD CONSTRAINT "hostel_incidents_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_checklist_items" ADD CONSTRAINT "boarding_checklist_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_checks" ADD CONSTRAINT "property_checks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_checks" ADD CONSTRAINT "property_checks_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_checks" ADD CONSTRAINT "property_checks_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

