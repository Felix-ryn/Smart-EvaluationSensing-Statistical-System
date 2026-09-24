-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "vehicleType" TEXT NOT NULL DEFAULT 'motorcycle',
ADD COLUMN     "plateNumber" TEXT;
