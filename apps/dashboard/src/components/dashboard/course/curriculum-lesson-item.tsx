import { uploadFile } from "@sycom/storage/client";
import { MEDIA_LIMITS, resourceKindFromMime } from "@sycom/storage/limits";
import type { JSONContent } from "@tiptap/core";
import { Button } from "@sycom/ui/components/button";
import { Collapsible, CollapsibleContent } from "@sycom/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sycom/ui/components/dropdown-menu";
import {
  Editable,
  EditableArea,
  EditableInput,
  EditablePreview,
} from "@sycom/ui/components/elements/editable";
import { SortableItemHandle } from "@sycom/ui/components/elements/sortable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sycom/ui/components/select";
import { Spinner } from "@sycom/ui/components/spinner";
import { toastManager } from "@sycom/ui/components/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@sycom/ui/components/tooltip";
import { cn } from "@sycom/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  GripVerticalIcon,
  FullscreenIcon,
  MoveRightIcon,
  Trash2Icon,
} from "lucide-react";
import type React from "react";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { AutoSaveStatus } from "@/components/dashboard/course/auto-save-status";
import { DestructiveDialog } from "@/components/dashboard/destructive-dialog";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useLessonSignedMediaResolver } from "@/hooks/use-lesson-signed-media";
import { useTRPCClient } from "@/lib/trpc/client";

import {
  createEmptyLessonDocument,
  normalizeLessonContent,
  type CurriculumLesson,
  type CurriculumSection,
} from "./curriculum-schema";
import { ScheduleDateTimeField } from "./schedule-datetime-field";
import { Link } from "@tanstack/react-router";

const LESSON_TYPE_OPTIONS = [
  { label: "Article", value: "article" },
  { label: "Quiz", value: "quiz" },
  { label: "Exam", value: "exam" },
] as const;

const loadRichTextEditor = () =>
  import("@sycom/ui/components/tiptap/rich-text-editor").then((module) => ({
    default: module.RichTextEditor,
  }));

const LazyRichTextEditor = lazy(loadRichTextEditor);

function useLessonEditorUpload(lessonId: string) {
  const trpcClient = useTRPCClient();

  return useCallback(
    async (file: File) => {
      const resourceType = resourceKindFromMime(file.type);
      if (file.size > MEDIA_LIMITS[resourceType]) {
        const limitMb = Math.round(MEDIA_LIMITS[resourceType] / (1024 * 1024));
        toastManager.add({
          title: "File too large",
          description: `This ${resourceType} exceeds the ${limitMb} MB limit.`,
          type: "error",
        });
        throw new Error(`File exceeds the ${limitMb} MB ${resourceType} limit`);
      }

      const signedParams = await trpcClient.storage.signUpload.mutate({
        folder: "lesson_artifacts",
        entityType: "lesson",
        entityId: lessonId,
      });

      const result = await uploadFile({ file, signedParams });

      await trpcClient.storage.saveAsset.mutate({
        publicId: result.publicId,
        secureUrl: result.secureUrl,
        folder: "lesson_artifacts",
        entityType: "lesson",
        entityId: lessonId,
        resourceType: result.resourceType,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        name: file.name,
        tags: ["lesson-artifact"],
      });

      return { src: result.publicId, resourceType: result.resourceType, format: result.format };
    },
    [lessonId, trpcClient],
  );
}

type CurriculumLessonItemProps = {
  courseId: string;
  lesson: CurriculumLesson;
  expanded: boolean;
  lessonEditPath:
    | "/dashboard/course/$courseId/curriculum/$lessonId/edit"
    | "/dashboard/org/courses/$courseId/curriculum/$lessonId/edit";
  lessonViewPath:
    | "/dashboard/course/$courseId/curriculum/$lessonId/view"
    | "/dashboard/org/courses/$courseId/curriculum/$lessonId/view";
  moveTargets: CurriculumSection[];
  onDeleteLesson: (lessonId: string) => Promise<void>;
  saving: boolean;
  onMoveToSection: (lessonId: string, sectionId: string) => void;
  onSaveLesson: (
    lessonId: string,
    patch: {
      content: JSONContent | null;
      dueAt: Date | null;
      openAt: Date | null;
      type: CurriculumLesson["type"];
    },
    options?: { silent?: boolean },
  ) => Promise<void>;
  onToggleExpanded: (lessonId: string) => void;
  onUpdateTitle: (lessonId: string, title: string) => Promise<void>;
};

