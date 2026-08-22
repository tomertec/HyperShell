import { useCallback } from "react";
import { toast } from "sonner";
import { getShell, hasShell } from "../../lib/shell";

export type HostExportFormat = "json" | "csv" | "ssh-config";

const EXPORT_OPTIONS: Record<
  HostExportFormat,
  { extension: string; filterName: string }
> = {
  json: { extension: "json", filterName: "JSON" },
  csv: { extension: "csv", filterName: "CSV" },
  "ssh-config": { extension: "conf", filterName: "SSH Config" },
};

export function useHostExport() {
  const exportHosts = useCallback(async (format: HostExportFormat) => {
    const option = EXPORT_OPTIONS[format];

    if (!hasShell()) {
      toast.error("Host export is unavailable in this environment.");
      return;
    }

    const filePath = await getShell().fsShowSaveDialog({
      defaultPath: `hosts.${option.extension}`,
      filters: [{ name: option.filterName, extensions: [option.extension] }],
    });
    if (!filePath) {
      return;
    }

    try {
      const result = await getShell().exportHosts({ format, filePath });
      toast.success(
        `Exported ${result.exported} host${result.exported === 1 ? "" : "s"} to ${filePath}`
      );
    } catch (error) {
      toast.error(
        `Export failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, []);

  return { exportHosts };
}
