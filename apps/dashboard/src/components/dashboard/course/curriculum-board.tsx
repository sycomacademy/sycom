import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@sycom/ui/components/button";
import { toastManager } from "@sycom/ui/components/toast";
import { DownloadIcon, FileTextIcon, PlusIcon } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { startTransition, useEffect, useMemo, useState } from "react";

import { useTRPC, useTRPCClient } from "@/lib/trpc/client";

import { CurriculumSectionItem } from "./curriculum-section-item";
import { downloadBlob, exportCourseToDocx, toBuildSections } from "./export-course";
import { ImportCourseDialog } from "./import-course-dialog";
import { cloneCurriculumSections, type CurriculumSection } from "./curriculum-schema";

function buildCurriculumOrderInput(courseId: string, sections: CurriculumSection[]) {
  return {
    courseId,
    sections: sections.map((section) => ({
      sectionId: section.id,
      lessonIds: section.lessons.map((lesson) => lesson.id),
    })),
  };
}

function moveLessonAcrossSections(
  sections: CurriculumSection[],
  lessonId: string,
  targetSectionId: string,
  overLessonId?: string,
) {
  const sourceSection = sections.find((section) =>
    section.lessons.some((lesson) => lesson.id === lessonId),
  );
  const targetSection = sections.find((section) => section.id === targetSectionId);
  const lesson = sourceSection?.lessons.find((item) => item.id === lessonId);

  if (!(sourceSection && targetSection && lesson)) {
    return sections;
  }

  const nextSections = cloneCurriculumSections(sections);
  const nextSourceSection = nextSections.find((section) => section.id === sourceSection.id);
  const nextTargetSection = nextSections.find((section) => section.id === targetSection.id);

  if (!(nextSourceSection && nextTargetSection)) {
    return sections;
  }

  nextSourceSection.lessons = nextSourceSection.lessons.filter((item) => item.id !== lessonId);

  const nextLesson = { ...lesson, sectionId: targetSectionId };
  if (!overLessonId) {
    nextTargetSection.lessons.push(nextLesson);
    return nextSections;
  }

  const overIndex = nextTargetSection.lessons.findIndex((item) => item.id === overLessonId);
  if (overIndex === -1) {
    nextTargetSection.lessons.push(nextLesson);
    return nextSections;
  }

  nextTargetSection.lessons.splice(overIndex, 0, nextLesson);
  return nextSections;
}

