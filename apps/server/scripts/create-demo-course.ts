/**
 * One-off: create the demo course in the "Sycom Internal" org.
 *
 *   cd apps/server && bun --env-file=.env.prod scripts/create-demo-course.ts
 *
 * Mirrors the `orgCourse.create` tRPC procedure (same query helpers + audit
 * event), since scripts bypass the router. Curriculum is intentionally left
 * empty — sections/lessons get built in the UI or via the docx import.
 *
 * Idempotent: re-running reports the existing course instead of duplicating.
 */
import { createDb } from "@sycom/db";
import {
  addCourseInstructor,
  createCourse,
  recordApplicationAuditEvent,
} from "@sycom/db/queries/index";
import { user } from "@sycom/db/schema/auth";
import { course } from "@sycom/db/schema/course";
import { and, eq } from "drizzle-orm";

/** "Sycom Internal" — the demo org. */
const DEMO_ORG_ID = "04191197-0b14-4817-9a4c-c1bf10946d97";
/** Org owner — course creator + main instructor. */
const OWNER_EMAIL = "a.shehu@sycomsolutions.com";

const COURSE = {
  title: "LMS Feature Demo",
  slug: "lms-feature-demo",
  description:
    "Walkthrough course for demoing the LMS: question banks, quizzes and exams, and importing/exporting curriculum as Word documents.",
  difficulty: "beginner" as const,
  status: "draft" as const,
};

const db = createDb();

async function main() {
  const owner = await db.query.user.findFirst({ where: eq(user.email, OWNER_EMAIL) });
  if (!owner) throw new Error(`Owner ${OWNER_EMAIL} not found`);

  const existing = await db.query.course.findFirst({
    where: and(eq(course.organizationId, DEMO_ORG_ID), eq(course.slug, COURSE.slug)),
  });
  if (existing) {
    console.log(`course already exists: ${existing.title} (${existing.id}) [${existing.status}]`);
    return;
  }

  const { id: courseId } = await createCourse(db, {
    scope: "organization",
    organizationId: DEMO_ORG_ID,
    title: COURSE.title,
    slug: COURSE.slug,
    description: COURSE.description,
    difficulty: COURSE.difficulty,
    status: COURSE.status,
    createdBy: owner.id,
  });
  console.log(`created course ${COURSE.title} (${courseId}) [${COURSE.status}]`);

  await addCourseInstructor(db, {
    courseId,
    userId: owner.id,
    role: "main",
    addedBy: owner.id,
  });
  console.log(`  main instructor: ${owner.name} <${owner.email}>`);

  await recordApplicationAuditEvent(db, {
    event: "org_course_created",
    eventTitle: "Organization course created",
    eventSubtitle: `${COURSE.title} was added`,
    actorId: owner.id,
    actorType: "user",
    organizationId: DEMO_ORG_ID,
    metadata: {
      courseId,
      courseTitle: COURSE.title,
      courseSlug: COURSE.slug,
      status: COURSE.status,
      difficulty: COURSE.difficulty,
      instructorIds: [owner.id],
      categoryIds: [],
    },
  });

  console.log(
    "\ncurriculum: empty (0 sections, 0 lessons) — build it in the UI or via docx import",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
