import { DownloadIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@sycom/ui/components/button";
import { toastManager } from "@sycom/ui/components/toast";

import { buildExportFilename, downloadFile } from "@/lib/csv";

type ExportCsvButtonProps = {
  /** Fetches the data and turns it into the file to download. */
  build: () => Promise<{ blob: Blob; rowCount: number }>;
  /** Used for the filename and the success toast, e.g. "acme-members". */
  name: string;
  label?: string;
  children?: ReactNode;
};

/**
 * Exports are fetched on click rather than kept in the page: they pull the full
 * unfiltered set, which is far larger than the table showing beside them and would
 * be wasted work for the majority of visits that never export.
 */
export function ExportCsvButton({
  build,
  name,
  label = "Export CSV",
  children,
}: ExportCsvButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleClick = async () => {
    setExporting(true);
    try {
      const { blob, rowCount } = await build();

      if (rowCount === 0) {
        toastManager.add({ title: "Nothing to export", type: "warning" });
        return;
      }

      const filename = buildExportFilename(name, "csv");
      downloadFile(blob, filename);
      toastManager.add({
        title: `Exported ${rowCount} row${rowCount === 1 ? "" : "s"}`,
        description: filename,
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Couldn't export",
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

  return (
    <Button loading={exporting} onClick={() => void handleClick()} type="button" variant="outline">
      <DownloadIcon className="size-4" />
      {children ?? label}
    </Button>
  );
}
