import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name} (copy .env.example to .env)`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 4000),
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  xenditSecretKey: process.env.XENDIT_SECRET_KEY ?? "",
  xenditCallbackToken: process.env.XENDIT_CALLBACK_TOKEN ?? "",
  xenditBaseUrl: process.env.XENDIT_BASE_URL ?? "https://api.xendit.co",
  xenditQrisCallbackUrl: process.env.XENDIT_QRIS_CALLBACK_URL ?? "",
};
