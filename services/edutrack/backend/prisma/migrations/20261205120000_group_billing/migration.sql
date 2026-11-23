-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "platform_invoices" ADD COLUMN     "group_id" UUID,
ALTER COLUMN "school_id" DROP NOT NULL,
ALTER COLUMN "subscription_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "school_groups" ADD COLUMN     "billing_contact_email" CITEXT,
ADD COLUMN     "billing_period" "billing_period",
ADD COLUMN     "plan_id" UUID,
ADD COLUMN     "price_kobo" BIGINT,
ADD COLUMN     "renews_on" DATE,
ADD COLUMN     "started_on" DATE;

-- CreateIndex
CREATE INDEX "subscriptions_group_id_idx" ON "subscriptions"("group_id");

-- CreateIndex
CREATE INDEX "platform_invoices_group_id_issued_on_idx" ON "platform_invoices"("group_id", "issued_on");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_groups" ADD CONSTRAINT "school_groups_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

