-- Create ForecastValidation table for tracking forecast accuracy
CREATE TABLE "ForecastValidation" (
  "id" UUID NOT NULL,
  "forecastMonth" DATE NOT NULL,
  "actualRevenue" BIGINT,
  "forecastedRevenue" BIGINT NOT NULL,
  "mapePercent" DOUBLE PRECISION,
  "modelAccuracy" VARCHAR(50),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ForecastValidation_pkey" PRIMARY KEY ("id")
);

-- Create indices for query optimization
CREATE INDEX "ForecastValidation_forecastMonth_idx" ON "ForecastValidation"("forecastMonth");
CREATE INDEX "ForecastValidation_createdAt_idx" ON "ForecastValidation"("createdAt");
