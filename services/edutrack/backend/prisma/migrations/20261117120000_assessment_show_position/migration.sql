-- Showing class position on report cards is decided per section (each section's assessment
-- scheme), not once for the whole school.

-- AlterTable
ALTER TABLE "assessment_schemes" ADD COLUMN     "show_position" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "school_settings" DROP COLUMN "show_position";
