-- Staff belong to a support desk team (PR 3, 14 Nov 2026).
-- AlterTable
ALTER TABLE "platform_staff" ADD COLUMN "support_team" "support_team";

-- CreateIndex
CREATE INDEX "platform_staff_support_team_idx" ON "platform_staff"("support_team");
