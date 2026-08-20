import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "..";
import { cohort, cohort_member, member, user, type OrganizationRole } from "../schema/auth";
import type {
  MemberMetadata,
  OrgStudentProfileField,
  StudentProfileValues,
} from "../schema/student-profile";
import {
  getOrgStudentProfileFields,
  resolveStudentProfileForMember,
} from "./student-profile-metadata";

export type OrgMemberStatus = "verified" | "unverified" | "banned";

export type OrgMemberCohortRef = {
  id: string;
  name: string;
};

export type ListOrgMembersFilter = {
  organizationId: string;
  limit: number;
  offset: number;
  search?: string;
  roles?: OrganizationRole[];
  statuses?: OrgMemberStatus[];
  sortBy: "name" | "email" | "joinedAt";
  sortDirection: "asc" | "desc";
};

export type OrgMemberRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: OrganizationRole;
  emailVerified: boolean;
  banned: boolean;
  twoFactorEnabled: boolean;
  joinedAt: Date;
  cohorts: OrgMemberCohortRef[];
};

export type ListOrgMembersResult = {
  rows: OrgMemberRow[];
  totalCount: number;
};

export type OrgMemberDetails = OrgMemberRow & {
  organizationId: string;
  studentProfile: StudentProfileValues;
};

const MEMBER_SORT_COLUMNS = {
  name: user.name,
  email: user.email,
  joinedAt: member.createdAt,
} as const;

function buildMemberFilters(input: ListOrgMembersFilter): SQL[] {
  const filters: SQL[] = [eq(member.organizationId, input.organizationId)];

  if (input.search) {
    const pattern = `%${input.search}%`;
    const expr = or(ilike(user.name, pattern), ilike(user.email, pattern));
    if (expr) filters.push(expr);
  }

  if (input.roles && input.roles.length > 0) {
    filters.push(inArray(member.role, input.roles));
  }

  if (input.statuses && input.statuses.length > 0) {
    const statusConds: SQL[] = [];
    if (input.statuses.includes("banned")) {
      statusConds.push(eq(user.banned, true));
    }
    if (input.statuses.includes("unverified")) {
      const expr = and(eq(user.banned, false), eq(user.emailVerified, false));
      if (expr) statusConds.push(expr);
    }
    if (input.statuses.includes("verified")) {
      const expr = and(eq(user.banned, false), eq(user.emailVerified, true));
      if (expr) statusConds.push(expr);
    }
    const combined = or(...statusConds);
    if (combined) filters.push(combined);
  }

  return filters;
}

async function fetchCohortsByUser(
  database: Database,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, OrgMemberCohortRef[]>> {
  if (userIds.length === 0) return new Map();

  const rows = await database
    .select({
      userId: cohort_member.userId,
      id: cohort.id,
      name: cohort.name,
    })
    .from(cohort_member)
    .innerJoin(cohort, eq(cohort.id, cohort_member.teamId))
    .where(and(eq(cohort.organizationId, organizationId), inArray(cohort_member.userId, userIds)))
    .orderBy(asc(cohort.name));

  const map = new Map<string, OrgMemberCohortRef[]>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.userId, list);
  }
  return map;
}

export async function listOrganizationMembers(
  database: Database,
  input: ListOrgMembersFilter,
): Promise<ListOrgMembersResult> {
  const { limit, offset, sortBy, sortDirection } = input;

  const filters = buildMemberFilters(input);
  const where = and(...filters);
  const sortColumn = MEMBER_SORT_COLUMNS[sortBy];
  const orderBy = sortDirection === "desc" ? desc(sortColumn) : asc(sortColumn);

  const [rows, totalRow] = await Promise.all([
    database
      .select({
        memberId: member.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        emailVerified: user.emailVerified,
        banned: sql<boolean>`coalesce(${user.banned}, false)`,
        twoFactorEnabled: sql<boolean>`coalesce(${user.twoFactorEnabled}, false)`,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    database
      .select({ value: count() })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(where),
  ]);

  const cohortsByUser = await fetchCohortsByUser(
    database,
    input.organizationId,
    rows.map((row) => row.userId),
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      cohorts: cohortsByUser.get(row.userId) ?? [],
    })),
    totalCount: totalRow[0]?.value ?? 0,
  };
}

export async function getOrganizationMemberById(
  database: Database,
  input: { organizationId: string; memberId: string },
): Promise<OrgMemberDetails | null> {
  const [row] = await database
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      emailVerified: user.emailVerified,
      banned: sql<boolean>`coalesce(${user.banned}, false)`,
      twoFactorEnabled: sql<boolean>`coalesce(${user.twoFactorEnabled}, false)`,
      joinedAt: member.createdAt,
      metadata: member.metadata,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, input.memberId), eq(member.organizationId, input.organizationId)))
    .limit(1);

  if (!row) return null;

  const [cohortsByUser, fieldDefs] = await Promise.all([
    fetchCohortsByUser(database, input.organizationId, [row.userId]),
    getOrgStudentProfileFields(database, { organizationId: input.organizationId }),
  ]);

  const { metadata: memberMetadata, ...memberRow } = row;

  return {
    ...memberRow,
    organizationId: input.organizationId,
    cohorts: cohortsByUser.get(row.userId) ?? [],
    studentProfile: resolveStudentProfileForMember(
      fieldDefs,
      (memberMetadata ?? {}) as MemberMetadata,
    ),
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type OrgMemberExportRow = OrgMemberRow & {
  studentProfile: StudentProfileValues;
};

export type OrgMemberExportResult = {
  /** Field definitions in display order; the export turns each into a column. */
  fields: OrgStudentProfileField[];
  rows: OrgMemberExportRow[];
};

/**
 * Every member of an organization with their cohorts and student-profile values,
 * unpaginated and unfiltered — an export is a snapshot of the whole roster, not of
 * whatever the table happened to be showing.
 *
 * The field definitions come back alongside the rows because profile fields are
 * per-organization and stored as free-form metadata: the caller needs them to know
 * which columns exist and what to label them.
 */
export async function listOrganizationMembersForExport(
  database: Database,
  input: { organizationId: string },
): Promise<OrgMemberExportResult> {
  const rows = await database
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      emailVerified: user.emailVerified,
      banned: sql<boolean>`coalesce(${user.banned}, false)`,
      twoFactorEnabled: sql<boolean>`coalesce(${user.twoFactorEnabled}, false)`,
      joinedAt: member.createdAt,
      metadata: member.metadata,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, input.organizationId))
    .orderBy(asc(user.name), asc(user.email));

  const [cohortsByUser, fields] = await Promise.all([
    fetchCohortsByUser(
      database,
      input.organizationId,
      rows.map((row) => row.userId),
    ),
    getOrgStudentProfileFields(database, { organizationId: input.organizationId }),
  ]);

  return {
    fields,
    rows: rows.map(({ metadata, ...memberRow }) => ({
      ...memberRow,
      cohorts: cohortsByUser.get(memberRow.userId) ?? [],
      studentProfile: resolveStudentProfileForMember(fields, (metadata ?? {}) as MemberMetadata),
    })),
  };
}
