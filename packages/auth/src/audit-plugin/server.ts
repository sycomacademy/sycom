import { createAuthMiddleware, getIP } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { createHash } from "node:crypto";
import * as z from "zod";
import { db } from "@sycom/db";
import { recordAuditEvent } from "@sycom/db/queries/index";

// ---------------------------------------------------------------------------
// Canonical non-security audit event list
// (https://better-auth.com/docs/infrastructure/plugins/audit-logs#tracked-events)
// ---------------------------------------------------------------------------
export const AUDIT_EVENTS = {
  // User
  USER_SIGNED_UP: "user_signed_up",
  USER_PROFILE_UPDATED: "user_profile_updated",
  USER_PROFILE_IMAGE_UPDATED: "user_profile_image_updated",
  USER_EMAIL_VERIFIED: "user_email_verified",
  USER_BANNED: "user_banned",
  USER_UNBANNED: "user_unbanned",
  USER_DELETED: "user_deleted",
  // Session
  USER_SIGNED_IN: "user_signed_in",
  USER_SIGNED_OUT: "user_signed_out",
  SESSION_CREATED: "session_created",
  SESSION_REVOKED: "session_revoked",
  SESSIONS_REVOKED_ALL: "sessions_revoked_all",
  USER_IMPERSONATED: "user_impersonated",
  USER_IMPERSONATION_STOPPED: "user_impersonation_stopped",
  // Account
  ACCOUNT_LINKED: "account_linked",
  ACCOUNT_UNLINKED: "account_unlinked",
  PASSWORD_CHANGED: "password_changed",
  // Verification
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  EMAIL_VERIFICATION_SENT: "email_verification_sent",
  // Organization
  ORGANIZATION_CREATED: "organization_created",
  ORGANIZATION_UPDATED: "organization_updated",
  MEMBER_ADDED: "member_added",
  MEMBER_REMOVED: "member_removed",
  MEMBER_ROLE_UPDATED: "member_role_updated",
  MEMBER_INVITED: "member_invited",
  INVITE_ACCEPTED: "invite_accepted",
  INVITE_REJECTED: "invite_rejected",
  INVITE_CANCELLED: "invite_cancelled",
  TEAM_CREATED: "team_created",
  TEAM_UPDATED: "team_updated",
  TEAM_DELETED: "team_deleted",
  TEAM_MEMBER_ADDED: "team_member_added",
  TEAM_MEMBER_REMOVED: "team_member_removed",
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

// Human-readable label and subtitle for each event type.
export const AUDIT_EVENT_META: Record<
  AuditEventType,
  { title: string; subtitle: (data: Record<string, unknown>) => string }
> = {
  user_signed_up: {
    title: "User Signed Up",
    subtitle: (d) => `${d.userName ?? d.userEmail ?? "Unknown"} registered`,
  },
  user_profile_updated: {
    title: "Profile Updated",
    subtitle: (d) => `${d.userName ?? "Unknown"} updated their profile`,
  },
  user_profile_image_updated: {
    title: "Profile Image Updated",
    subtitle: (d) => `${d.userName ?? "Unknown"} changed their avatar`,
  },
  user_email_verified: {
    title: "Email Verified",
    subtitle: (d) => `${d.userName ?? d.userEmail ?? "Unknown"} verified their email`,
  },
  user_banned: {
    title: "User Banned",
    subtitle: (d) => `${d.userName ?? "Unknown"} was banned`,
  },
  user_unbanned: {
    title: "User Unbanned",
    subtitle: (d) => `${d.userName ?? "Unknown"} was unbanned`,
  },
  user_deleted: {
    title: "User Deleted",
    subtitle: (d) => `${d.userName ?? "Unknown"} was deleted`,
  },
  user_signed_in: {
    title: "User Signed In",
    subtitle: (d) => `${d.userName ?? d.userEmail ?? "Unknown"} signed in`,
  },
  user_signed_out: {
    title: "User Signed Out",
    subtitle: (d) => `${d.userName ?? "Unknown"} signed out`,
  },
  session_created: {
    title: "Session Created",
    subtitle: (d) => `Session created for ${d.userName ?? "Unknown"}`,
  },
  session_revoked: {
    title: "Session Revoked",
    subtitle: (d) => `Session revoked for ${d.userName ?? "Unknown"}`,
  },
  sessions_revoked_all: {
    title: "All Sessions Revoked",
    subtitle: (d) => `All sessions revoked for ${d.userName ?? "Unknown"}`,
  },
  user_impersonated: {
    title: "User Impersonated",
    subtitle: (d) => `Admin impersonating ${d.userName ?? "Unknown"}`,
  },
  user_impersonation_stopped: {
    title: "Impersonation Stopped",
    subtitle: (d) => `Admin stopped impersonating ${d.userName ?? "Unknown"}`,
  },
  account_linked: {
    title: "Account Linked",
    subtitle: (d) => `${d.userName ?? "Unknown"} linked ${d.provider ?? "external"} account`,
  },
  account_unlinked: {
    title: "Account Unlinked",
    subtitle: (d) => `${d.userName ?? "Unknown"} unlinked ${d.provider ?? "external"} account`,
  },
  password_changed: {
    title: "Password Changed",
    subtitle: (d) => `${d.userName ?? "Unknown"} changed their password`,
  },
  password_reset_requested: {
    title: "Password Reset Requested",
    subtitle: (d) => `${d.userName ?? d.userEmail ?? "Unknown"} requested a password reset`,
  },
  password_reset_completed: {
    title: "Password Reset Completed",
    subtitle: (d) => `${d.userName ?? d.userEmail ?? "Unknown"} completed a password reset`,
  },
  email_verification_sent: {
    title: "Verification Email Sent",
    subtitle: (d) => `Verification email sent to ${d.userEmail ?? "Unknown"}`,
  },
  organization_created: {
    title: "Organization Created",
    subtitle: (d) => `${d.organizationName ?? "Unknown"} was created`,
  },
  organization_updated: {
    title: "Organization Updated",
    subtitle: (d) => `${d.organizationName ?? "Unknown"} was updated`,
  },
  member_added: {
    title: "Member Added",
    subtitle: (d) => `${d.userName ?? "Unknown"} added to ${d.organizationName ?? "organization"}`,
  },
  member_removed: {
    title: "Member Removed",
    subtitle: (d) =>
      `${d.userName ?? "Unknown"} removed from ${d.organizationName ?? "organization"}`,
  },
  member_role_updated: {
    title: "Member Role Updated",
    subtitle: (d) => `${d.userName ?? "Unknown"}'s role was updated`,
  },
  member_invited: {
    title: "Member Invited",
    subtitle: (d) => `${d.inviteeEmail ?? "Unknown"} was invited`,
  },
  invite_accepted: {
    title: "Invite Accepted",
    subtitle: (d) => `${d.userName ?? "Unknown"} accepted an invitation`,
  },
  invite_rejected: {
    title: "Invite Rejected",
    subtitle: (d) => `${d.userName ?? "Unknown"} rejected an invitation`,
  },
  invite_cancelled: {
    title: "Invite Cancelled",
    subtitle: (d) => `Invitation for ${d.inviteeEmail ?? "Unknown"} was cancelled`,
  },
  team_created: {
    title: "Team Created",
    subtitle: (d) => `Team ${d.teamName ?? "Unknown"} was created`,
  },
  team_updated: {
    title: "Team Updated",
    subtitle: (d) => `Team ${d.teamName ?? "Unknown"} was updated`,
  },
  team_deleted: {
    title: "Team Deleted",
    subtitle: (d) => `Team ${d.teamName ?? "Unknown"} was deleted`,
  },
  team_member_added: {
    title: "Team Member Added",
    subtitle: (d) => `${d.userName ?? "Unknown"} added to team ${d.teamName ?? "Unknown"}`,
  },
  team_member_removed: {
    title: "Team Member Removed",
    subtitle: (d) => `${d.userName ?? "Unknown"} removed from team ${d.teamName ?? "Unknown"}`,
  },
};

// ---------------------------------------------------------------------------
// Zod schemas for request bodies — mirrors the actual Better Auth endpoint schemas
// so ctx.body is parsed safely instead of cast with `as`.
// ---------------------------------------------------------------------------

const revokeSessionBody = z.object({ token: z.string().optional() });
const impersonateBody = z.object({ userId: z.string().optional() });
const banUserBody = z.object({
  userId: z.string().optional(),
  banReason: z.string().optional(),
});
const targetUserBody = z.object({ userId: z.string().optional() });
const passwordResetBody = z.object({ email: z.string().optional() });
const sendVerificationBody = z.object({ email: z.string().optional() });
const socialLinkBody = z.object({ provider: z.string().optional() });
const unlinkBody = z.object({ providerId: z.string().optional() });

const createOrgBody = z.object({ name: z.string().optional(), slug: z.string().optional() });
const updateOrgBody = z.object({
  organizationId: z.string().optional(),
  data: z.object({ name: z.string().optional() }).optional(),
});
const addMemberBody = z.object({
  organizationId: z.string().optional(),
  userId: z.string().optional(),
});
const removeMemberBody = z.object({
  organizationId: z.string().optional(),
  memberIdOrEmail: z.string().optional(),
});
const updateMemberRoleBody = z.object({
  organizationId: z.string().optional(),
  memberId: z.string().optional(),
  role: z.string().optional(),
});
const inviteMemberBody = z.object({
  organizationId: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
});
const cancelInviteBody = z.object({ invitationId: z.string().optional() });

const createTeamBody = z.object({
  name: z.string().optional(),
  organizationId: z.string().optional(),
});
const updateTeamBody = z.object({
  teamId: z.string().optional(),
  data: z.object({ name: z.string().optional() }).optional(),
});
const teamIdBody = z.object({ teamId: z.string().optional() });
const teamMemberBody = z.object({
  memberId: z.string().optional(),
  teamId: z.string().optional(),
});

// Zod schemas for ctx.context.returned values
const orgReturned = z.object({ id: z.string(), name: z.string() });
const teamReturned = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string(),
});

