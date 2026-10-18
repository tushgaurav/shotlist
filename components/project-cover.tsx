import { cn } from "cn";

import { assetUrl, type ImageVariant } from "@/lib/shots/images";

import { TypeIcon } from "./project-type-icon";

/** The project's header image, cropped to fill; the type's icon on a plain background without one. */
export function ProjectCover({
  src,
  coverImageId,
  icon,
  variant,
  className,
  children,
}: {
  /** Shown instead of the stored image, e.g. a local preview while uploading. */
  src?: string | null;
  coverImageId: string | null;
  icon: string | null | undefined;
  variant: ImageVariant;
  className?: string;
  children?: React.ReactNode;
}) {
  const shown = src ?? (coverImageId ? assetUrl(coverImageId, variant) : null);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
        <img src={shown} alt="" draggable={false} decoding="async" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-linear-to-br from-muted to-muted-foreground/10">
          <TypeIcon icon={icon} className="size-8 text-muted-foreground/40" strokeWidth={1.5} aria-hidden />
        </div>
      )}
      {children}
    </div>
  );
}
