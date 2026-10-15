-- AlterTable
ALTER TABLE "CvDetection"
DROP COLUMN "emptyCount",
DROP COLUMN "occupiedCount",
DROP COLUMN "illegalCount",
ADD COLUMN "normalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "violationCount" INTEGER NOT NULL DEFAULT 0;
