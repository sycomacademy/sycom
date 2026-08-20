import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, ShareIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DestructiveDialog } from "@/components/dashboard/destructive-dialog";
import { sessionQueryOptions } from "@/lib/auth/session";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@sycom/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sycom/ui/components/dropdown-menu";
import { toastManager } from "@sycom/ui/components/toast";

import type { CourseRow } from "./courses-schema";
import { SeedCourseDialog } from "./seed-course-dialog";

function canContentCreatorDeleteCourse(course: CourseRow, userId: string) {
  if (course.createdBy === userId) {
    return true;
  }
  return course.instructors.some((i) => i.userId === userId && i.role === "main");
}

export function CourseActions({ course }: { course: CourseRow }): ReactNode {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: auth } = useSuspenseQuery(sessionQueryOptions());
  const [seedOpen, setSeedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    ...trpc.course.delete.mutationOptions({
      onSuccess: async () => {
        toastManager.add({
          title: "Course deleted",
          description: `${course.title} was removed.`,
          type: "success",
        });
        setDeleteOpen(false);
        await queryClient.invalidateQueries({ queryKey: trpc.course.list.queryKey() });
      },
      onError: (error) => {
        toastManager.add({
          title: "Failed to delete course",
          description: error.message,
          type: "error",
        });
      },
    }),
  });

  if (!auth) {
    return null;
  }

  const canDelete =
    auth.user.role === "platform_admin" ||
    (auth.user.role === "content_creator" && canContentCreatorDeleteCourse(course, auth.user.id));

  const canSeed = auth.user.role === "platform_admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={`Open actions for ${course.title}`} size="icon-sm" variant="ghost">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() =>
              void navigate({
                to: "/dashboard/course/$courseId",
                params: { courseId: course.id },
              })
            }
          >
            <PencilIcon />
            Edit course
          </DropdownMenuItem>
          {canSeed ? (
            <DropdownMenuItem onClick={() => setSeedOpen(true)}>
              <ShareIcon />
              Seed to organization…
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                <Trash2Icon />
                Delete course
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canSeed && seedOpen ? (
        <SeedCourseDialog
          courseId={course.id}
          courseTitle={course.title}
          onOpenChange={setSeedOpen}
          open={seedOpen}
        />
      ) : null}

      {canDelete ? (
        <DestructiveDialog
          confirmLabel="Delete course"
          description={
            <>
              This permanently deletes <strong>{course.title}</strong> and all of its sections and
              lessons. Organizations already seeded with this course are not affected.
            </>
          }
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate({ courseId: course.id })}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title="Delete course"
        />
      ) : null}
    </>
  );
}
