-- Boarding: day or boarder per enrolment, the family's request on an application, and bed allocations.
-- AlterTable
ALTER TABLE "admission_applications" ADD COLUMN     "wants_boarding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "boarding" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bed_allocations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "bed" TEXT,
    "allocated_on" DATE NOT NULL,
    "allocated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bed_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bed_allocations_school_id_room_id_idx" ON "bed_allocations"("school_id", "room_id");

-- CreateIndex
CREATE UNIQUE INDEX "bed_allocations_school_id_enrollment_id_key" ON "bed_allocations"("school_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_school_id_enrollment_id_fkey" FOREIGN KEY ("school_id", "enrollment_id") REFERENCES "enrollments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_school_id_room_id_fkey" FOREIGN KEY ("school_id", "room_id") REFERENCES "hostel_rooms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One student per labelled bed.
CREATE UNIQUE INDEX "bed_allocations_room_bed_key" ON "bed_allocations"("room_id", "bed") WHERE "bed" IS NOT NULL;
