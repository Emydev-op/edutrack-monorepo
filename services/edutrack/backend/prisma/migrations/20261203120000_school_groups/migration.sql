-- CreateEnum
CREATE TYPE "group_role" AS ENUM ('OWNER', 'FINANCE', 'ACADEMIC');

-- AlterTable
ALTER TABLE "school_memberships" ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "school_groups" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_staff" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "group_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_groups_name_key" ON "school_groups"("name");

-- CreateIndex
CREATE INDEX "group_staff_user_id_idx" ON "group_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_staff_group_id_user_id_key" ON "group_staff"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_staff" ADD CONSTRAINT "group_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

