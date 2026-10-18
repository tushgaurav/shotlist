import { cn } from "cn";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/** A titled group of settings rows, with room for an action beside the title and a footer. */
export function SettingsCard({
  title,
  description,
  action,
  footer,
  children,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card/50 p-1 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4 px-3 pt-2 pb-3">
        <div className="grid gap-0.5">
          <h2 className="text-sm leading-snug font-medium tracking-normal">{title}</h2>
          <p className="text-sm leading-snug text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="divide-y rounded-lg bg-card ring-1 ring-foreground/10">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-3 px-3 pt-3 pb-2">{footer}</div>}
    </section>
  );
}

/** A setting's name and explanation on the left, its control on the right (stacked when narrow). */
export function SettingsRow({
  label,
  description,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control's id, when it's a single form field. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-3 px-4 py-4 @xl/settings:grid-cols-2 @xl/settings:gap-8", className)}>
      <div className="grid content-start gap-1">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="w-fit leading-snug">
            {label}
          </Label>
        ) : (
          <div className="text-sm leading-snug font-medium">{label}</div>
        )}
        {description && <p className="text-sm leading-snug text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 @xl/settings:self-center">{children}</div>
    </div>
  );
}

export function SettingsCardSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="rounded-xl bg-card/50 p-1 ring-1 ring-foreground/10">
      <div className="grid gap-2 px-3 pt-2.5 pb-3.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="divide-y rounded-lg bg-card ring-1 ring-foreground/10">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-3 px-4 py-4 @xl/settings:grid-cols-2 @xl/settings:gap-8">
            <div className="grid content-start gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-full self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}
