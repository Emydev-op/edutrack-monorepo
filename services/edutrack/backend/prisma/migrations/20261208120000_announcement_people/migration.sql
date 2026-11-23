-- Announcements to specific people (parents, students, staff picked by name).
ALTER TYPE "audience_kind" ADD VALUE 'PEOPLE';

ALTER TABLE "announcements" ADD COLUMN "audience_people" TEXT[] DEFAULT ARRAY[]::TEXT[];
