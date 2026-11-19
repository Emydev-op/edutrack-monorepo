-- CreateTable
CREATE TABLE "arm_moves" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "from_arm_id" UUID NOT NULL,
    "to_arm_id" UUID,
    "moved_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arm_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arm_moves_school_id_enrollment_id_moved_on_idx" ON "arm_moves"("school_id", "enrollment_id", "moved_on");

-- CreateIndex
CREATE INDEX "arm_moves_school_id_from_arm_id_idx" ON "arm_moves"("school_id", "from_arm_id");

-- CreateIndex
CREATE INDEX "arm_moves_school_id_to_arm_id_idx" ON "arm_moves"("school_id", "to_arm_id");

-- AddForeignKey
ALTER TABLE "arm_moves" ADD CONSTRAINT "arm_moves_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arm_moves" ADD CONSTRAINT "arm_moves_school_id_enrollment_id_fkey" FOREIGN KEY ("school_id", "enrollment_id") REFERENCES "enrollments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arm_moves" ADD CONSTRAINT "arm_moves_school_id_from_arm_id_fkey" FOREIGN KEY ("school_id", "from_arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arm_moves" ADD CONSTRAINT "arm_moves_school_id_to_arm_id_fkey" FOREIGN KEY ("school_id", "to_arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

