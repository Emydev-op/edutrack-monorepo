-- AlterTable
ALTER TABLE "assessment_schemes" ADD COLUMN     "promotion_min_average" DECIMAL(5,2),
ADD COLUMN     "promotion_subject_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- AlterTable
ALTER TABLE "promotion_decisions" ALTER COLUMN "to_session_id" DROP NOT NULL;

