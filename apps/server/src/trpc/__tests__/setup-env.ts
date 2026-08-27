const defaults = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "test-cloudinary-api-key",
  CLOUDINARY_API_SECRET: "test-cloudinary-api-secret",
  BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-chars",
  BETTER_AUTH_URL: "http://localhost:3001",
  BETTER_AUTH_API_KEY: "test-api-key",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  LINKEDIN_CLIENT_ID: "test-linkedin-client-id",
  LINKEDIN_CLIENT_SECRET: "test-linkedin-client-secret",
  RESEND_API_KEY: "test-resend-api-key",
  RESEND_EMAIL_FROM: "noreply@test.local",
  RESEND_EMAIL_REPLY_TO: "support@test.local",
  CORS_ORIGIN: "http://localhost:3000,http://localhost:3002",
  AI_GATEWAY_API_KEY: "test-ai-gateway-api-key",
  NODE_ENV: "test",
} as const;

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
