-- CreateEnum
CREATE TYPE "group_template_kind" AS ENUM ('GRADING', 'FEES', 'ROLES', 'MESSAGES');

-- CreateTable
CREATE TABLE "group_templates" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "kind" "group_template_kind" NOT NULL,
    "data" JSONB NOT NULL,
    "source_school_id" UUID,
    "saved_by_id" UUID,
    "saved_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_templates_group_id_kind_key" ON "group_templates"("group_id", "kind");

-- AddForeignKey
ALTER TABLE "group_templates" ADD CONSTRAINT "group_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

