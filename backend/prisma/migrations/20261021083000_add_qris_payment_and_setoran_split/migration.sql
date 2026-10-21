-- CreateEnum (safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QrisPaymentStatus') THEN
    CREATE TYPE "QrisPaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "SetoranEntry"
  ADD COLUMN IF NOT EXISTS "cashAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "qrisAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "QrisPayment" (
  "id" TEXT NOT NULL,
  "transactionId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'XENDIT',
  "providerPaymentId" TEXT,
  "amount" INTEGER NOT NULL,
  "areaId" TEXT NOT NULL,
  "jukirId" TEXT,
  "status" "QrisPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "qrString" TEXT,
  "qrCodeUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrisPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "QrisPayment_externalId_key" ON "QrisPayment"("externalId");
CREATE INDEX IF NOT EXISTS "QrisPayment_transactionId_createdAt_idx" ON "QrisPayment"("transactionId", "createdAt");
CREATE INDEX IF NOT EXISTS "QrisPayment_status_createdAt_idx" ON "QrisPayment"("status", "createdAt");

-- AddForeignKey (safe for lowercase/uppercase table name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transaction'
  ) THEN
    BEGIN
      ALTER TABLE "QrisPayment"
      ADD CONSTRAINT "QrisPayment_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "transaction"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Transaction'
  ) THEN
    BEGIN
      ALTER TABLE "QrisPayment"
      ADD CONSTRAINT "QrisPayment_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;
