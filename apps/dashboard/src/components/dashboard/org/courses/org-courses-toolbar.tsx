import { Button } from "@sycom/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@sycom/ui/components/input-group";
import { Spinner } from "@sycom/ui/components/spinner";
import { Tabs, TabsList, TabsTab } from "@sycom/ui/components/tabs";
import { cn } from "@sycom/ui/lib/utils";
import { FileTextIcon, LayoutGridIcon, ListIcon, Plus, RefreshCcw, Search } from "lucide-react";
import type { ReactNode } from "react";

import { CreateOrgCourseSheet } from "./create-org-course-sheet";
import { ImportCourseDialog } from "@/components/dashboard/course/import-course-dialog";
import type { OrgCourseViewMode } from "./org-courses-schema";

export type OrgCoursesToolbarProps = {
  search: string;
  onSearchChange: (next: string) => void;
  isFetching?: boolean;
  onRefresh?: () => void;
  view: OrgCourseViewMode;
  onViewChange: (next: OrgCourseViewMode) => void;
};

export function OrgCoursesToolbar({
  isFetching = false,
  onRefresh,
  onSearchChange,
  onViewChange,
  search,
  view,
}: OrgCoursesToolbarProps): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="org-courses-search">
          Search by course title or slug
        </label>
        <InputGroup className="w-full max-w-md">
          <InputGroupAddon align="inline-start">
            {isFetching ? <Spinner className="size-4" /> : <Search className="size-4 opacity-60" />}
          </InputGroupAddon>
          <InputGroupInput
            id="org-courses-search"
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            placeholder="Search by title or slug..."
            type="search"
            value={search}
          />
        </InputGroup>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <div className="flex items-center justify-end gap-2">
          <Button
            aria-label="Refresh"
            disabled={isFetching}
            onClick={onRefresh}
            size="icon"
            variant="outline"
          >
            <RefreshCcw className={cn(isFetching ? "animate-spin" : "", "size-4")} />
          </Button>

          <ImportCourseDialog
            courseProcedureRouter="orgCourse"
            mode="create"
            trigger={
              <Button variant="outline">
                <FileTextIcon className="size-4" />
                From Word
              </Button>
            }
          />

          <CreateOrgCourseSheet
            trigger={
              <Button>
                <Plus className="size-4" />
                New course
              </Button>
            }
          />
        </div>

        <Tabs onValueChange={(next) => onViewChange(next as OrgCourseViewMode)} value={view}>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto" variant="default">
            <TabsTab className="gap-2" value="cards">
              <LayoutGridIcon className="size-4" />
              Cards
            </TabsTab>
            <TabsTab className="gap-2" value="list">
              <ListIcon className="size-4" />
              List
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
