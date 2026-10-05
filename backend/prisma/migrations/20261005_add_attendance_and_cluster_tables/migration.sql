-- Create Shift enum
CREATE TYPE "Shift" AS ENUM ('PAGI', 'SORE');

-- Create Attendance table
CREATE TABLE "Attendance" (
  "id" UUID NOT NULL,
  "jukirId" VARCHAR(255) NOT NULL,
  "date" DATE NOT NULL,
  "shift" "Shift" NOT NULL,
  "jadwalMasuk" VARCHAR(5) NOT NULL,
  "jamDatang" TIMESTAMP(3) NOT NULL,
  "jamPulang" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on Attendance
CREATE UNIQUE INDEX "Attendance_jukirId_date_key" ON "Attendance"("jukirId", "date");
CREATE INDEX "Attendance_jukirId_date_idx" ON "Attendance"("jukirId", "date");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- Add foreign key
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_jukirId_fkey" 
  FOREIGN KEY ("jukirId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create JukirCluster table
CREATE TABLE "JukirCluster" (
  "id" UUID NOT NULL,
  "jukirId" VARCHAR(255) NOT NULL,
  "clusterLabel" INTEGER NOT NULL,
  "gmmProbability" DOUBLE PRECISION NOT NULL,
  "dailyEarnings" DOUBLE PRECISION NOT NULL,
  "workConsistency" DOUBLE PRECISION NOT NULL,
  "punctualityPercent" DOUBLE PRECISION NOT NULL,
  "analyzedFrom" DATE NOT NULL,
  "analyzedTo" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JukirCluster_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on JukirCluster
CREATE UNIQUE INDEX "JukirCluster_jukirId_analyzedTo_key" ON "JukirCluster"("jukirId", "analyzedTo");
CREATE INDEX "JukirCluster_clusterLabel_analyzedTo_idx" ON "JukirCluster"("clusterLabel", "analyzedTo");

-- Add foreign key
ALTER TABLE "JukirCluster" ADD CONSTRAINT "JukirCluster_jukirId_fkey" 
  FOREIGN KEY ("jukirId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
