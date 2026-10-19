-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "vehicleType" TEXT NOT NULL DEFAULT 'motorcycle',
ADD COLUMN     "plateNumber" TEXT;
