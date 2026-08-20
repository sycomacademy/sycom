import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@sycom/ui/components/button";
import { Collapsible, CollapsibleContent } from "@sycom/ui/components/collapsible";
import {
  Editable,
  EditableArea,
  EditableInput,
  EditablePreview,
} from "@sycom/ui/components/elements/editable";
import { SortableItem, SortableItemHandle } from "@sycom/ui/components/elements/sortable";
import { cn } from "@sycom/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useState } from "react";

import { DestructiveDialog } from "@/components/dashboard/destructive-dialog";

import { CurriculumLessonItem } from "./curriculum-lesson-item";
import type { CurriculumSection } from "./curriculum-schema";
import { ScheduleDateTimeField } from "./schedule-datetime-field";

function EmptySectionDroppable({ sectionId }: { sectionId: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `empty-section:${sectionId}`,
    data: { type: "empty-section", sectionId },
  });

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground transition-colors",
        isOver && "border-primary bg-primary/5 text-primary",
      )}
      ref={setNodeRef}
    >
      {isOver ? "Release to drop here" : "No lessons yet. Create one or drag a lesson here."}
    </div>
  );
}

type CurriculumSectionItemProps = {
  courseId: string;
  expandedLessonId: string | null;
  lessonEditPath:
    | "/dashboard/course/$courseId/curriculum/$lessonId/edit"
    | "/dashboard/org/courses/$courseId/curriculum/$lessonId/edit";
  lessonViewPath:
    | "/dashboard/course/$courseId/curriculum/$lessonId/view"
    | "/dashboard/org/courses/$courseId/curriculum/$lessonId/view";
  onCreateLesson: (sectionId: string) => Promise<void>;
  onDeleteLesson: (lessonId: string) => Promise<void>;
  onDeleteSection: (sectionId: string) => Promise<void>;
  onMoveLessonToSection: (lessonId: string, sectionId: string) => void;
  onSaveLesson: (
    lessonId: string,
    patch: {
      content: import("@tiptap/core").JSONContent | null;
      dueAt: Date | null;
      openAt: Date | null;
      type: CurriculumSection["lessons"][number]["type"];
    },
    options?: { silent?: boolean },
  ) => Promise<void>;
  onUpdateSectionSchedule: (
    sectionId: string,
    patch: { dueAt?: Date | null; openAt?: Date | null },
  ) => Promise<void>;
  onToggleExpandedLesson: (lessonId: string) => void;
  onToggleSection: (sectionId: string) => void;
  onUpdateLessonTitle: (lessonId: string, title: string) => Promise<void>;
  onUpdateSectionTitle: (sectionId: string, title: string) => Promise<void>;
  savingLessonId: string | null;
  section: CurriculumSection;
  sectionCollapsed: boolean;
  sections: CurriculumSection[];
};

function CurriculumSectionItemImpl({
  courseId,
  expandedLessonId,
  lessonEditPath,
  lessonViewPath,
  onCreateLesson,
  onDeleteLesson,
  onDeleteSection,
  onMoveLessonToSection,
  onSaveLesson,
  onUpdateSectionSchedule,
  onToggleExpandedLesson,
  onToggleSection,
  onUpdateLessonTitle,
  onUpdateSectionTitle,
  savingLessonId,
  section,
  sectionCollapsed,
  sections,
}: CurriculumSectionItemProps) {
  const moveTargets = sections.filter((candidate) => candidate.id !== section.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteSection(section.id);
      setDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SortableItem value={section.id}>
      <div className="border bg-card shadow-xs/5">
        <Collapsible open={!sectionCollapsed}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <SortableItemHandle className="shrink-0 touch-none text-muted-foreground hover:text-foreground">
              <GripVerticalIcon className="size-4" />
            </SortableItemHandle>

            <button
              aria-label={sectionCollapsed ? "Expand section" : "Collapse section"}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onToggleSection(section.id)}
              type="button"
            >
              {sectionCollapsed ? (
                <ChevronRightIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <Editable
                className="min-w-0"
                onSubmit={(value) => {
                  const trimmedValue = value.trim();
                  if (trimmedValue && trimmedValue !== section.title) {
                    void onUpdateSectionTitle(section.id, trimmedValue);
                  }
                }}
                value={section.title}
              >
                <EditableArea className="w-full">
                  <EditablePreview className="truncate text-sm font-semibold hover:text-foreground" />
                  <EditableInput className="h-8 w-full rounded-md border px-2 text-sm font-semibold" />
                </EditableArea>
              </Editable>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {section.lessons.length} lesson{section.lessons.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <ScheduleDateTimeField
              label="Open at"
              onValueChange={(openAt) => void onUpdateSectionSchedule(section.id, { openAt })}
              value={section.openAt}
            />

            <ScheduleDateTimeField
              label="Due at"
              onValueChange={(dueAt) => void onUpdateSectionSchedule(section.id, { dueAt })}
              value={section.dueAt}
            />

            <Button onClick={() => void onCreateLesson(section.id)} size="sm" variant="outline">
              <PlusIcon className="size-4" />
              Add lesson
            </Button>

            <Button
              aria-label="Delete section"
              onClick={() => setDeleteOpen(true)}
              size="sm"
              variant="ghost"
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>

            <DestructiveDialog
              confirmLabel="Delete section"
              description={
                <>
                  This permanently deletes <strong>{section.title}</strong> and its{" "}
                  {section.lessons.length} lesson{section.lessons.length === 1 ? "" : "s"}. Learner
                  progress on those lessons is lost.
                </>
              }
              loading={isDeleting}
              onConfirm={() => void handleConfirmDelete()}
              onOpenChange={setDeleteOpen}
              open={deleteOpen}
              title="Delete section"
            />
          </div>

          <CollapsibleContent>
            <div className="border-t px-4 py-4">
              <SortableContext
                items={section.lessons.map((lesson) => lesson.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.lessons.length === 0 ? (
                  <EmptySectionDroppable sectionId={section.id} />
                ) : (
                  <div className="space-y-2">
                    {section.lessons.map((lesson) => (
                      <SortableItem
                        className="data-[dragging=true]:opacity-100 data-[dragging=true]:shadow-md"
                        key={lesson.id}
                        value={lesson.id}
                      >
                        <CurriculumLessonItem
                          courseId={courseId}
                          expanded={expandedLessonId === lesson.id}
                          lesson={lesson}
                          lessonEditPath={lessonEditPath}
                          lessonViewPath={lessonViewPath}
                          onDeleteLesson={onDeleteLesson}
                          moveTargets={moveTargets}
                          onMoveToSection={onMoveLessonToSection}
                          onSaveLesson={onSaveLesson}
                          onToggleExpanded={onToggleExpandedLesson}
                          onUpdateTitle={onUpdateLessonTitle}
                          saving={savingLessonId === lesson.id}
                        />
                      </SortableItem>
                    ))}
                  </div>
                )}
              </SortableContext>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </SortableItem>
  );
}

export const CurriculumSectionItem = memo(CurriculumSectionItemImpl);
