import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";

import { uploadFile } from "@sycom/storage/client";
import { getFullExtensions } from "@sycom/components/tiptap/extensions/preset-full";
import { Button } from "@sycom/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@sycom/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@sycom/ui/components/field";
import { Form, FormControl, FormField, FormItem } from "@sycom/ui/components/form";
import { Input } from "@sycom/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sycom/ui/components/select";
import { toastManager } from "@sycom/ui/components/toast";
import { slugify } from "@sycom/ui/lib/string";
import {
  collectPendingImageIds,
  lessonBlocksToDoc,
  readDocxFile,
  replacePendingImageSrcs,
  splitCourseDocument,
  type ParsedCourseDocument,
  type PendingImage,
} from "@sycom/ui/lib/docx";

import { useTRPC, useTRPCClient } from "@/lib/trpc/client";

import { DIFFICULTY_LEVELS } from "@sycom/db/schema/course";

import { COURSE_DIFFICULTY_LABELS } from "./courses-schema";
import {
  DEFAULT_HEADING_MAP_VALUE,
  DEFAULT_IMPORT_NEW_COURSE_VALUES,
  DOCX_ACCEPT,
  HEADING_MAP_OPTIONS,
  headingMapForValue,
  importNewCourseSchema,
  type ImportNewCourseInput,
} from "./import-course-schema";

type ImportCourseDialogProps = {
  trigger: ReactElement;
  /** Use the `orgCourse` tRPC router and org URLs for organization-owned courses. */
  courseProcedureRouter?: "course" | "orgCourse";
} & ({ mode: "append"; courseId: string } | { mode: "create"; courseId?: undefined });

type Phase = "idle" | "parsing" | "preview" | "importing";

const DIFFICULTY_ITEMS = DIFFICULTY_LEVELS.map((level) => ({
  value: level,
  label: COURSE_DIFFICULTY_LABELS[level],
}));

/** Base UI reads `{ value, label }`; the heading map itself is looked up separately. */
const HEADING_MAP_ITEMS = HEADING_MAP_OPTIONS.map(({ value, label }) => ({ value, label }));

function countBlocks(parsed: ParsedCourseDocument) {
  let lessons = 0;
  let questions = 0;

  for (const section of parsed.sections) {
    lessons += section.lessons.length;
    for (const lesson of section.lessons) {
      questions += lesson.blocks.filter((block) => block.kind === "question").length;
    }
  }

  return { sections: parsed.sections.length, lessons, questions };
}

