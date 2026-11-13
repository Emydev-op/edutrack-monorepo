-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");


-- Guardians often have only a phone number, and pupils sign in with their admission number, so
-- email is optional. Phone numbers are stored in E.164 form so they can be a unique sign-in handle.
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

-- An invitation must go somewhere: an email address, a phone number for SMS, or both.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_destination_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_phone_e164_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');
