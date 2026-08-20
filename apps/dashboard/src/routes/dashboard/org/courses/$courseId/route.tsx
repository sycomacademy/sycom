import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { FadeIn } from "@/components/layout/motion-fade";
import { useTRPC } from "@/lib/trpc/client";
import { Badge } from "@sycom/ui/components/badge";
import { Button } from "@sycom/ui/components/button";
import { Tabs, TabsList, TabsTab } from "@sycom/ui/components/tabs";

type CourseDetailTabRoute =
  | "/dashboard/org/courses/$courseId"
  | "/dashboard/org/courses/$courseId/curriculum"
  | "/dashboard/org/courses/$courseId/members"
  | "/dashboard/org/courses/$courseId/announcements"
  | "/dashboard/org/courses/$courseId/analytics"
  | "/dashboard/org/courses/$courseId/certificates";

/** Lesson editor is full-width; skip course title + tab bar (see `course/route.tsx` for list-level SecondaryMenu). */
function isLessonEditPath(pathname: string, courseId: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const prefix = `/dashboard/org/courses/${courseId}/curriculum/`;
  return (
    (normalized.startsWith(prefix) && normalized.endsWith("/edit")) ||
    (normalized.startsWith(prefix) && normalized.endsWith("/view"))
  );
}

function getActiveCourseTab(pathname: string, courseId: string): CourseDetailTabRoute {
  const normalized = pathname.replace(/\/+$/, "");
  const base = `/dashboard/org/courses/${courseId}`;

  if (normalized === base) {
    return "/dashboard/org/courses/$courseId";
  }
  if (normalized === `${base}/curriculum`) {
    return "/dashboard/org/courses/$courseId/curriculum";
  }
  if (normalized === `${base}/members`) {
    return "/dashboard/org/courses/$courseId/members";
  }
  if (normalized === `${base}/analytics`) {
    return "/dashboard/org/courses/$courseId/analytics";
  }
  if (normalized === `${base}/announcements`) {
    return "/dashboard/org/courses/$courseId/announcements";
  }

  if (normalized === `${base}/certificates`) {
    return "/dashboard/org/courses/$courseId/certificates";
  }

  return "/dashboard/org/courses/$courseId";
}

export const Route = createFileRoute("/dashboard/org/courses/$courseId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.orgCourse.get.queryOptions({ courseId: params.courseId }),
    );
  },
  component: CourseDetailLayout,
});

function CourseDetailLayout() {
  const { courseId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: course } = useSuspenseQuery(trpc.orgCourse.get.queryOptions({ courseId }));

  const activeTab = getActiveCourseTab(pathname, courseId);
  const hideCourseDetailChrome = isLessonEditPath(pathname, courseId);

  if (hideCourseDetailChrome) {
    return (
      <FadeIn className="flex flex-col" motionKey={courseId}>
        <Outlet />
      </FadeIn>
    );
  }

  return (
    <FadeIn className="flex flex-col gap-6 px-6 py-6" motionKey={courseId}>
      <div>
        <Button
          className="-ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => void navigate({ to: "/dashboard/org/courses" })}
          size="xs"
          variant="ghost"
        >
          <ArrowLeftIcon />
          Back to courses
        </Button>
        <div className="mt-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{course.title}</h1>
            <Badge size="sm" variant={course.status === "published" ? "default" : "secondary"}>
              {course.status === "published" ? "Published" : "Draft"}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{course.slug}</p>
        </div>
      </div>

      <Tabs aria-label="Course sections" className="gap-0" value={activeTab}>
        <TabsList
          className="-mx-1 w-full min-w-0 flex-wrap justify-start border-b border-border pb-0 sm:flex-nowrap"
          variant="underline"
        >
          <TabsTab
            nativeButton={false}
            render={<Link params={{ courseId }} to="/dashboard/org/courses/$courseId" />}
            value="/dashboard/org/courses/$courseId"
          >
            Details
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={<Link params={{ courseId }} to="/dashboard/org/courses/$courseId/curriculum" />}
            value="/dashboard/org/courses/$courseId/curriculum"
          >
            Curriculum
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={<Link params={{ courseId }} to="/dashboard/org/courses/$courseId/members" />}
            value="/dashboard/org/courses/$courseId/members"
          >
            Members
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={<Link params={{ courseId }} to="/dashboard/org/courses/$courseId/analytics" />}
            value="/dashboard/org/courses/$courseId/analytics"
          >
            Analytics
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={
              <Link params={{ courseId }} to="/dashboard/org/courses/$courseId/announcements" />
            }
            value="/dashboard/org/courses/$courseId/announcements"
          >
            Announcements
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={
              <Link params={{ courseId }} to="/dashboard/org/courses/$courseId/certificates" />
            }
            value="/dashboard/org/courses/$courseId/certificates"
          >
            Certificates
          </TabsTab>
        </TabsList>
      </Tabs>

      <Outlet />
    </FadeIn>
  );
}
