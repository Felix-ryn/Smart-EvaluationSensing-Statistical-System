-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "photoPath" TEXT NOT NULL,
    "locationId" TEXT,
    "slotCode" TEXT,
    "violationType" TEXT NOT NULL DEFAULT 'illegal-parking',
    "confidence" DOUBLE PRECISION,
    "reportedById" TEXT,
    "reporterRole" "Role" NOT NULL DEFAULT 'USER',
    "status" "ViolationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "detections" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ParkingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
