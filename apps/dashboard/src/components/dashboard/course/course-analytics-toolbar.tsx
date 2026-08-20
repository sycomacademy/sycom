import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@sycom/ui/components/input-group";
import { Spinner } from "@sycom/ui/components/spinner";

export type CourseAnalyticsToolbarProps = {
  isFetching?: boolean;
  onSearchChange: (next: string) => void;
  search: string;
  /** Export control, supplied by the page so each scope uses its own tRPC router. */
  actions?: ReactNode;
};

export function CourseAnalyticsToolbar({
  actions,
  isFetching = false,
  onSearchChange,
  search,
}: CourseAnalyticsToolbarProps): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="course-analytics-search">
          Search by student name or email
        </label>
        <InputGroup className="w-full max-w-md">
          <InputGroupAddon align="inline-start">
            {isFetching ? <Spinner className="size-4" /> : <Search className="size-4 opacity-60" />}
          </InputGroupAddon>
          <InputGroupInput
            id="course-analytics-search"
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            placeholder="Search by name or email…"
            type="search"
            value={search}
          />
        </InputGroup>
      </div>

      {actions}
    </div>
  );
}
