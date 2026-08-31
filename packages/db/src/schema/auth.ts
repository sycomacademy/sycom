import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { profile } from "./profile";
import type { InvitationMetadata, MemberMetadata } from "./student-profile";

const auth = pgSchema("auth");

export const userRoleEnum = auth.enum("platform_role", [
  "platform_admin",
  "content_creator",
  "public_student",
]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const organizationRoleEnum = auth.enum("organization_role", [
  "owner",
  "admin",
  "teacher",
  "student",
]);
export type OrganizationRole = (typeof organizationRoleEnum.enumValues)[number];

export const platformInvitationStatusEnum = auth.enum("platform_invitation_status", [
  "pending",
  "accepted",
  "rejected",
  "revoked",
]);
export type PlatformInvitationStatus = (typeof platformInvitationStatusEnum.enumValues)[number];

export const user = auth.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt,
  updatedAt,
  role: userRoleEnum("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = auth.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt,
    updatedAt,
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = auth.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("account_userId_idx").on(table.userId),
    uniqueIndex("account_issuer_accountId_idx").on(table.issuer, table.accountId),
  ],
);

export const verification = auth.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = auth.table(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt,
    onboardedAt: timestamp("onboarded_at"),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const cohort = auth.table(
  "cohort",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    image: text("image"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("cohort_organizationId_idx").on(table.organizationId),
    uniqueIndex("cohort_org_name_uidx").on(table.organizationId, table.name),
  ],
);

export const cohort_member = auth.table(
  "cohort_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt,
  },
  (table) => [
    index("cohort_member_teamId_idx").on(table.teamId),
    index("cohort_member_userId_idx").on(table.userId),
    uniqueIndex("cohort_member_team_user_uidx").on(table.teamId, table.userId),
  ],
);

export const member = auth.table(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: organizationRoleEnum("role").default("student").notNull(),
    metadata: jsonb("metadata")
      .$type<MemberMetadata>()
      .default(sql`'{}'::jsonb`),
    createdAt,
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    uniqueIndex("member_org_user_uidx").on(table.organizationId, table.userId),
  ],
);

export const invitation = auth.table(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: organizationRoleEnum("role"),
    teamId: text("team_id"),
    /** Set for custom org-owner invite emails and token lookup; BA plugin-created rows omit this */
    tokenHash: text("token_hash"),
    /** Display name captured at invite time (owner first + last from admin flow) */
    inviteeName: text("invitee_name"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata")
      .$type<InvitationMetadata>()
      .default(sql`'{}'::jsonb`),
    createdAt,
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
    uniqueIndex("invitation_token_hash_uidx").on(table.tokenHash),
  ],
);

export const platform_invitation = auth.table(
  "platform_invitations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    status: platformInvitationStatusEnum("status").default("pending").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    inviterName: text("inviter_name").notNull(),
    inviterUserId: text("inviter_user_id").references(() => user.id, { onDelete: "set null" }),
    acceptedUserId: text("accepted_user_id").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    rejectedAt: timestamp("rejected_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("platform_invitation_email_idx").on(table.email),
    index("platform_invitation_status_idx").on(table.status),
    index("platform_invitation_inviterUserId_idx").on(table.inviterUserId),
  ],
);

export const passkey = auth.table(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt,
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

export const twoFactor = auth.table(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  cohort_members: many(cohort_member),
  members: many(member),
  invitations: many(invitation),
  platformInvitationsSent: many(platform_invitation, {
    relationName: "platform_invitation_inviter",
  }),
  platformInvitationsAccepted: many(platform_invitation, {
    relationName: "platform_invitation_accepted",
  }),
  passkeys: many(passkey),
  profile: one(profile, {
    fields: [user.id],
    references: [profile.userId],
  }),
  twoFactors: many(twoFactor),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  cohorts: many(cohort),
  members: many(member),
  invitations: many(invitation),
}));

export const cohortRelations = relations(cohort, ({ one, many }) => ({
  organization: one(organization, {
    fields: [cohort.organizationId],
    references: [organization.id],
  }),
  cohort_members: many(cohort_member),
}));

export const cohort_memberRelations = relations(cohort_member, ({ one }) => ({
  cohort: one(cohort, {
    fields: [cohort_member.teamId],
    references: [cohort.id],
  }),
  user: one(user, {
    fields: [cohort_member.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const platformInvitationRelations = relations(platform_invitation, ({ one }) => ({
  inviter: one(user, {
    fields: [platform_invitation.inviterUserId],
    references: [user.id],
    relationName: "platform_invitation_inviter",
  }),
  acceptedUser: one(user, {
    fields: [platform_invitation.acceptedUserId],
    references: [user.id],
    relationName: "platform_invitation_accepted",
  }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;

export type Cohort = typeof cohort.$inferSelect;
export type NewCohort = typeof cohort.$inferInsert;

export type CohortMember = typeof cohort_member.$inferSelect;
export type NewCohortMember = typeof cohort_member.$inferInsert;

export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;

export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;

export type PlatformInvitation = typeof platform_invitation.$inferSelect;
export type NewPlatformInvitation = typeof platform_invitation.$inferInsert;

export type Passkey = typeof passkey.$inferSelect;
export type NewPasskey = typeof passkey.$inferInsert;

export type TwoFactor = typeof twoFactor.$inferSelect;
export type NewTwoFactor = typeof twoFactor.$inferInsert;
