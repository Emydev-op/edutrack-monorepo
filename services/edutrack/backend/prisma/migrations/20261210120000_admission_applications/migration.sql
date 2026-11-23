-- Admission applications the school can work: an offer stage, a declined stage, the entrance
-- assessment and the offer's dates.
ALTER TYPE "application_stage" ADD VALUE 'OFFER_SENT';
ALTER TYPE "application_stage" ADD VALUE 'DECLINED';

ALTER TABLE "admission_applications"
  ADD COLUMN "previous_school" TEXT,
  ADD COLUMN "assessment_on" DATE,
  ADD COLUMN "assessment_result" TEXT,
  ADD COLUMN "offer_sent_on" DATE,
  ADD COLUMN "offer_expires_on" DATE;
