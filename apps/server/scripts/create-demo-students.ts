/**
 * One-off: create 10 demo student accounts for a live demo.
 *
 *   cd apps/server && bun --env-file=.env.prod scripts/create-demo-students.ts
 *
 * Idempotent: re-running resets the password / re-verifies existing demo users,
 * leaves existing org membership untouched, and re-applies student profile values.
 */
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { createDb } from "@sycom/db";
import { insertOrganizationMember } from "@sycom/db/queries/organization-invitations";
import {
  getOrgStudentProfileFields,
  replaceOrgStudentProfileFields,
  updateMemberStudentProfileValues,
} from "@sycom/db/queries/student-profile-metadata";
import { account, member, user } from "@sycom/db/schema/auth";
import { profile } from "@sycom/db/schema/profile";
import { and, eq } from "drizzle-orm";
import type { OrgStudentProfileField } from "@sycom/db/schema/student-profile";

const COUNT = 10;
const DOMAIN = "sycomsolutions.com";

/** "Sycom Internal" — the demo org. */
const DEMO_ORG_ID = "04191197-0b14-4817-9a4c-c1bf10946d97";
const DEMO_ORG_ROLE = "student" as const;

const MATRIC_FIELD: OrgStudentProfileField = {
  id: "matric_id",
  label: "Matric ID",
  type: "text",
  required: false,
  order: 0,
};

const DEMO_USERS = Array.from({ length: COUNT }, (_, index) => {
  const n = index + 1;
  return {
    email: `user${n}@${DOMAIN}`,
    name: `Demo Student ${n}`,
    password: `passworduser${n}`,
    matricId: `user_${n}`,
  };
});

const db = createDb();

function generateUserId(): string {
  return randomUUID().replaceAll("-", "");
}

async function setCredentialPassword(userId: string, password: string) {
  const hashed = await hashPassword(password);
  const credential = await db.query.account.findFirst({
    where: (row, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(row.userId, userId), eqFn(row.providerId, "credential")),
  });

  if (credential) {
    await db.update(account).set({ password: hashed }).where(eq(account.id, credential.id));
    return;
  }

  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashed,
  });
}

/** Add matric_id to the org's student profile fields, preserving any others. */
async function ensureStudentProfileField() {
  const existing = await getOrgStudentProfileFields(db, { organizationId: DEMO_ORG_ID });
  const others = existing.filter((f) => f.id !== MATRIC_FIELD.id);
  const fields = [MATRIC_FIELD, ...others.map((f, i) => ({ ...f, order: i + 1 }))];

  await replaceOrgStudentProfileFields(db, { organizationId: DEMO_ORG_ID, fields });
  console.log(
    `org field ensured: ${MATRIC_FIELD.id} ("${MATRIC_FIELD.label}", ${MATRIC_FIELD.type})`,
  );
}

async function ensureOrgMembership(userId: string, email: string): Promise<string> {
  const existing = await db.query.member.findFirst({
    where: and(eq(member.organizationId, DEMO_ORG_ID), eq(member.userId, userId)),
  });

  if (existing) {
    if (existing.role !== DEMO_ORG_ROLE) {
      await db.update(member).set({ role: DEMO_ORG_ROLE }).where(eq(member.id, existing.id));
      console.log(`  role -> ${DEMO_ORG_ROLE} for ${email}`);
    }
    return existing.id;
  }

  const created = await insertOrganizationMember(db, {
    organizationId: DEMO_ORG_ID,
    userId,
    role: DEMO_ORG_ROLE,
  });
  console.log(`  joined org as ${DEMO_ORG_ROLE}: ${email}`);
  return created.id;
}

async function upsertDemoStudent(input: {
  email: string;
  name: string;
  password: string;
  matricId: string;
}) {
  const existing = await db.query.user.findFirst({ where: eq(user.email, input.email) });
  let userId: string;

  if (existing) {
    await db
      .update(user)
      .set({
        name: input.name,
        role: "public_student",
        emailVerified: true,
        banned: false,
        banReason: null,
        banExpires: null,
      })
      .where(eq(user.id, existing.id));
    await setCredentialPassword(existing.id, input.password);

    const hasProfile = await db.query.profile.findFirst({
      where: eq(profile.userId, existing.id),
    });
    if (!hasProfile) await db.insert(profile).values({ userId: existing.id });

    userId = existing.id;
    console.log(`updated  ${input.email}`);
  } else {
    userId = generateUserId();

    await db.insert(user).values({
      id: userId,
      email: input.email,
      name: input.name,
      emailVerified: true,
      role: "public_student",
    });
    await setCredentialPassword(userId, input.password);
    await db.insert(profile).values({ userId });

    console.log(`created  ${input.email}`);
  }

  const memberId = await ensureOrgMembership(userId, input.email);

  await updateMemberStudentProfileValues(db, {
    organizationId: DEMO_ORG_ID,
    memberId,
    values: { [MATRIC_FIELD.id]: input.matricId },
  });
  console.log(`  ${MATRIC_FIELD.id} = ${input.matricId}`);
}

async function main() {
  await ensureStudentProfileField();
  console.log("");

  for (const demoUser of DEMO_USERS) {
    await upsertDemoStudent(demoUser);
  }

  console.log("\n=== Demo credentials ===\n");
  for (const { email, password, matricId } of DEMO_USERS) {
    console.log(`  ${email.padEnd(26)} /  ${password.padEnd(15)} (${matricId})`);
  }
  console.log(
    "\nAll verified, platform role: public_student, org member of Sycom Internal as student.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
