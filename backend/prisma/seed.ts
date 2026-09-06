import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.upsert({
    where: { email: "admin@sess.local" },
    update: {},
    create: { name: "Admin", email: "admin@sess.local", passwordHash, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "user@sess.local" },
    update: {},
    create: { name: "User", email: "user@sess.local", passwordHash, role: "USER" },
  });
  console.log("Seeded: admin@sess.local / user@sess.local (password: password123)");
}

main().finally(() => prisma.$disconnect());
