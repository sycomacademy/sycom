import {
  useIsFetching,
  useQuery,
  useSuspenseInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search, UserRoundIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { AddCoInstructorDialog } from "@/components/dashboard/course/add-co-instructor-dialog";
import { CourseEnrollmentDetailSheet } from "@/components/dashboard/course/course-enrollment-detail-sheet";
import {
  courseMembersPageSize,
  courseMembersSearchSchema,
  getCourseMembersListInput,
  type CourseEnrollmentRow,
  type CourseMembersSearchInput,
} from "@/components/dashboard/course/course-members-schema";
import { DestructiveDialog } from "@/components/dashboard/destructive-dialog";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useTRPC, useTRPCClient } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@sycom/ui/components/avatar";
import { Badge } from "@sycom/ui/components/badge";
import { Button } from "@sycom/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@sycom/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@sycom/ui/components/input-group";
import { Spinner } from "@sycom/ui/components/spinner";
import { toastManager } from "@sycom/ui/components/toast";
import { buildImageUrl } from "@sycom/ui/image/cdn";
import { getInitials } from "@sycom/ui/lib/string";
import type { AppRouterOutputs } from "server/trpc/routers/_app";

type EnrollmentListResult = AppRouterOutputs["enrollment"]["listByCourse"];
type CourseInstructorRow = AppRouterOutputs["course"]["listCoInstructors"][number];

function getEnrollmentInfiniteQueryOptions(
  trpc: Pick<ReturnType<typeof useTRPC>, "enrollment">,
  courseId: string,
  search: CourseMembersSearchInput,
) {
  return {
    initialPageParam: 0,
    queryKey: [...trpc.enrollment.listByCourse.queryKey({ courseId }), search.search ?? ""],
    queryFn: async (context: unknown): Promise<EnrollmentListResult> => {
      const pageParam = (context as { pageParam: number }).pageParam;
      const queryOptions = trpc.enrollment.listByCourse.queryOptions(
        getCourseMembersListInput(search, pageParam, courseId),
      );
      const queryFn = queryOptions.queryFn;
      if (!queryFn) {
        throw new Error("Missing query function for enrollment.listByCourse.");
      }

      type QueryContext = Parameters<NonNullable<typeof queryFn>>[0];
      return await queryFn({
        ...(context as Omit<QueryContext, "queryKey">),
        queryKey: queryOptions.queryKey,
      } as QueryContext);
    },
    getNextPageParam: (lastPage: EnrollmentListResult, allPages: EnrollmentListResult[]) => {
      const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      if (loaded >= lastPage.totalCount || lastPage.rows.length < courseMembersPageSize) {
        return undefined;
      }
      return loaded;
    },
  };
}

export const Route = createFileRoute("/dashboard/course/$courseId/members")({
  validateSearch: courseMembersSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.course.listCoInstructors.queryOptions({ courseId: params.courseId }),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.course.listSeededOrganizations.queryOptions({
          courseId: params.courseId,
          limit: 20,
          offset: 0,
        }),
      ),
      context.queryClient.ensureInfiniteQueryData({
        initialPageParam: 0,
        queryKey: [
          ...context.trpc.enrollment.listByCourse.queryKey({ courseId: params.courseId }),
          deps.search ?? "",
        ],
        queryFn: async (contextArg): Promise<EnrollmentListResult> => {
          const pageParam = contextArg.pageParam as number;
          const queryOptions = context.trpc.enrollment.listByCourse.queryOptions(
            getCourseMembersListInput(deps, pageParam, params.courseId),
          );
          const queryFn = queryOptions.queryFn;
          if (!queryFn) {
            throw new Error("Missing query function for enrollment.listByCourse.");
          }

          return await queryFn({ ...contextArg, queryKey: queryOptions.queryKey });
        },
        getNextPageParam: (lastPage: EnrollmentListResult, allPages: EnrollmentListResult[]) => {
          const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0);
          if (loaded >= lastPage.totalCount || lastPage.rows.length < courseMembersPageSize) {
            return undefined;
          }
          return loaded;
        },
      }),
    ]);
  },
  component: CourseMembersPage,
});