export function CurriculumBoard({
  courseId,
  courseProcedureRouter = "course",
}: {
  courseId: string;
  /** Use `orgCourse` tRPC router + org lesson URLs for organization-owned courses. */
  courseProcedureRouter?: "course" | "orgCourse";
}) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const courseApi = courseProcedureRouter === "orgCourse" ? trpc.orgCourse : trpc.course;
  const courseMutations =
    courseProcedureRouter === "orgCourse" ? trpcClient.orgCourse : trpcClient.course;
  const lessonEditPath =
    courseProcedureRouter === "orgCourse"
      ? ("/dashboard/org/courses/$courseId/curriculum/$lessonId/edit" as const)
      : ("/dashboard/course/$courseId/curriculum/$lessonId/edit" as const);
  const lessonViewPath =
    courseProcedureRouter === "orgCourse"
      ? ("/dashboard/org/courses/$courseId/curriculum/$lessonId/view" as const)
      : ("/dashboard/course/$courseId/curriculum/$lessonId/view" as const);

  const queryKey = courseApi.getCurriculum.queryKey({ courseId });
  const { data: curriculum } = useSuspenseQuery(courseApi.getCurriculum.queryOptions({ courseId }));
  // Already fetched by the parent route's loader; this is a cache read for the
  // document title, not another request.
  const { data: course } = useSuspenseQuery(courseApi.get.queryOptions({ courseId }));

  const [sections, setSections] = useState(() => cloneCurriculumSections(curriculum));
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSections(cloneCurriculumSections(curriculum));
  }, [curriculum]);

  const setCurriculum = (updater: (current: CurriculumSection[]) => CurriculumSection[]) => {
    setSections((current) => updater(cloneCurriculumSections(current)));
    queryClient.setQueryData<CurriculumSection[]>(queryKey, (current) => {
      if (!current) return current;
      return updater(cloneCurriculumSections(current));
    });
  };

  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const lessonIds = useMemo(
    () => sections.flatMap((section) => section.lessons.map((lesson) => lesson.id)),
    [sections],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const replaceCurriculum = (nextSections: CurriculumSection[]) => {
    setSections(cloneCurriculumSections(nextSections));
    queryClient.setQueryData<CurriculumSection[]>(queryKey, cloneCurriculumSections(nextSections));
  };

  const persistCurriculumOrder = async (
    nextSections: CurriculumSection[],
    previousSections: CurriculumSection[],
  ) => {
    replaceCurriculum(nextSections);

    try {
      await courseMutations.saveCurriculumOrder.mutate(
        buildCurriculumOrderInput(courseId, nextSections),
      );
    } catch (error) {
      replaceCurriculum(previousSections);
      toastManager.add({
        title: "Couldn't save curriculum order",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename, warnings } = await exportCourseToDocx(trpcClient, {
        courseTitle: course.title,
        sections: toBuildSections(sections),
      });

      downloadBlob(blob, filename);
      toastManager.add({
        title: "Course exported",
        description:
          warnings.length > 0
            ? `${warnings.length} item${warnings.length === 1 ? "" : "s"} couldn't be included.`
            : filename,
        type: warnings.length > 0 ? "warning" : "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Couldn't export the course",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleCreateSection = async () => {
    try {
      const created = await courseMutations.createSection.mutate({
        courseId,
        title: `Section ${sections.length + 1}`,
      });
      setCurriculum((current) => [...current, created]);
      setCollapsedSectionIds((current) => {
        const next = new Set(current);
        next.delete(created.id);
        return next;
      });
      toastManager.add({ title: "Section created", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't create section",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleCreateLesson = async (sectionId: string) => {
    try {
      const targetSection = sections.find((section) => section.id === sectionId);
      const created = await trpcClient.lesson.create.mutate({
        courseId,
        sectionId,
        title: `Lesson ${(targetSection?.lessons.length ?? 0) + 1}`,
      });
      setCurriculum((current) =>
        current.map((section) =>
          section.id === sectionId
            ? { ...section, lessons: [...section.lessons, created] }
            : section,
        ),
      );
      setCollapsedSectionIds((current) => {
        const next = new Set(current);
        next.delete(sectionId);
        return next;
      });
      startTransition(() => {
        setExpandedLessonId(created.id);
      });
      toastManager.add({ title: "Lesson created", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Couldn't create lesson",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleUpdateLessonTitle = async (lessonId: string, title: string) => {
    const previousSections = cloneCurriculumSections(sections);
    setCurriculum((current) =>
      current.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, title } : lesson,
        ),
      })),
    );

    try {
      await trpcClient.lesson.update.mutate({ lessonId, patch: { title } });
      toastManager.add({ title: "Lesson updated", type: "success" });
    } catch (error) {
      setSections(previousSections);
      queryClient.setQueryData(queryKey, previousSections);
      toastManager.add({
        title: "Couldn't update lesson",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleUpdateSectionTitle = async (sectionId: string, title: string) => {
    const previousSections = cloneCurriculumSections(sections);
    setCurriculum((current) =>
      current.map((section) => (section.id === sectionId ? { ...section, title } : section)),
    );

    try {
      await courseMutations.updateSection.mutate({ sectionId, patch: { title } });
      toastManager.add({ title: "Section updated", type: "success" });
    } catch (error) {
      replaceCurriculum(previousSections);
      toastManager.add({
        title: "Couldn't update section",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleUpdateSectionSchedule = async (
    sectionId: string,
    patch: { dueAt?: Date | null; openAt?: Date | null },
  ) => {
    const previousSections = cloneCurriculumSections(sections);
    setCurriculum((current) =>
      current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
    );

    try {
      await courseMutations.updateSection.mutate({ sectionId, patch });
      toastManager.add({ title: "Section schedule updated", type: "success" });
    } catch (error) {
      replaceCurriculum(previousSections);
      toastManager.add({
        title: "Couldn't update section schedule",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleSaveLesson = async (
    lessonId: string,
    patch: {
      content: JSONContent | null;
      dueAt: Date | null;
      openAt: Date | null;
      type: CurriculumSection["lessons"][number]["type"];
    },
    options?: { silent?: boolean },
  ) => {
    const previousSections = cloneCurriculumSections(sections);
    setSavingLessonId(lessonId);
    setCurriculum((current) =>
      current.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, ...patch, updatedAt: new Date() } : lesson,
        ),
      })),
    );

    try {
      await trpcClient.lesson.update.mutate({ lessonId, patch });
      if (!options?.silent) {
        toastManager.add({ title: "Lesson saved", type: "success" });
      }
    } catch (error) {
      setSections(previousSections);
      queryClient.setQueryData(queryKey, previousSections);
      toastManager.add({
        title: "Couldn't save lesson",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
      throw error;
    } finally {
      setSavingLessonId((current) => (current === lessonId ? null : current));
      queryClient.invalidateQueries({ queryKey: trpc.lesson.get.queryKey() });
      queryClient.invalidateQueries({ queryKey: courseApi.getCurriculum.queryKey({ courseId }) });
    }
  };

  const handleToggleSection = (sectionId: string) => {
    startTransition(() => {
      setCollapsedSectionIds((current) => {
        const next = new Set(current);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
    });
  };

  const handleDeleteSection = async (sectionId: string) => {
    const previousSections = cloneCurriculumSections(sections);
    const nextSections = previousSections.filter((section) => section.id !== sectionId);
    replaceCurriculum(nextSections);

    try {
      await courseMutations.deleteSection.mutate({ sectionId });
      toastManager.add({ title: "Section deleted", type: "success" });
    } catch (error) {
      replaceCurriculum(previousSections);
      toastManager.add({
        title: "Couldn't delete section",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const previousSections = cloneCurriculumSections(sections);
    const nextSections = previousSections.map((section) => ({
      ...section,
      lessons: section.lessons.filter((lesson) => lesson.id !== lessonId),
    }));
    replaceCurriculum(nextSections);
    setExpandedLessonId((current) => (current === lessonId ? null : current));

    try {
      await trpcClient.lesson.delete.mutate({ lessonId });
      toastManager.add({ title: "Lesson deleted", type: "success" });
    } catch (error) {
      replaceCurriculum(previousSections);
      toastManager.add({
        title: "Couldn't delete lesson",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const handleMoveLessonToSection = (lessonId: string, sectionId: string) => {
    const previousSections = cloneCurriculumSections(sections);
    const nextSections = moveLessonAcrossSections(previousSections, lessonId, sectionId);
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      next.delete(sectionId);
      return next;
    });
    void persistCurriculumOrder(nextSections, previousSections);
  };

  const handleMoveLessonWithinBoard = (
    lessonId: string,
    targetSectionId: string,
    overLessonId?: string,
  ) => {
    const previousSections = cloneCurriculumSections(sections);
    const nextSections = moveLessonAcrossSections(
      previousSections,
      lessonId,
      targetSectionId,
      overLessonId,
    );
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      next.delete(targetSectionId);
      return next;
    });
    void persistCurriculumOrder(nextSections, previousSections);
  };

  const handleDragStart = (_event: DragStartEvent) => {};

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (sectionIds.includes(activeId)) {
      if (!sectionIds.includes(overId) || activeId === overId) return;

      const previousSections = cloneCurriculumSections(sections);
      const oldIndex = previousSections.findIndex((section) => section.id === activeId);
      const newIndex = previousSections.findIndex((section) => section.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const nextSections = arrayMove(previousSections, oldIndex, newIndex);
      void persistCurriculumOrder(nextSections, previousSections);
      return;
    }

    if (!lessonIds.includes(activeId)) return;

    const sourceSection = sections.find((section) =>
      section.lessons.some((lesson) => lesson.id === activeId),
    );
    if (!sourceSection) return;

    const overType = over.data.current?.type;
    if (overType === "empty-section") {
      const targetSectionId = String(over.data.current?.sectionId ?? "");
      if (targetSectionId && targetSectionId !== sourceSection.id) {
        handleMoveLessonToSection(activeId, targetSectionId);
      }
      return;
    }

    if (lessonIds.includes(overId)) {
      const targetSection = sections.find((section) =>
        section.lessons.some((lesson) => lesson.id === overId),
      );
      if (!targetSection) return;

      if (targetSection.id === sourceSection.id) {
        const previousSections = cloneCurriculumSections(sections);
        const nextSections = previousSections.map((section) => {
          if (section.id !== sourceSection.id) return section;
          const oldIndex = section.lessons.findIndex((lesson) => lesson.id === activeId);
          const newIndex = section.lessons.findIndex((lesson) => lesson.id === overId);
          if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return section;
          return { ...section, lessons: arrayMove(section.lessons, oldIndex, newIndex) };
        });

        void persistCurriculumOrder(nextSections, previousSections);
        return;
      }

      handleMoveLessonWithinBoard(activeId, targetSection.id, overId);
      return;
    }

    if (sectionIds.includes(overId) && overId !== sourceSection.id) {
      handleMoveLessonWithinBoard(activeId, overId);
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        {sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            No sections yet. Create your first section to start authoring.
          </div>
        ) : (
          <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map((section) => (
                <CurriculumSectionItem
                  courseId={courseId}
                  expandedLessonId={expandedLessonId}
                  lessonEditPath={lessonEditPath}
                  lessonViewPath={lessonViewPath}
                  key={section.id}
                  onCreateLesson={handleCreateLesson}
                  onDeleteSection={handleDeleteSection}
                  onDeleteLesson={handleDeleteLesson}
                  onMoveLessonToSection={handleMoveLessonToSection}
                  onSaveLesson={handleSaveLesson}
                  onToggleExpandedLesson={(lessonId) => {
                    startTransition(() => {
                      setExpandedLessonId((current) => (current === lessonId ? null : lessonId));
                    });
                  }}
                  onToggleSection={handleToggleSection}
                  onUpdateLessonTitle={handleUpdateLessonTitle}
                  onUpdateSectionSchedule={handleUpdateSectionSchedule}
                  onUpdateSectionTitle={handleUpdateSectionTitle}
                  savingLessonId={savingLessonId}
                  section={section}
                  sectionCollapsed={collapsedSectionIds.has(section.id)}
                  sections={sections}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </DndContext>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleCreateSection()} size="sm" variant="outline">
          <PlusIcon className="size-4" />
          Add section
        </Button>

        <ImportCourseDialog
          courseId={courseId}
          courseProcedureRouter={courseProcedureRouter}
          mode="append"
          trigger={
            <Button size="sm" variant="outline">
              <FileTextIcon className="size-4" />
              Import from Word
            </Button>
          }
        />

        <Button
          disabled={sections.length === 0}
          loading={exporting}
          onClick={() => void handleExport()}
          size="sm"
          variant="outline"
        >
          <DownloadIcon className="size-4" />
          Export to Word
        </Button>
      </div>
    </div>
  );
}
