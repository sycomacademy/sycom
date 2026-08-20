import { checkHealth } from "@sycom/db/queries/health";

import { publicProcedure, router } from "../init";
import { adminRouter } from "./admin";
import { courseAiRouter } from "./course-ai";
import { courseImportRouter } from "./course-import";
import { courseRouter } from "./course";
import { creatorRouter } from "./creator";
import { catalogRouter } from "./catalog";
import { enrollmentRouter } from "./enrollment";
import { feedbackRouter } from "./feedback";
import { inviteRouter } from "./invite";
import { learnRouter } from "./learn";
import { onboardingRouter } from "./onboarding";
import { organizationRouter } from "./organization";
import { orgCourseRouter } from "./orgCourse";
import { lessonRouter } from "./lesson";
import { profileRouter } from "./profile";
import { storageRouter } from "./storage";
import { studentRouter } from "./student";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => checkHealth()),
  admin: adminRouter,
  catalog: catalogRouter,
  course: courseRouter,
  courseAi: courseAiRouter,
  courseImport: courseImportRouter,
  creator: creatorRouter,
  enrollment: enrollmentRouter,
  feedback: feedbackRouter,
  invite: inviteRouter,
  lesson: lessonRouter,
  learn: learnRouter,
  onboarding: onboardingRouter,
  organization: organizationRouter,
  orgCourse: orgCourseRouter,
  profile: profileRouter,
  storage: storageRouter,
  student: studentRouter,
});
export type AppRouter = typeof appRouter;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
export type AppRouterInputs = inferRouterInputs<AppRouter>;
