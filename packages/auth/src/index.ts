import { createDb } from "@sycom/db";
import * as schema from "@sycom/db/schema/auth";
import { profile } from "@sycom/db/schema/profile";
import { env } from "@sycom/env/server";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod, organization } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import { orgAc, orgRoles, platformAc, platformRoles } from "./permissions";
import type { UserRole } from "@sycom/db/schema/auth";
import { dash } from "@better-auth/infra";
import { betterAuthLogger, sendResetPasswordEmail, sendVerificationEmail } from "./config";
import { auditPlugin } from "./audit-plugin/server";

function sharedCookieDomain(left: string, right: string): string | undefined {
  if (left === right) {
    return undefined;
  }
  if (left.endsWith(`.${right}`)) {
    return right;
  }
  if (right.endsWith(`.${left}`)) {
    return left;
  }

  const leftLabels = left.split(".");
  const rightLabels = right.split(".");
  const max = Math.min(leftLabels.length, rightLabels.length);
  for (let size = 2; size <= max; size++) {
    const suffix = leftLabels.slice(-size).join(".");
    if (suffix === rightLabels.slice(-size).join(".")) {
      return suffix;
    }
  }
  return undefined;
}

function cookieSiteSettings(dashboardUrl: string | undefined, authUrl: string) {
  const authHost = new URL(authUrl).hostname;
  const dashboardHost = dashboardUrl ? new URL(dashboardUrl).hostname : authHost;
  const parentDomain = sharedCookieDomain(dashboardHost, authHost);

  if (parentDomain && env.NODE_ENV === "production") {
    return {
      sameSite: "lax" as const,
      crossSubDomainCookies: { enabled: true as const, domain: parentDomain },
    };
  }

  if (dashboardHost !== authHost && env.NODE_ENV === "production") {
    return {
      sameSite: "none" as const,
      crossSubDomainCookies: { enabled: false as const },
    };
  }

  return {
    sameSite: "lax" as const,
    crossSubDomainCookies: { enabled: false as const },
  };
}

export function createAuth() {
  const db = createDb();
  const passkeyOrigin = env.DASHBOARD_URL ?? env.BETTER_AUTH_URL;
  const passkeyRpId = new URL(passkeyOrigin).hostname;
  const cookieSettings = cookieSiteSettings(env.DASHBOARD_URL, env.BETTER_AUTH_URL);

  return betterAuth({
    appName: "Sycom",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.CORS_ORIGIN,
    advanced: {
      defaultCookieAttributes: {
        sameSite: cookieSettings.sameSite,
        httpOnly: true,
      },
      useSecureCookies: env.NODE_ENV === "production",
      crossSubDomainCookies: cookieSettings.crossSubDomainCookies,
      ipAddressHeaders:
        env.NODE_ENV === "production"
          ? ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for"]
          : ["x-forwarded-for"],
    },
    experimental: {
      joins: true,
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "linkedin"],
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      // Disable cookie cache to avoid getSession returning null in API routes (better-auth#7008)
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({
        user,
        url,
      }: {
        url: string;
        user: { email: string; name?: string | null };
      }) => {
        await sendResetPasswordEmail(user, url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        url: string;
        user: { email: string; name?: string | null };
      }) => {
        await sendVerificationEmail(user, url);
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 3 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60 * 60, max: 3 },
        "/reset-password": { window: 60 * 60, max: 5 },
        "/change-password": { window: 60 * 60, max: 5 },
        "/revoke-session": { window: 60 * 60, max: 30 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser: { id: string }) => {
            await db.insert(profile).values({
              userId: createdUser.id,
            });
          },
        },
      },
    },
    ...betterAuthLogger,
    plugins: [
      organization({
        ac: orgAc,
        roles: orgRoles,
        creatorRole: "owner",
        allowUserToCreateOrganization: async (user) => {
          const role = user.role as UserRole;
          return role === "platform_admin";
        },
        teams: {
          enabled: true,
        },
        schema: {
          team: { modelName: "cohort" },
          teamMember: { modelName: "cohort_member" },
        },
      }),
      admin({
        ac: platformAc,
        roles: platformRoles,
        defaultRole: "public_student",
      }),
      passkey({
        rpID: passkeyRpId,
        rpName: "Sycom LMS",
        origin: passkeyOrigin,
      }),
      lastLoginMethod(),
      twoFactor({
        issuer: "Sycom LMS",
      }),
      dash(),
      auditPlugin(),
    ],
  });
}

export const auth = createAuth();
