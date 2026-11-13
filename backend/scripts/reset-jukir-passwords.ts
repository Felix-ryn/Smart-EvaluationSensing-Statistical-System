import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  
  // Update semua User dengan role JUKIR
  const result = await prisma.user.updateMany({
    where: { role: "JUKIR" },
    data: { passwordHash }
  });
  
  console.log(`✅ Berhasil! ${result.count} akun JUKIR password-nya sudah diubah ke 'password123'`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