export function ImportCourseDialog(props: ImportCourseDialogProps) {
  const { trigger, courseProcedureRouter = "course" } = props;
  const mode = props.mode;
  const isOrg = courseProcedureRouter === "orgCourse";

  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [filename, setFilename] = useState("");
  const [headingMapValue, setHeadingMapValue] = useState(DEFAULT_HEADING_MAP_VALUE);
  const [parsed, setParsed] = useState<ParsedCourseDocument | null>(null);

  // The converted HTML is kept so remapping heading levels re-splits without
  // re-reading the file, and the images with it so they survive the re-split.
  const htmlRef = useRef<string>("");
  const imagesRef = useRef<Map<string, PendingImage>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  const extensions = useMemo(() => getFullExtensions(), []);

  const form = useForm<ImportNewCourseInput>({
    resolver: zodResolver(importNewCourseSchema),
    defaultValues: DEFAULT_IMPORT_NEW_COURSE_VALUES,
  });

  const reset = () => {
    setPhase("idle");
    setStatus("");
    setFilename("");
    setParsed(null);
    setHeadingMapValue(DEFAULT_HEADING_MAP_VALUE);
    htmlRef.current = "";
    imagesRef.current = new Map();
    form.reset(DEFAULT_IMPORT_NEW_COURSE_VALUES);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    // Closing mid-import would orphan the second phase; the button is disabled then,
    // but a dismiss can still land here.
    if (!next && phase === "importing") return;
    setOpen(next);
    if (!next) reset();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhase("parsing");
    setFilename(file.name);

    try {
      const { html, images, warnings } = await readDocxFile(file);
      htmlRef.current = html;
      imagesRef.current = images;

      const result = splitCourseDocument(html, { headingMap: headingMapForValue(headingMapValue) });
      result.warnings.unshift(...warnings);
      setParsed(result);

      if (mode === "create") {
        const derived = result.title ?? file.name.replace(/\.docx$/i, "");
        form.setValue("title", derived.slice(0, 160), { shouldValidate: true });
      }

      setPhase("preview");
    } catch {
      toastManager.add({
        title: "Couldn't read the document",
        description: "The file may be corrupted or not a Word .docx.",
        type: "error",
      });
      reset();
    } finally {
      event.target.value = "";
    }
  };

  const handleHeadingMapChange = (value: string) => {
    setHeadingMapValue(value);
    if (!htmlRef.current) return;
    setParsed(splitCourseDocument(htmlRef.current, { headingMap: headingMapForValue(value) }));
  };

  /**
   * Upload the images held aside during parsing and swap their public ids into the
   * lesson content. Only runs once the lesson rows exist — storage access is checked
   * against the lesson, so there is nothing to upload against before then.
   */
  const uploadLessonImages = async (
    lessonId: string,
    content: ReturnType<typeof lessonBlocksToDoc>,
  ): Promise<boolean> => {
    const ids = collectPendingImageIds(content);
    if (ids.length === 0) return true;

    const resolved = new Map<string, string>();
    let allSucceeded = true;

    for (const id of ids) {
      const image = imagesRef.current.get(id);
      if (!image) {
        allSucceeded = false;
        continue;
      }

      try {
        const signedParams = await trpcClient.storage.signUpload.mutate({
          folder: "lesson_artifacts",
          entityType: "lesson",
          entityId: lessonId,
        });

        const file = new File([image.blob], `${id}.${image.contentType.split("/")[1] ?? "png"}`, {
          type: image.contentType,
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
          tags: ["lesson-artifact", "imported"],
        });

        resolved.set(id, result.publicId);
      } catch {
        allSucceeded = false;
      }
    }

    if (resolved.size === 0) return false;

    await trpcClient.lesson.update.mutate({
      lessonId,
      patch: { content: replacePendingImageSrcs(content, resolved) },
    });

    return allSucceeded;
  };

  const runImport = async (data: ImportNewCourseInput) => {
    if (!parsed || parsed.sections.length === 0) return;

    setPhase("importing");
    let createdCourseId: string | null = null;

    try {
      let courseId: string;

      if (props.mode === "append") {
        courseId = props.courseId;
      } else {
        setStatus("Creating course…");
        const api = isOrg ? trpcClient.orgCourse : trpcClient.course;
        const created = await api.create.mutate({
          title: data.title,
          slug: slugify(data.title).slice(0, 80) || "course",
          difficulty: data.difficulty,
          status: "draft",
          instructorIds: [],
          categoryIds: [],
        });
        courseId = created.courseId;
        createdCourseId = created.courseId;
      }

      setStatus("Adding sections and lessons…");

      const docs = parsed.sections.map((section) =>
        section.lessons.map((lesson) => lessonBlocksToDoc(lesson.blocks, extensions)),
      );

      const { sections: createdSections } = await trpcClient.courseImport.importSections.mutate({
        courseId,
        sections: parsed.sections.map((section, sectionIndex) => ({
          title: section.title,
          description: section.description,
          lessons: section.lessons.map((lesson, lessonIndex) => ({
            title: lesson.title,
            content: docs[sectionIndex]?.[lessonIndex] as never,
          })),
        })),
      });

      // Phase two: the lesson rows now exist, so their images can be uploaded.
      let imageFailures = 0;
      const totalImages = imagesRef.current.size;

      if (totalImages > 0) {
        setStatus(`Uploading ${totalImages} image${totalImages === 1 ? "" : "s"}…`);

        for (const [sectionIndex, createdSection] of createdSections.entries()) {
          for (const [lessonIndex, lessonId] of createdSection.lessonIds.entries()) {
            const content = docs[sectionIndex]?.[lessonIndex];
            if (!content) continue;
            const ok = await uploadLessonImages(lessonId, content);
            if (!ok) imageFailures += 1;
          }
        }
      }

      const counts = countBlocks(parsed);
      const curriculumApi = isOrg ? trpc.orgCourse : trpc.course;
      await queryClient.invalidateQueries({
        queryKey: curriculumApi.getCurriculum.queryKey({ courseId }),
      });

      toastManager.add({
        title: `Imported ${counts.sections} section${counts.sections === 1 ? "" : "s"}`,
        description:
          imageFailures > 0
            ? `${counts.lessons} lessons added. Some images couldn't be uploaded — re-add them in the editor.`
            : `${counts.lessons} lessons added from ${filename}.`,
        type: imageFailures > 0 ? "warning" : "success",
      });

      setOpen(false);
      reset();

      if (createdCourseId) {
        await navigate(
          isOrg
            ? {
                to: "/dashboard/org/courses/$courseId/curriculum",
                params: { courseId: createdCourseId },
              }
            : {
                to: "/dashboard/course/$courseId/curriculum",
                params: { courseId: createdCourseId },
              },
        );
      }
    } catch (error) {
      setPhase("preview");
      setStatus("");
      toastManager.add({
        title: "Couldn't import the document",
        description:
          error instanceof Error
            ? error.message
            : "Couldn't reach server. Check your connection and try again.",
        type: "error",
      });
    }
  };

  const counts = parsed ? countBlocks(parsed) : null;
  const canImport = phase === "preview" && (counts?.lessons ?? 0) > 0;
  const importing = phase === "importing";

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={trigger} />
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New course from Word" : "Import from Word"}
          </DialogTitle>
          <DialogDescription>
            Heading 1 becomes a section and Heading 2 becomes a lesson. Sections are added after the
            ones already in the course — nothing is replaced.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <input
            accept={DOCX_ACCEPT}
            aria-hidden="true"
            className="hidden"
            onChange={handleFile}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />

          {phase === "idle" || phase === "parsing" ? (
            <Button
              className="w-full"
              loading={phase === "parsing"}
              onClick={() => inputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <UploadIcon className="size-4" />
              Choose a .docx file
            </Button>
          ) : null}

          {parsed && counts ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{filename}</span>
                <Button
                  className="ml-auto"
                  disabled={importing}
                  onClick={() => inputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Change
                </Button>
              </div>

              <Field>
                <FieldLabel className="text-xs">Heading mapping</FieldLabel>
                <Select
                  items={HEADING_MAP_ITEMS}
                  onValueChange={(value) => {
                    if (typeof value === "string") handleHeadingMapChange(value);
                  }}
                  value={headingMapValue}
                >
                  <SelectTrigger className="w-full" disabled={importing}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {HEADING_MAP_ITEMS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <div className="rounded-lg border">
                <div className="border-b px-3 py-2 text-sm text-muted-foreground">
                  {counts.sections} section{counts.sections === 1 ? "" : "s"} · {counts.lessons}{" "}
                  lesson{counts.lessons === 1 ? "" : "s"}
                  {counts.questions > 0 ? ` · ${counts.questions} questions` : null}
                  {imagesRef.current.size > 0 ? ` · ${imagesRef.current.size} images` : null}
                </div>
                <ul className="max-h-56 overflow-y-auto px-3 py-2 text-sm">
                  {parsed.sections.map((section, index) => (
                    <li className="py-1" key={`${section.title}-${index}`}>
                      <span className="font-medium">{section.title}</span>
                      <ul className="ml-4 text-muted-foreground">
                        {section.lessons.map((lesson, lessonIndex) => (
                          <li key={`${lesson.title}-${lessonIndex}`}>{lesson.title}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>

              {parsed.warnings.length > 0 ? (
                <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <ul className="space-y-1">
                    {parsed.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {mode === "create" ? (
                <Form {...form}>
                  <form className="space-y-4" id="import-course-form">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <Field>
                            <FieldLabel className="text-xs">Course title</FieldLabel>
                            <FormControl>
                              <Input autoComplete="off" disabled={importing} {...field} />
                            </FormControl>
                            <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                          </Field>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="difficulty"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <Field>
                            <FieldLabel className="text-xs">Difficulty</FieldLabel>
                            <FormControl>
                              <Select
                                items={DIFFICULTY_ITEMS}
                                onValueChange={(value) => {
                                  if (value) field.onChange(value);
                                }}
                                value={field.value}
                              >
                                <SelectTrigger className="w-full" disabled={importing}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {DIFFICULTY_ITEMS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FieldError reserveSpace>{fieldState.error?.message}</FieldError>
                          </Field>
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              ) : null}

              {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
            </>
          ) : null}
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button disabled={importing} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!canImport}
            loading={importing}
            onClick={
              // Only the new-course path has fields to validate; appending to an
              // existing course would otherwise be blocked by an empty title.
              mode === "create"
                ? form.handleSubmit(runImport)
                : () => void runImport(form.getValues())
            }
            type="button"
          >
            {mode === "create" ? "Create course" : "Import"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
