import { useIsFetching, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { GraduationCap, ScrollText, Users } from "lucide-react";
import { useMemo } from "react";

import { OverviewStatCard } from "@/components/dashboard/admin/overview/overview-primitives";
import { buildAnalyticsColumns } from "@/components/dashboard/course/course-analytics-columns";
import {
  courseAnalyticsSearchSchema,
  getAnalyticsListInput,
  type CourseAnalyticsSearchInput,
  type CourseAnalyticsSortBy,
  type CourseAnalyticsStudentRow,
} from "@/components/dashboard/course/course-analytics-schema";
import { CourseAnalyticsToolbar } from "@/components/dashboard/course/course-analytics-toolbar";
import { buildCourseAnalyticsCsv } from "@/components/dashboard/course/export-course-analytics";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { DataTable } from "@/components/dashboard/data-table";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useTRPC, useTRPCClient } from "@/lib/trpc/client";

export const Route = createFileRoute("/dashboard/course/$courseId/analytics")({
  validateSearch: courseAnalyticsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.course.analyticsOverview.queryOptions({ courseId: params.courseId }),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.course.listAnalyticsStudents.queryOptions(
          getAnalyticsListInput(deps, params.courseId),
        ),
      ),
    ]);
  },
  component: CourseAnalyticsPage,
});

function formatScore(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function CourseAnalyticsPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const overviewQuery = useSuspenseQuery(trpc.course.analyticsOverview.queryOptions({ courseId }));
  // Loaded by the parent course route; a cache read for the export filename.
  const { data: course } = useSuspenseQuery(trpc.course.get.queryOptions({ courseId }));
  const listQuery = useSuspenseQuery(
    trpc.course.listAnalyticsStudents.queryOptions(getAnalyticsListInput(search, courseId)),
  );
  const isFetching = useIsFetching({ queryKey: trpc.course.listAnalyticsStudents.queryKey() }) > 0;

  const { searchInput, setSearchInput } = useDebouncedSearch({
    committedValue: search.search,
    delayMs: 400,
    onDebouncedCommit: (next) =>
      navigate({
        replace: true,
        search: (prev: CourseAnalyticsSearchInput) => ({ ...prev, search: next, offset: 0 }),
      }),
  });

  const tableState = useMemo(
    () => ({
      sorting: [{ id: search.sortBy, desc: search.sortDirection === "desc" }] as SortingState,
      pagination: {
        pageIndex: Math.floor(search.offset / search.limit),
        pageSize: search.limit,
      } as PaginationState,
      columnFilters: [] as ColumnFiltersState,
    }),
    [search],
  );

  const columns = useMemo(() => buildAnalyticsColumns(courseId), [courseId]);

  const table = useReactTable<CourseAnalyticsStudentRow>({
    data: listQuery.data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: tableState,
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    rowCount: listQuery.data.totalCount,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableState.sorting) : updater;
      const first = next[0];
      navigate({
        search: (prev: CourseAnalyticsSearchInput) => ({
          ...prev,
          sortBy: first ? (first.id as CourseAnalyticsSortBy) : "name",
          sortDirection: first ? (first.desc ? "desc" : "asc") : "asc",
          offset: 0,
        }),
      });
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableState.pagination) : updater;
      navigate({
        search: (prev: CourseAnalyticsSearchInput) => ({
          ...prev,
          offset: next.pageIndex * next.pageSize,
          limit: next.pageSize,
        }),
      });
    },
  });

  const overview = overviewQuery.data;

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OverviewStatCard
          description="Learners currently enrolled in this course."
          icon={Users}
          title="Enrolled students"
          value={overview.enrollmentCount.toLocaleString()}
        />
        <OverviewStatCard
          description="Average best score across every quiz attempt by every learner."
          icon={ScrollText}
          title="Average quiz score"
          value={formatScore(overview.averageQuizScore)}
        />
        <OverviewStatCard
          description="Average best score across every exam attempt by every learner."
          icon={GraduationCap}
          title="Average exam score"
          value={formatScore(overview.averageExamScore)}
        />
      </div>

      <CourseAnalyticsToolbar
        actions={
          <ExportCsvButton
            build={async () => {
              const result = await trpcClient.course.exportAnalytics.query({ courseId });
              return { blob: buildCourseAnalyticsCsv(result), rowCount: result.students.length };
            }}
            name={`${course.title}-analytics`}
          >
            Export
          </ExportCsvButton>
        }
        isFetching={isFetching}
        onSearchChange={setSearchInput}
        search={searchInput}
      />
      <DataTable<CourseAnalyticsStudentRow> table={table} />
    </div>
  );
}