// ---------------------------------------------------------------------------
// Internal write helper — swallows errors so audit failures never break auth
// ---------------------------------------------------------------------------

type AuditRecord = {
  event: AuditEventType;
  eventTitle: string;
  eventSubtitle: string;
  actorId: string | null;
  actorType: "user" | "system";
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata: Record<string, unknown>;
};

async function write(record: AuditRecord) {
  try {
    await recordAuditEvent(db, record);
  } catch {
    // Audit log failures must never break auth flows
  }
}

// ---------------------------------------------------------------------------
// Better Auth plugin
// ---------------------------------------------------------------------------

export const auditPlugin = () =>
  ({
    id: "auditPlugin",
    hooks: {
      after: [
        // ---- user_signed_up ------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            // ctx.context.newSession is set by Better Auth after successful sign-up
            const newSession = ctx.context.newSession;
            if (!newSession) return;
            const { user } = newSession;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
            };
            await write({
              event: AUDIT_EVENTS.USER_SIGNED_UP,
              eventTitle: AUDIT_EVENT_META.user_signed_up.title,
              eventSubtitle: AUDIT_EVENT_META.user_signed_up.subtitle(payload),
              actorId: user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_signed_in ------------------------------------------------
        {
          matcher: (ctx) =>
            ctx.path === "/sign-in/email" ||
            ctx.path === "/sign-in/social" ||
            ctx.path === "/sign-in/passkey",
          handler: createAuthMiddleware(async (ctx) => {
            const newSession = ctx.context.newSession;
            if (!newSession) return;
            const { user, session } = newSession;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              sessionId: session.id,
              loginMethod: ctx.path.split("/").at(-1) ?? "unknown",
            };
            await write({
              event: AUDIT_EVENTS.USER_SIGNED_IN,
              eventTitle: AUDIT_EVENT_META.user_signed_in.title,
              eventSubtitle: AUDIT_EVENT_META.user_signed_in.subtitle(payload),
              actorId: user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- session_created -----------------------------------------------
        {
          matcher: (ctx) =>
            ctx.path === "/sign-in/email" ||
            ctx.path === "/sign-in/social" ||
            ctx.path === "/sign-in/passkey",
          handler: createAuthMiddleware(async (ctx) => {
            const newSession = ctx.context.newSession;
            if (!newSession) return;
            const { user, session } = newSession;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              sessionId: session.id,
            };
            await write({
              event: AUDIT_EVENTS.SESSION_CREATED,
              eventTitle: AUDIT_EVENT_META.session_created.title,
              eventSubtitle: AUDIT_EVENT_META.session_created.subtitle(payload),
              actorId: user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_signed_out -----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/sign-out",
          handler: createAuthMiddleware(async (ctx) => {
            // ctx.context.session is the request's pre-resolved session; still
            // valid here even though sign-out has revoked it from the DB.
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              userName: session.user.name,
              userEmail: session.user.email,
            };
            await write({
              event: AUDIT_EVENTS.USER_SIGNED_OUT,
              eventTitle: AUDIT_EVENT_META.user_signed_out.title,
              eventSubtitle: AUDIT_EVENT_META.user_signed_out.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- session_revoked -----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/revoke-session",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = revokeSessionBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              userName: session.user.name,
              revokedSessionTokenHash:
                body.success && body.data.token
                  ? createHash("sha256").update(body.data.token).digest("hex")
                  : undefined,
            };
            await write({
              event: AUDIT_EVENTS.SESSION_REVOKED,
              eventTitle: AUDIT_EVENT_META.session_revoked.title,
              eventSubtitle: AUDIT_EVENT_META.session_revoked.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- sessions_revoked_all ------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/revoke-sessions",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userId: session.user.id, userName: session.user.name };
            await write({
              event: AUDIT_EVENTS.SESSIONS_REVOKED_ALL,
              eventTitle: AUDIT_EVENT_META.sessions_revoked_all.title,
              eventSubtitle: AUDIT_EVENT_META.sessions_revoked_all.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_impersonated ---------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/admin/impersonate-user",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = impersonateBody.safeParse(ctx.body);
            const targetUserId = body.success ? body.data.userId : undefined;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              adminId: session.user.id,
              adminName: session.user.name,
              targetUserId,
              userName: targetUserId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.USER_IMPERSONATED,
              eventTitle: AUDIT_EVENT_META.user_impersonated.title,
              eventSubtitle: AUDIT_EVENT_META.user_impersonated.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_impersonation_stopped ------------------------------------
        {
          matcher: (ctx) => ctx.path === "/admin/stop-impersonating",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              userName: session.user.name,
            };
            await write({
              event: AUDIT_EVENTS.USER_IMPERSONATION_STOPPED,
              eventTitle: AUDIT_EVENT_META.user_impersonation_stopped.title,
              eventSubtitle: AUDIT_EVENT_META.user_impersonation_stopped.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- password_changed ----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/change-password",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userId: session.user.id, userName: session.user.name };
            await write({
              event: AUDIT_EVENTS.PASSWORD_CHANGED,
              eventTitle: AUDIT_EVENT_META.password_changed.title,
              eventSubtitle: AUDIT_EVENT_META.password_changed.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- password_reset_requested --------------------------------------
        {
          matcher: (ctx) => ctx.path === "/request-password-reset",
          handler: createAuthMiddleware(async (ctx) => {
            const body = passwordResetBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userEmail: body.success ? body.data.email : undefined };
            await write({
              event: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
              eventTitle: AUDIT_EVENT_META.password_reset_requested.title,
              eventSubtitle: AUDIT_EVENT_META.password_reset_requested.subtitle(payload),
              actorId: null,
              actorType: "system",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- password_reset_completed --------------------------------------
        {
          matcher: (ctx) => ctx.path === "/reset-password",
          handler: createAuthMiddleware(async (ctx) => {
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload: Record<string, unknown> = {};
            await write({
              event: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
              eventTitle: AUDIT_EVENT_META.password_reset_completed.title,
              eventSubtitle: AUDIT_EVENT_META.password_reset_completed.subtitle(payload),
              actorId: null,
              actorType: "system",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- email_verification_sent ---------------------------------------
        {
          matcher: (ctx) => ctx.path === "/send-verification-email",
          handler: createAuthMiddleware(async (ctx) => {
            const body = sendVerificationBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userEmail: body.success ? body.data.email : undefined };
            await write({
              event: AUDIT_EVENTS.EMAIL_VERIFICATION_SENT,
              eventTitle: AUDIT_EVENT_META.email_verification_sent.title,
              eventSubtitle: AUDIT_EVENT_META.email_verification_sent.subtitle(payload),
              actorId: null,
              actorType: "system",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_email_verified ------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/verify-email",
          handler: createAuthMiddleware(async (ctx) => {
            // verify-email creates a new session on success
            const newSession = ctx.context.newSession;
            if (!newSession) return;
            const { user } = newSession;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
            };
            await write({
              event: AUDIT_EVENTS.USER_EMAIL_VERIFIED,
              eventTitle: AUDIT_EVENT_META.user_email_verified.title,
              eventSubtitle: AUDIT_EVENT_META.user_email_verified.subtitle(payload),
              actorId: user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- account_linked -----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/link-social" || ctx.path === "/sign-in/social",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = socialLinkBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              userName: session.user.name,
              provider: body.success ? body.data.provider : undefined,
            };
            await write({
              event: AUDIT_EVENTS.ACCOUNT_LINKED,
              eventTitle: AUDIT_EVENT_META.account_linked.title,
              eventSubtitle: AUDIT_EVENT_META.account_linked.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- account_unlinked ---------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/unlink-account",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = unlinkBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              userName: session.user.name,
              provider: body.success ? body.data.providerId : undefined,
            };
            await write({
              event: AUDIT_EVENTS.ACCOUNT_UNLINKED,
              eventTitle: AUDIT_EVENT_META.account_unlinked.title,
              eventSubtitle: AUDIT_EVENT_META.account_unlinked.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_banned ---------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/admin/ban-user",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            const body = banUserBody.safeParse(ctx.body);
            const targetUserId = body.success ? body.data.userId : undefined;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              adminId: session?.user?.id,
              targetUserId,
              banReason: body.success ? body.data.banReason : undefined,
              userName: targetUserId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.USER_BANNED,
              eventTitle: AUDIT_EVENT_META.user_banned.title,
              eventSubtitle: AUDIT_EVENT_META.user_banned.subtitle(payload),
              actorId: session?.user?.id ?? null,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_unbanned -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/admin/unban-user",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            const body = targetUserBody.safeParse(ctx.body);
            const targetUserId = body.success ? body.data.userId : undefined;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              adminId: session?.user?.id,
              targetUserId,
              userName: targetUserId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.USER_UNBANNED,
              eventTitle: AUDIT_EVENT_META.user_unbanned.title,
              eventSubtitle: AUDIT_EVENT_META.user_unbanned.subtitle(payload),
              actorId: session?.user?.id ?? null,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- user_deleted -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/admin/remove-user",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            const body = targetUserBody.safeParse(ctx.body);
            const targetUserId = body.success ? body.data.userId : undefined;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              adminId: session?.user?.id,
              targetUserId,
              userName: targetUserId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.USER_DELETED,
              eventTitle: AUDIT_EVENT_META.user_deleted.title,
              eventSubtitle: AUDIT_EVENT_META.user_deleted.subtitle(payload),
              actorId: session?.user?.id ?? null,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- organization_created -----------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/create",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            // ctx.context.returned is the created organization object from BA
            const returned = orgReturned.safeParse(ctx.context.returned);
            const org = returned.success ? returned.data : undefined;
            const body = createOrgBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              userId: session.user.id,
              organizationId: org?.id,
              organizationName: org?.name ?? (body.success ? body.data.name : undefined),
            };
            await write({
              event: AUDIT_EVENTS.ORGANIZATION_CREATED,
              eventTitle: AUDIT_EVENT_META.organization_created.title,
              eventSubtitle: AUDIT_EVENT_META.organization_created.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: org?.id ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- organization_updated -----------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/update",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = updateOrgBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId = body.success ? body.data.organizationId : undefined;
            const payload = {
              userId: session.user.id,
              organizationId,
              organizationName: body.success ? body.data.data?.name : undefined,
            };
            await write({
              event: AUDIT_EVENTS.ORGANIZATION_UPDATED,
              eventTitle: AUDIT_EVENT_META.organization_updated.title,
              eventSubtitle: AUDIT_EVENT_META.organization_updated.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- member_added -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/add-member",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = addMemberBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId = body.success ? body.data.organizationId : undefined;
            const userId = body.success ? body.data.userId : undefined;
            const payload = {
              actorId: session.user.id,
              userId,
              userName: userId ?? "Unknown",
              organizationId,
            };
            await write({
              event: AUDIT_EVENTS.MEMBER_ADDED,
              eventTitle: AUDIT_EVENT_META.member_added.title,
              eventSubtitle: AUDIT_EVENT_META.member_added.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- member_removed -----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/remove-member",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = removeMemberBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId = body.success ? body.data.organizationId : undefined;
            const memberIdOrEmail = body.success ? body.data.memberIdOrEmail : undefined;
            const payload = {
              actorId: session.user.id,
              memberIdOrEmail,
              userName: memberIdOrEmail ?? "Unknown",
              organizationId,
            };
            await write({
              event: AUDIT_EVENTS.MEMBER_REMOVED,
              eventTitle: AUDIT_EVENT_META.member_removed.title,
              eventSubtitle: AUDIT_EVENT_META.member_removed.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- member_role_updated ------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/update-member-role",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = updateMemberRoleBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId = body.success ? body.data.organizationId : undefined;
            const memberId = body.success ? body.data.memberId : undefined;
            const payload = {
              actorId: session.user.id,
              memberId,
              userName: memberId ?? "Unknown",
              role: body.success ? body.data.role : undefined,
              organizationId,
            };
            await write({
              event: AUDIT_EVENTS.MEMBER_ROLE_UPDATED,
              eventTitle: AUDIT_EVENT_META.member_role_updated.title,
              eventSubtitle: AUDIT_EVENT_META.member_role_updated.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- member_invited -----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/invite-member",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = inviteMemberBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId = body.success ? body.data.organizationId : undefined;
            const payload = {
              actorId: session.user.id,
              inviteeEmail: body.success ? body.data.email : undefined,
              role: body.success ? body.data.role : undefined,
              organizationId,
            };
            await write({
              event: AUDIT_EVENTS.MEMBER_INVITED,
              eventTitle: AUDIT_EVENT_META.member_invited.title,
              eventSubtitle: AUDIT_EVENT_META.member_invited.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- invite_accepted ----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/accept-invitation",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userId: session.user.id, userName: session.user.name };
            await write({
              event: AUDIT_EVENTS.INVITE_ACCEPTED,
              eventTitle: AUDIT_EVENT_META.invite_accepted.title,
              eventSubtitle: AUDIT_EVENT_META.invite_accepted.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- invite_rejected ----------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/reject-invitation",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = { userId: session.user.id, userName: session.user.name };
            await write({
              event: AUDIT_EVENTS.INVITE_REJECTED,
              eventTitle: AUDIT_EVENT_META.invite_rejected.title,
              eventSubtitle: AUDIT_EVENT_META.invite_rejected.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- invite_cancelled --------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/cancel-invitation",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = cancelInviteBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const payload = {
              actorId: session.user.id,
              invitationId: body.success ? body.data.invitationId : undefined,
            };
            await write({
              event: AUDIT_EVENTS.INVITE_CANCELLED,
              eventTitle: AUDIT_EVENT_META.invite_cancelled.title,
              eventSubtitle: AUDIT_EVENT_META.invite_cancelled.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- team_created -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/create-team",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = createTeamBody.safeParse(ctx.body);
            // ctx.context.returned is the created team object from BA
            const returned = teamReturned.safeParse(ctx.context.returned);
            const team = returned.success ? returned.data : undefined;
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const organizationId =
              team?.organizationId ?? (body.success ? body.data.organizationId : undefined);
            const payload = {
              actorId: session.user.id,
              teamId: team?.id,
              teamName: team?.name ?? (body.success ? body.data.name : undefined),
              organizationId,
            };
            await write({
              event: AUDIT_EVENTS.TEAM_CREATED,
              eventTitle: AUDIT_EVENT_META.team_created.title,
              eventSubtitle: AUDIT_EVENT_META.team_created.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              organizationId: organizationId ?? null,
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- team_updated -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/update-team",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = updateTeamBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const teamId = body.success ? body.data.teamId : undefined;
            const payload = {
              actorId: session.user.id,
              teamId,
              teamName: body.success ? body.data.data?.name : undefined,
            };
            await write({
              event: AUDIT_EVENTS.TEAM_UPDATED,
              eventTitle: AUDIT_EVENT_META.team_updated.title,
              eventSubtitle: AUDIT_EVENT_META.team_updated.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- team_deleted -------------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/remove-team",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = teamIdBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const teamId = body.success ? body.data.teamId : undefined;
            const payload = {
              actorId: session.user.id,
              teamId,
              teamName: teamId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.TEAM_DELETED,
              eventTitle: AUDIT_EVENT_META.team_deleted.title,
              eventSubtitle: AUDIT_EVENT_META.team_deleted.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- team_member_added -------------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/add-team-member",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = teamMemberBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const memberId = body.success ? body.data.memberId : undefined;
            const teamId = body.success ? body.data.teamId : undefined;
            const payload = {
              actorId: session.user.id,
              memberId,
              userName: memberId ?? "Unknown",
              teamId,
              teamName: teamId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.TEAM_MEMBER_ADDED,
              eventTitle: AUDIT_EVENT_META.team_member_added.title,
              eventSubtitle: AUDIT_EVENT_META.team_member_added.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },

        // ---- team_member_removed -----------------------------------------
        {
          matcher: (ctx) => ctx.path === "/organization/remove-team-member",
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session;
            if (!session?.user?.id) return;
            const body = teamMemberBody.safeParse(ctx.body);
            const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
            const ua = ctx.request?.headers.get("user-agent") ?? null;
            const memberId = body.success ? body.data.memberId : undefined;
            const teamId = body.success ? body.data.teamId : undefined;
            const payload = {
              actorId: session.user.id,
              memberId,
              userName: memberId ?? "Unknown",
              teamId,
              teamName: teamId ?? "Unknown",
            };
            await write({
              event: AUDIT_EVENTS.TEAM_MEMBER_REMOVED,
              eventTitle: AUDIT_EVENT_META.team_member_removed.title,
              eventSubtitle: AUDIT_EVENT_META.team_member_removed.subtitle(payload),
              actorId: session.user.id,
              actorType: "user",
              ip,
              userAgent: ua,
              metadata: payload,
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
