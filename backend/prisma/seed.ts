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

  // Demo parking location + slots so the API/frontend show data instead of empty results.
  const loc = await prisma.parkingLocation.upsert({
    where: { id: "seed-loc-1" },
    update: {},
    create: {
      id: "seed-loc-1",
      name: "Parkir Pusat Kota",
      address: "Jl. Merdeka No. 1",
      latitude: -6.2,
      longitude: 106.8166,
      operatingStart: "06:00",
      operatingEnd: "22:00",
    },
  });
  for (let i = 1; i <= 6; i++) {
    await prisma.parkingSlot.upsert({
      where: { locationId_slotCode: { locationId: loc.id, slotCode: `A${i}` } },
      update: {},
      create: {
        locationId: loc.id,
        slotCode: `A${i}`,
        status: i % 3 === 0 ? "OCCUPIED" : "AVAILABLE",
      },
    });
  }
  console.log("Seeded: users (password: password123) + 1 location with 6 slots");
}

main().finally(() => prisma.$disconnect());
