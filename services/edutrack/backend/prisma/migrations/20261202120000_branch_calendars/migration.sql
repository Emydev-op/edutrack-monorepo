-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "branch_id" UUID;

-- CreateTable
CREATE TABLE "branch_term_dates" (
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_term_dates_pkey" PRIMARY KEY ("term_id","branch_id")
);

-- CreateIndex
CREATE INDEX "branch_term_dates_school_id_branch_id_idx" ON "branch_term_dates"("school_id", "branch_id");

-- CreateIndex
CREATE INDEX "calendar_events_school_id_branch_id_idx" ON "calendar_events"("school_id", "branch_id");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_term_dates" ADD CONSTRAINT "branch_term_dates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_term_dates" ADD CONSTRAINT "branch_term_dates_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_term_dates" ADD CONSTRAINT "branch_term_dates_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

