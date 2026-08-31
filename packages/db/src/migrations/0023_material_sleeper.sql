ALTER TABLE "auth"."account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "auth"."account" SET "issuer" = CASE WHEN "provider_id" = 'credential' THEN 'local:credential' ELSE 'local:oauth:' || "provider_id" END WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "auth"."account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_idx" ON "auth"."account" USING btree ("issuer","account_id");
