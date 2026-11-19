-- Schools that finished setup in School Admin were left as ONBOARDING (nothing moved them on).
-- Finishing setup now makes a school ACTIVE; bring the existing ones in line.
UPDATE "schools" SET "status" = 'ACTIVE' WHERE "status" = 'ONBOARDING' AND "setup_finished_at" IS NOT NULL;
