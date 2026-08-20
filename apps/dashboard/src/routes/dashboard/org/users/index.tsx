import { useIsFetching, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

import { ORG_MEMBER_COLUMNS } from "@/components/dashboard/org/users/org-members-columns";
import { OrgMembersFilters } from "@/components/dashboard/org/users/org-members-filters";
import {
  listOrgMembersSchema,
  type ListOrgMembersInput,
  type OrgMemberRow,
  type OrgMemberStatus,
  type OrgMembersSortBy,
} from "@/components/dashboard/org/users/org-members-schema";
import { OrgMembersToolbar } from "@/components/dashboard/org/users/org-members-toolbar";
import { DataTable } from "@/components/dashboard/data-table";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useTRPC } from "@/lib/trpc/client";
import type { OrganizationRole } from "@sycom/db/schema/auth";

export const Route = createFileRoute("/dashboard/org/users/")({
  pendingMs: Number.POSITIVE_INFINITY,
  head: () => ({
    meta: [{ title: "Members | Users | Organization | Sycom LMS" }],
  }),
  validateSearch: listOrgMembersSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.organization.listMembers.queryOptions(deps),
    );
  },
  component: OrgUsersMembersPage,
});

function OrgUsersMembersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trpc = useTRPC();

  const { searchInput, setSearchInput } = useDebouncedSearch({
    committedValue: search.search,
    delayMs: 600,
    onDebouncedCommit: (next) =>
      navigate({
        replace: true,
        search: (prev: ListOrgMembersInput) => ({ ...prev, search: next, offset: 0 }),
      }),
  });

  const query = useSuspenseQuery(trpc.organization.listMembers.queryOptions(search));
  // Loaded by the /dashboard/org route's loader; this is a cache read for the
  // export filename, not another request.
  const { data: workspace } = useSuspenseQuery(trpc.organization.workspaceContext.queryOptions());
  const isFetching = useIsFetching({ queryKey: trpc.organization.listMembers.queryKey() }) > 0;

  const tableState = useMemo(
    () => ({
      sorting: [{ id: search.sortBy, desc: search.sortDirection === "desc" }] as SortingState,
      pagination: {
        pageIndex: Math.floor(search.offset / search.limit),
        pageSize: search.limit,
      } as PaginationState,
      columnFilters: [
        ...(search.roles?.length ? [{ id: "role", value: search.roles }] : []),
        ...(search.statuses?.length ? [{ id: "status", value: search.statuses }] : []),
      ] as ColumnFiltersState,
    }),
    [search],
  );

  const table = useReactTable<OrgMemberRow>({
    data: query.data.rows,
    columns: ORG_MEMBER_COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    state: tableState,
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    rowCount: query.data.totalCount,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableState.sorting) : updater;
      const first = next[0];
      navigate({
        search: (prev: ListOrgMembersInput) => ({
          ...prev,
          sortBy: first ? (first.id as OrgMembersSortBy) : undefined,
          sortDirection: first ? (first.desc ? "desc" : "asc") : undefined,
          offset: 0,
        }),
      });
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableState.pagination) : updater;
      navigate({
        search: (prev: ListOrgMembersInput) => ({
          ...prev,
          offset: next.pageIndex * next.pageSize,
          limit: next.pageSize,
        }),
      });
    },
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableState.columnFilters) : updater;
      const roles = next.find((f) => f.id === "role")?.value as OrganizationRole[] | undefined;
      const statuses = next.find((f) => f.id === "status")?.value as OrgMemberStatus[] | undefined;
      navigate({
        search: (prev: ListOrgMembersInput) => ({
          ...prev,
          roles: roles?.length ? roles : undefined,
          statuses: statuses?.length ? statuses : undefined,
          offset: 0,
        }),
      });
    },
  });

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <OrgMembersToolbar
        isFetching={isFetching}
        onRefresh={query.refetch}
        onSearchChange={setSearchInput}
        organizationName={workspace.name}
        search={searchInput}
      />
      <OrgMembersFilters table={table} />
      <DataTable<OrgMemberRow> table={table} />
    </div>
  );
}
