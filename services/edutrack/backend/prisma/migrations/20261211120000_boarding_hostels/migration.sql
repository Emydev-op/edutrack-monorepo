-- Boarding: where a school takes boarders, and its hostels, floors, rooms and house staff.
-- CreateEnum
CREATE TYPE "hostel_gender" AS ENUM ('BOYS', 'GIRLS', 'MIXED');

-- CreateEnum
CREATE TYPE "hostel_staff_role" AS ENUM ('HOUSE_MASTER', 'FLOOR_MASTER', 'ASSISTANT');

-- AlterEnum
ALTER TYPE "import_kind" ADD VALUE 'HOSTEL_ROOMS';

-- AlterTable
ALTER TABLE "branch_sections" ADD COLUMN     "boarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boarding_level_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "hostels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "hostel_gender" NOT NULL,
    "level_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "note" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_floors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "floor_id" UUID,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "beds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "floor_id" UUID,
    "staff_id" UUID NOT NULL,
    "role" "hostel_staff_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hostels_school_id_branch_id_idx" ON "hostels"("school_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostels_school_id_id_key" ON "hostels"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_floors_school_id_id_key" ON "hostel_floors"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_floors_hostel_id_name_key" ON "hostel_floors"("hostel_id", "name");

-- CreateIndex
CREATE INDEX "hostel_rooms_school_id_hostel_id_idx" ON "hostel_rooms"("school_id", "hostel_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_school_id_id_key" ON "hostel_rooms"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_hostel_id_name_key" ON "hostel_rooms"("hostel_id", "name");

-- CreateIndex
CREATE INDEX "hostel_staff_school_id_staff_id_idx" ON "hostel_staff"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_staff_hostel_id_staff_id_key" ON "hostel_staff"("hostel_id", "staff_id");

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_floors" ADD CONSTRAINT "hostel_floors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_floors" ADD CONSTRAINT "hostel_floors_school_id_hostel_id_fkey" FOREIGN KEY ("school_id", "hostel_id") REFERENCES "hostels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_school_id_hostel_id_fkey" FOREIGN KEY ("school_id", "hostel_id") REFERENCES "hostels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_school_id_floor_id_fkey" FOREIGN KEY ("school_id", "floor_id") REFERENCES "hostel_floors"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_staff" ADD CONSTRAINT "hostel_staff_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_staff" ADD CONSTRAINT "hostel_staff_school_id_hostel_id_fkey" FOREIGN KEY ("school_id", "hostel_id") REFERENCES "hostels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_staff" ADD CONSTRAINT "hostel_staff_school_id_floor_id_fkey" FOREIGN KEY ("school_id", "floor_id") REFERENCES "hostel_floors"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_staff" ADD CONSTRAINT "hostel_staff_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

