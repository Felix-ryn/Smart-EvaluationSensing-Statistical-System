import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const code = process.argv[2];
const amount = Number(process.argv[3] ?? 2000);

if (!code) {
  console.error("Usage: node tmp_live_update_tx.mjs <transactionCode> [amount]");
  process.exit(1);
}

const tx = await prisma.transaction.findUnique({ where: { transactionCode: code } });
if (!tx) {
  console.error("Transaction not found:", code);
  process.exit(1);
}

await prisma.transaction.update({
  where: { id: tx.id },
  data: {
    amount,
    checkOut: new Date(),
  },
});

console.log("Updated transaction", tx.transactionCode, tx.id, "amount=", amount);
await prisma.$disconnect();