function CoInstructorListItem({
  instructor,
  onRemove,
}: {
  instructor: CourseInstructorRow;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(instructor.userId);
      setConfirmOpen(false);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 rounded-md">
          {instructor.image ? (
            <AvatarImage alt={instructor.name} src={buildImageUrl(instructor.image)} />
          ) : null}
          <AvatarFallback className="rounded-md text-xs text-muted-foreground">
            {getInitials(instructor.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{instructor.name}</p>
          <p className="truncate text-xs text-muted-foreground">{instructor.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={instructor.role === "main" ? "default" : "outline"}>
          {instructor.role === "main" ? "Main instructor" : "Co-instructor"}
        </Badge>
        {instructor.role === "secondary" ? (
          <Button onClick={() => setConfirmOpen(true)} size="sm" variant="ghost">
            Remove
          </Button>
        ) : null}
      </div>

      <DestructiveDialog
        confirmLabel="Remove co-instructor"
        description={
          <>
            This removes <strong>{instructor.name}</strong> ({instructor.email}) as a co-instructor.
            They lose access to manage this course, but the course and its content stay intact.
          </>
        }
        loading={isRemoving}
        onConfirm={() => void handleConfirmRemove()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Remove co-instructor"
      />
    </div>
  );
}

function StudentListItem({
  enrollment,
  onRemove,
  onView,
}: {
  enrollment: CourseEnrollmentRow;
  onRemove: (enrollmentId: string) => Promise<void>;
  onView: (enrollmentId: string) => void;
}) {
  const completionLabel = `${enrollment.completedLessonCount}/${enrollment.totalLessonCount} complete`;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(enrollment.enrollmentId);
      setConfirmOpen(false);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 rounded-md">
          {enrollment.image ? (
            <AvatarImage alt={enrollment.name} src={buildImageUrl(enrollment.image)} />
          ) : null}
          <AvatarFallback className="rounded-md text-xs text-muted-foreground">
            {getInitials(enrollment.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{enrollment.name}</p>
          <p className="truncate text-xs text-muted-foreground">{enrollment.email}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">{enrollment.status}</Badge>
            <Badge variant="secondary">{completionLabel}</Badge>
            {enrollment.certificateIssued ? <Badge variant="success">Certified</Badge> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => onView(enrollment.enrollmentId)} size="sm" variant="outline">
          View student
        </Button>
        <Button onClick={() => setConfirmOpen(true)} size="sm" variant="ghost">
          Kick out
        </Button>
      </div>

      <DestructiveDialog
        confirmLabel="Kick out"
        description={
          <>
            This removes <strong>{enrollment.name}</strong> ({enrollment.email}) from this course,
            along with their progress and any issued certificate. They can be re-enrolled later.
          </>
        }
        loading={isRemoving}
        onConfirm={() => void handleConfirmRemove()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Kick out student"
      />
    </div>
  );
}

function CourseMembersPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const detachScrollRef = useRef<(() => void) | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { searchInput, setSearchInput } = useDebouncedSearch({
    committedValue: search.search,
    delayMs: 300,
    onDebouncedCommit: (next) =>
      navigate({
        replace: true,
        search: (_prev: CourseMembersSearchInput) => ({ search: next }),
      }),
  });

  const { data: course } = useQuery(trpc.course.get.queryOptions({ courseId }));
  const instructorsQuery = useQuery(trpc.course.listCoInstructors.queryOptions({ courseId }));
  const seededOrganizationsQuery = useQuery(
    trpc.course.listSeededOrganizations.queryOptions({ courseId, limit: 20, offset: 0 }),
  );
  const enrollmentsQuery = useSuspenseInfiniteQuery(
    getEnrollmentInfiniteQueryOptions(trpc, courseId, search),
  );

  const isFetchingEnrollments =
    useIsFetching({ queryKey: trpc.enrollment.listByCourse.queryKey({ courseId }) }) > 0;
  const coInstructors = instructorsQuery.data ?? [];
  const coInstructorCount = coInstructors.filter((row) => row.role === "secondary").length;
  const enrollments = useMemo(
    () => enrollmentsQuery.data.pages.flatMap((page) => page.rows) as CourseEnrollmentRow[],
    [enrollmentsQuery.data],
  );

  const handleScrollLoadMore = useCallback(() => {
    const scrollHost = scrollHostRef.current;
    if (!scrollHost) return;

    const remaining = scrollHost.scrollHeight - scrollHost.scrollTop - scrollHost.clientHeight;
    if (
      remaining < 240 &&
      enrollmentsQuery.hasNextPage &&
      !enrollmentsQuery.isFetchingNextPage &&
      enrollmentsQuery.status === "success"
    ) {
      void enrollmentsQuery.fetchNextPage();
    }
  }, [enrollmentsQuery]);

  const attachScrollHost = useCallback(
    (node: HTMLDivElement | null) => {
      detachScrollRef.current?.();
      detachScrollRef.current = null;
      scrollHostRef.current = null;

      if (!node) return;

      const scrollHost = node.closest<HTMLElement>("[role='main']");
      if (!scrollHost) return;

      scrollHostRef.current = scrollHost;
      const onScroll = () => handleScrollLoadMore();
      scrollHost.addEventListener("scroll", onScroll, { passive: true });
      detachScrollRef.current = () => scrollHost.removeEventListener("scroll", onScroll);
    },
    [handleScrollLoadMore],
  );

  const handleRemoveCoInstructor = async (userId: string) => {
    try {
      await trpcClient.course.removeCoInstructor.mutate({ courseId, userId });
      await queryClient.invalidateQueries({
        queryKey: trpc.course.listCoInstructors.queryKey({ courseId }),
      });
      toastManager.add({ title: "Co-instructor removed", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't remove co-instructor",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try {
      await trpcClient.enrollment.removeEnrollment.mutate({ courseId, enrollmentId });
      await queryClient.invalidateQueries({
        queryKey: trpc.enrollment.listByCourse.queryKey({ courseId }),
      });
      toastManager.add({ title: "Student removed", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't remove student",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  return (
    <div className="space-y-6" ref={attachScrollHost}>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Instructors</CardTitle>
              <CardDescription>1 main instructor and up to 3 co-instructors.</CardDescription>
            </div>
            <AddCoInstructorDialog courseId={courseId} disabled={coInstructorCount >= 3} />
          </div>
        </CardHeader>
        <CardPanel className="space-y-3">
          {coInstructors.map((instructor) => (
            <CoInstructorListItem
              instructor={instructor}
              key={instructor.userId}
              onRemove={handleRemoveCoInstructor}
            />
          ))}
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Search and manage learners enrolled in this course.</CardDescription>
        </CardHeader>
        <CardPanel className="space-y-4">
          <InputGroup className="w-full max-w-md">
            <InputGroupAddon align="inline-start">
              {isFetchingEnrollments ? (
                <Spinner className="size-4" />
              ) : (
                <Search className="size-4 opacity-60" />
              )}
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              placeholder="Search enrolled learners..."
              type="search"
              value={searchInput}
            />
          </InputGroup>

          <div className="space-y-3">
            {enrollments.length === 0 ? (
              <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                No enrolled learners found.
              </div>
            ) : (
              enrollments.map((enrollment) => (
                <StudentListItem
                  enrollment={enrollment}
                  key={enrollment.enrollmentId}
                  onRemove={handleRemoveEnrollment}
                  onView={(enrollmentId) => {
                    setSelectedEnrollmentId(enrollmentId);
                    setSheetOpen(true);
                  }}
                />
              ))
            )}

            <div className="flex h-12 items-center justify-center">
              {enrollmentsQuery.isFetchingNextPage ? <Spinner className="size-4" /> : null}
            </div>
          </div>
        </CardPanel>
      </Card>

      {course && course.organizationId === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Organizations using this course</CardTitle>
            <CardDescription>
              Organizations that seeded this public course into their own library.
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-3">
            {seededOrganizationsQuery.data?.rows.length ? (
              seededOrganizationsQuery.data.rows.map((organizationUsage) => (
                <div
                  className="flex items-center justify-between gap-3 border px-4 py-3"
                  key={organizationUsage.seededCourseId}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                      <UserRoundIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {organizationUsage.organizationName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {organizationUsage.organizationSlug}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{organizationUsage.seededCourseTitle}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                No organizations have seeded this course yet.
              </div>
            )}
          </CardPanel>
        </Card>
      ) : null}

      <CourseEnrollmentDetailSheet
        courseId={courseId}
        enrollmentId={selectedEnrollmentId}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
      />
    </div>
  );
}
