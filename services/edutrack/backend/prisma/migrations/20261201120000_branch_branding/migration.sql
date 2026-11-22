-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "brand_color" TEXT,
ADD COLUMN     "logo_file_id" UUID;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

