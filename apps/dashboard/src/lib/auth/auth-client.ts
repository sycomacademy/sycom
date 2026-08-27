import { passkeyClient } from "@better-auth/passkey/client";
import { env } from "@sycom/env/web";
import { orgAc, orgRoles, platformAc, platformRoles } from "@sycom/auth/permissions";
import {
  adminClient,
  lastLoginMethodClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { dashClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [
    passkeyClient(),
    lastLoginMethodClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        if (typeof window !== "undefined") {
          window.location.href = "/two-factor";
        }
      },
    }),
    organizationClient({
      ac: orgAc,
      roles: orgRoles,
      teams: { enabled: true },
    }),
    adminClient({
      ac: platformAc,
      roles: platformRoles,
    }),
    dashClient(),
  ],
});
