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
import { Braces, Code, DownloadIcon, FileText, Hash, Type } from "lucide-react";

import { useToolbar, useToolbarEditorState } from "./toolbar-provider";

type ExportFormat = "html" | "json" | "md" | "docx" | "text";

const FORMATS: ReadonlyArray<{
  format: ExportFormat;
  label: string;
  description: string;
  icon: typeof Code;
}> = [
  { format: "md", label: "Markdown", description: ".md", icon: Hash },
  { format: "docx", label: "Word", description: ".docx", icon: FileText },
  { format: "html", label: "HTML", description: ".html", icon: Code },
  { format: "json", label: "JSON", description: ".json", icon: Braces },
  { format: "text", label: "Plain text", description: ".txt", icon: Type },
];

const MIME: Record<ExportFormat, string> = {
  html: "text/html;charset=utf-8",
  json: "application/json;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  text: "text/plain;charset=utf-8",
};

const EXTENSION: Record<ExportFormat, string> = {
  html: "html",
  json: "json",
  md: "md",
  docx: "docx",
  text: "txt",
};

function buildFilename(format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  return `document-${date}.${EXTENSION[format]}`;
}

function downloadBlob(blob: Blob, format: ExportFormat) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildFilename(format);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ExportToolbar() {
  const { editor } = useToolbar();
  const isEmpty = useToolbarEditorState((currentEditor) => currentEditor.isEmpty);

  const handleExport = async (format: ExportFormat) => {
    if (!editor) return;
    try {
      let blob: Blob;

      if (format === "html") {
        blob = new Blob([editor.getHTML()], { type: MIME.html });
      } else if (format === "json") {
        blob = new Blob([JSON.stringify(editor.getJSON(), null, 2)], { type: MIME.json });
      } else if (format === "text") {
        blob = new Blob([editor.getText()], { type: MIME.text });
      } else if (format === "md") {
        blob = new Blob([editor.getMarkdown()], { type: MIME.md });
      } else {
        const { renderDocx } = await import("@sycom/ui/lib/docx");
        blob = await renderDocx(`<!DOCTYPE html><html><body>${editor.getHTML()}</body></html>`);
      }

      downloadBlob(blob, format);
      toastManager.add({ title: `Exported as ${format.toUpperCase()}`, type: "success" });
    } catch {
      toastManager.add({ title: "Export failed. Please try again.", type: "error" });
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              disabled={isEmpty}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 w-max gap-2 px-3 font-normal")}
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span className="hidden md:inline">Export</span>
                </Button>
              }
            />
          }
        />
        <TooltipContent>Export document</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Download as</DropdownMenuLabel>
          {FORMATS.map(({ format, label, description, icon: Icon }) => (
            <DropdownMenuItem
              key={format}
              onClick={() => {
                void handleExport(format);
              }}
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
  );
}
