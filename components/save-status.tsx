import { cn } from "cn";
import { CheckIcon, CloudOffIcon, LoaderIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";

export type SaveTone = "saved" | "saving" | "warning" | "error";

const TONES: Record<SaveTone, { icon: LucideIcon; className?: string }> = {
  saved: { icon: CheckIcon },
  saving: { icon: LoaderIcon, className: "[&>svg]:animate-spin" },
  warning: { icon: CloudOffIcon, className: "text-amber-700 dark:text-amber-400" },
  error: { icon: TriangleAlertIcon, className: "text-destructive" },
};

export function SaveStatusIndicator({
  status,
  tone,
  label,
}: {
  status: string;
  tone: SaveTone;
  label: string;
}) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status}
      className={cn(
        "flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className={cn((tone === "warning" || tone === "error") && "max-sm:sr-only")}>{label}</span>
    </p>
  );
}
