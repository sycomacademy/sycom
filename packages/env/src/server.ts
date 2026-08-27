import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_API_KEY: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    LINKEDIN_CLIENT_ID: z.string().min(1),
    LINKEDIN_CLIENT_SECRET: z.string().min(1),
    WEBSITE_URL: z.url().optional(),
    DASHBOARD_URL: z.url().optional(),
    SERVER_URL: z.url().optional(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_EMAIL_FROM: z.string().min(1),
    RESEND_EMAIL_REPLY_TO: z.string().min(1),
    CORS_ORIGIN: z
      .string()
      .transform((val) =>
        val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url())),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Optional: enables platform course generation via AI SDK (`apps/server`). */

    AI_GATEWAY_API_KEY: z.string().min(1),
    DEBUG_PERFORMANCE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
