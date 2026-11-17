-- Student Portal logins are turned on per section. Existing Junior and Senior Secondary sections
-- start on (the product default); Nursery, Primary and custom sections start off.
ALTER TABLE "sections" ADD COLUMN     "student_logins" BOOLEAN NOT NULL DEFAULT false;

UPDATE "sections" SET "student_logins" = true WHERE "code" IN ('JSS', 'SSS');
