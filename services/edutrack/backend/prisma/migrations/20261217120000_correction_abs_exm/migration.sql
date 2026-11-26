-- Corrections to and from absent (ABS) and exempt (EXM): each side keeps a state, and a score only when scored.
-- AlterTable
ALTER TABLE "score_corrections" ADD COLUMN     "original_state" "score_state" NOT NULL DEFAULT 'SCORED',
ADD COLUMN     "proposed_state" "score_state" NOT NULL DEFAULT 'SCORED',
ALTER COLUMN "original_score" DROP NOT NULL,
ALTER COLUMN "proposed_score" DROP NOT NULL;