function CurriculumLessonItemImpl({
  courseId,
  lesson,
  expanded,
  lessonEditPath,
  lessonViewPath,
  moveTargets,
  onDeleteLesson,
  saving,
  onMoveToSection,
  onSaveLesson,
  onToggleExpanded,
  onUpdateTitle,
}: CurriculumLessonItemProps) {
  const onUpload = useLessonEditorUpload(lesson.id);
  const [content, setContent] = useState<JSONContent | null>(null);
  const [draftType, setDraftType] = useState<CurriculumLesson["type"]>(lesson.type);
  const [draftOpenAt, setDraftOpenAt] = useState<Date | null>(lesson.openAt);
  const [draftDueAt, setDraftDueAt] = useState<Date | null>(lesson.dueAt);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const resolveMediaUrl = useLessonSignedMediaResolver(content);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteLesson(lesson.id);
      setDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      setContent((current) => current ?? normalizeLessonContent(lesson.content));
    } else {
      setContent(normalizeLessonContent(lesson.content));
    }
  }, [expanded, lesson.content]);

  useEffect(() => {
    setDraftType(lesson.type);
    setDraftOpenAt(lesson.openAt);
    setDraftDueAt(lesson.dueAt);
  }, [lesson.type, lesson.openAt, lesson.dueAt]);

  const autoSaveData = useMemo(
    () => ({
      content: content ?? createEmptyLessonDocument(),
      draftDueAt,
      draftOpenAt,
      draftType,
    }),
    [content, draftDueAt, draftOpenAt, draftType],
  );

  const lessonAutoSave = useAutoSave({
    data: autoSaveData,
    enabled: expanded && content !== null,
    onSave: async ({ silent }) => {
      await onSaveLesson(
        lesson.id,
        {
          content: autoSaveData.content,
          dueAt: draftDueAt,
          openAt: draftOpenAt,
          type: draftType,
        },
        { silent },
      );
    },
  });

  return (
    <Collapsible open={expanded}>
      <div className={cn("rounded-xl border bg-background", expanded && "ring-1 ring-primary/15")}>
        <div className="flex items-center gap-2 px-3 py-2">
          <SortableItemHandle className="shrink-0 touch-none text-muted-foreground hover:text-foreground">
            <GripVerticalIcon className="size-3.5" />
          </SortableItemHandle>

          <button
            aria-label={expanded ? "Collapse lesson" : "Expand lesson"}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            onFocus={() => void loadRichTextEditor()}
            onMouseEnter={() => void loadRichTextEditor()}
            onClick={() => onToggleExpanded(lesson.id)}
            type="button"
          >
            {expanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>

          <Editable
            className="min-w-0 flex-1"
            onSubmit={(value) => {
              const trimmedValue = value.trim();
              if (trimmedValue && trimmedValue !== lesson.title) {
                void onUpdateTitle(lesson.id, trimmedValue);
              }
            }}
            value={lesson.title}
          >
            <EditableArea className="w-full">
              <EditablePreview className="truncate text-sm font-medium hover:text-foreground" />
              <EditableInput className="h-8 w-full rounded-md border px-2 text-sm" />
            </EditableArea>
          </Editable>

          {moveTargets.length > 0 ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    (
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label="Move lesson to another section"
                            size="sm"
                            variant="ghost"
                          />
                        }
                      />
                    ) as React.ReactElement<Record<string, unknown>>
                  }
                >
                  <MoveRightIcon className="size-4" />
                </TooltipTrigger>
                <TooltipPopup>Move to another section</TooltipPopup>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                {moveTargets.map((section) => (
                  <DropdownMenuItem
                    key={section.id}
                    onClick={() => onMoveToSection(lesson.id, section.id)}
                  >
                    {section.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                (
                  <Button
                    aria-label="Edit in fullscreen"
                    render={<Link params={{ courseId, lessonId: lesson.id }} to={lessonEditPath} />}
                    size="sm"
                    variant="ghost"
                  />
                ) as React.ReactElement<Record<string, unknown>>
              }
            >
              <FullscreenIcon className="size-4" />
            </TooltipTrigger>
            <TooltipPopup>Edit in fullscreen</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                (
                  <Button
                    aria-label="Preview lesson"
                    render={<Link params={{ courseId, lessonId: lesson.id }} to={lessonViewPath} />}
                    size="sm"
                    variant="ghost"
                  />
                ) as React.ReactElement<Record<string, unknown>>
              }
            >
              <EyeIcon className="size-4" />
            </TooltipTrigger>
            <TooltipPopup>Preview lesson</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                (
                  <Button
                    aria-label="Delete lesson"
                    onClick={() => setDeleteOpen(true)}
                    size="sm"
                    variant="ghost"
                  />
                ) as React.ReactElement<Record<string, unknown>>
              }
            >
              <Trash2Icon className="size-4 text-destructive" />
            </TooltipTrigger>
            <TooltipPopup>Delete lesson</TooltipPopup>
          </Tooltip>

          <DestructiveDialog
            confirmLabel="Delete lesson"
            description={
              <>
                This permanently deletes <strong>{lesson.title}</strong> and its content. Learner
                progress on this lesson is lost.
              </>
            }
            loading={isDeleting}
            onConfirm={() => void handleConfirmDelete()}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title="Delete lesson"
          />
        </div>

        <CollapsibleContent>
          <div className="border-t py-3">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 pb-3">
              <Select
                items={LESSON_TYPE_OPTIONS}
                onValueChange={(value) => {
                  if (value) {
                    setDraftType(value as CurriculumLesson["type"]);
                  }
                }}
                value={draftType}
              >
                <SelectTrigger className="w-36" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {draftType === "exam" || draftOpenAt || draftDueAt ? (
                <>
                  <ScheduleDateTimeField
                    label="Open at"
                    onValueChange={setDraftOpenAt}
                    value={draftOpenAt}
                  />
                  <ScheduleDateTimeField
                    label="Due at"
                    onValueChange={setDraftDueAt}
                    value={draftDueAt}
                  />
                </>
              ) : null}
            </div>
            <Suspense
              fallback={
                <div className="flex min-h-80 items-center justify-center rounded-xl border bg-card/40">
                  <Spinner className="size-5 text-muted-foreground" />
                </div>
              }
            >
              <LazyRichTextEditor
                className="border-0"
                content={content}
                mode="full"
                onChange={setContent}
                onUpload={onUpload}
                resolveMediaUrl={resolveMediaUrl}
                variant="embedded"
              />
            </Suspense>
            <div className="flex items-center justify-end gap-3 border-t p-3">
              <AutoSaveStatus
                lastSavedAt={lessonAutoSave.lastSavedAt}
                status={lessonAutoSave.status}
              />
              <Button loading={saving} onClick={() => void lessonAutoSave.save()} size="sm">
                Save lesson
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export const CurriculumLessonItem = memo(CurriculumLessonItemImpl);
