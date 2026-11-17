import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/globalSetup.ts"],
    // Prisma loads the real .env at runtime but never overrides values that are already set,
    // so every secret is blanked here. Tests must never see or use real credentials.
    env: {
      DATABASE_URL: "file:./test.db",
      AI_PROVIDER: "mock",
      INTEGRATIONS_MODE: "mock",
      WHATSAPP_TOKEN: "",
      WHATSAPP_PHONE_NUMBER_ID: "",
      WHATSAPP_TEMPLATE_NAME: "",
      META_APP_SECRET: "",
      META_ACCESS_TOKEN: "",
      WEBHOOK_VERIFY_TOKEN: "",
      OWNER_PASSWORD: "",
      AUTH_SECRET: "",
      CRON_SECRET: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
    },
  },
});
