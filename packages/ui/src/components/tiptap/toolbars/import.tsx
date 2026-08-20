import { Button } from "@sycom/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@sycom/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@sycom/components/ui/tooltip";
import { toastManager } from "@sycom/ui/components/toast";
import { cn } from "@sycom/ui/lib/utils";
import { Braces, Code, FileText, Hash, Type, UploadIcon } from "lucide-react";
import { useRef } from "react";

import { useToolbar, useToolbarEditorState } from "./toolbar-provider";

type ImportFormat = "html" | "json" | "md" | "docx" | "text";

const FORMATS: ReadonlyArray<{
  format: ImportFormat;
  label: string;
  description: string;
  accept: string;
  icon: typeof Code;
}> = [
  {
    format: "md",
    label: "Markdown",
    description: ".md",
    accept: ".md,.markdown,text/markdown",
    icon: Hash,
  },
  {
    format: "docx",
    label: "Word",
    description: ".docx",
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    icon: FileText,
  },
  { format: "html", label: "HTML", description: ".html", accept: ".html,text/html", icon: Code },
  {
    format: "json",
    label: "JSON",
    description: ".json",
    accept: ".json,application/json",
    icon: Braces,
  },
  {
    format: "text",
    label: "Plain text",
    description: ".txt",
    accept: ".txt,text/plain",
    icon: Type,
  },
];

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Read failed")));
    reader.readAsText(file);
  });
}

export function ImportToolbar() {
  const { editor } = useToolbar();
  const canEdit = useToolbarEditorState((currentEditor) => currentEditor.isEditable);
  const inputRef = useRef<HTMLInputElement>(null);
  const formatRef = useRef<ImportFormat>("md");

  const openPicker = (format: ImportFormat) => {
    const input = inputRef.current;
    if (!input) return;
    formatRef.current = format;
    const accept = FORMATS.find((entry) => entry.format === format)?.accept ?? "";
    input.accept = accept;
    input.value = "";
    input.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    const format = formatRef.current;

    try {
      if (format === "json") {
        const raw = await readText(file);
        const parsed = JSON.parse(raw) as unknown;
        editor
          .chain()
          .focus()
          .setContent(parsed as never, { emitUpdate: true })
          .run();
      } else if (format === "html") {
        const raw = await readText(file);
        editor.chain().focus().setContent(raw, { emitUpdate: true }).run();
      } else if (format === "md") {
        const raw = await readText(file);
        editor.chain().focus().setContent(raw, { emitUpdate: true, contentType: "markdown" }).run();
      } else if (format === "docx") {
        // Shared with the course-level import, so a `::: question` fence written in
        // Word becomes a real question node here too.
        const { lessonBlocksToDoc, readDocxFile, splitLessonBody } =
          await import("@sycom/ui/lib/docx");
        const { html } = await readDocxFile(file, { images: "dataUri" });
        const doc = lessonBlocksToDoc(splitLessonBody(html), editor.extensionManager.extensions);
        editor
          .chain()
          .focus()
          .setContent(doc as never, { emitUpdate: true })
          .run();
      } else {
        const raw = await readText(file);
        editor
          .chain()
          .focus()
          .setContent(
            {
              type: "doc",
              content: raw
                .split(/\r?\n/)
                .map((line) =>
                  line.length === 0
                    ? { type: "paragraph" }
                    : { type: "paragraph", content: [{ type: "text", text: line }] },
                ),
            },
            { emitUpdate: true },
          )
          .run();
      }

      toastManager.add({ title: `Imported ${file.name}`, type: "success" });
    } catch (error) {
      const message =
        format === "json" && error instanceof SyntaxError
          ? "Invalid JSON file. Please check the file contents."
          : format === "docx"
            ? "Couldn't parse the Word document. The file may be corrupted or unsupported."
            : "Couldn't read the file. Please try again.";
      toastManager.add({ title: message, type: "error" });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                disabled={!canEdit}
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 w-max gap-2 px-3 font-normal")}
                  >
                    <UploadIcon className="h-4 w-4" />
                    <span className="hidden md:inline">Import</span>
                  </Button>
                }
              />
            }
          />
          <TooltipContent>Import document</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Open from</DropdownMenuLabel>
            {FORMATS.map(({ format, label, description, icon: Icon }) => (
              <DropdownMenuItem
                key={format}
                onClick={() => openPicker(format)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                <span className="ml-auto text-muted-foreground">{description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFile}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
