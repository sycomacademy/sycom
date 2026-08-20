import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { user } from "./auth";
import { course, lesson } from "./course";

export const ENROLLMENT_STATUSES = ["active", "completed", "dropped"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const LESSON_PROGRESS_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

export const enrollmentAccessSourceEnum = pgEnum("enrollment_access_source", [
  "paid",
  "org_grant",
  "admin_grant",
  "free",
]);
export type EnrollmentAccessSource = (typeof enrollmentAccessSourceEnum.enumValues)[number];

export const enrollment = pgTable(
  "enrollment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `enr_${crypto.randomUUID()}`),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessSource: enrollmentAccessSourceEnum("access_source").default("free").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: ENROLLMENT_STATUSES }).default("active").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("enrollment_course_id_idx").on(table.courseId),
    index("enrollment_user_id_idx").on(table.userId),
    uniqueIndex("enrollment_course_user_uidx").on(table.courseId, table.userId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `lpr_${crypto.randomUUID()}`),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    status: text("status", { enum: LESSON_PROGRESS_STATUSES }).default("not_started").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    lastViewedAt: timestamp("last_viewed_at"),
    bestScore: integer("best_score"),
    latestScore: integer("latest_score"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    draftAnswers: jsonb("draft_answers"),
    /** Exam session flags (tab blur, fullscreen exit); copied to `lesson_attempt` on submit. */
    examIntegrityEvents: jsonb("exam_integrity_events"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("lesson_progress_enrollment_id_idx").on(table.enrollmentId),
    index("lesson_progress_lesson_id_idx").on(table.lessonId),
    uniqueIndex("lesson_progress_enrollment_lesson_uidx").on(table.enrollmentId, table.lessonId),
  ],
);

export const lessonAttempt = pgTable(
  "lesson_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `lat_${crypto.randomUUID()}`),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    score: integer("score").notNull(),
    maxScore: integer("max_score").notNull(),
    passed: boolean("passed").default(false).notNull(),
    answers: jsonb("answers").notNull(),
    /** Snapshot of `lesson_progress.exam_integrity_events` at submit time (exams). */
    integrityEvents: jsonb("integrity_events"),
    submittedAt: timestamp("submitted_at").notNull(),
    createdAt,
  },
  (table) => [
    index("lesson_attempt_enrollment_id_idx").on(table.enrollmentId),
    index("lesson_attempt_lesson_id_idx").on(table.lessonId),
    uniqueIndex("lesson_attempt_enrollment_lesson_attempt_uidx").on(
      table.enrollmentId,
      table.lessonId,
      table.attemptNumber,
    ),
  ],
);

export const certificate = pgTable(
  "certificate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `crt_${crypto.randomUUID()}`),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certificateNumber: text("certificate_number").notNull().unique(),
    issuedAt: timestamp("issued_at").notNull(),
    /** Last time the certificate PDF was emailed to the learner (null = never sent). */
    emailSentAt: timestamp("email_sent_at"),
    /** Address the certificate was last emailed to. */
    emailSentTo: text("email_sent_to"),
    metadata: jsonb("metadata"),
    createdAt,
  },
  (table) => [
    index("certificate_enrollment_id_idx").on(table.enrollmentId),
    index("certificate_course_id_idx").on(table.courseId),
    index("certificate_user_id_idx").on(table.userId),
    uniqueIndex("certificate_enrollment_uidx").on(table.enrollmentId),
  ],
);

export const enrollmentRelations = relations(enrollment, ({ one, many }) => ({
  course: one(course, { fields: [enrollment.courseId], references: [course.id] }),
  user: one(user, { fields: [enrollment.userId], references: [user.id] }),
  lessonProgresses: many(lessonProgress),
  lessonAttempts: many(lessonAttempt),
  certificates: many(certificate),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  enrollment: one(enrollment, {
    fields: [lessonProgress.enrollmentId],
    references: [enrollment.id],
  }),
  lesson: one(lesson, { fields: [lessonProgress.lessonId], references: [lesson.id] }),
}));

export const lessonAttemptRelations = relations(lessonAttempt, ({ one }) => ({
  enrollment: one(enrollment, {
    fields: [lessonAttempt.enrollmentId],
    references: [enrollment.id],
  }),
  lesson: one(lesson, { fields: [lessonAttempt.lessonId], references: [lesson.id] }),
}));

export const certificateRelations = relations(certificate, ({ one }) => ({
  enrollment: one(enrollment, { fields: [certificate.enrollmentId], references: [enrollment.id] }),
  course: one(course, { fields: [certificate.courseId], references: [course.id] }),
  user: one(user, { fields: [certificate.userId], references: [user.id] }),
}));

export type Enrollment = typeof enrollment.$inferSelect;
export type NewEnrollment = typeof enrollment.$inferInsert;

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;

export type LessonAttempt = typeof lessonAttempt.$inferSelect;
export type NewLessonAttempt = typeof lessonAttempt.$inferInsert;

export type Certificate = typeof certificate.$inferSelect;
export type NewCertificate = typeof certificate.$inferInsert;
