"use client";

import { FileTextIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Shows which project details the AI writes from, or invites the writer to add some. */
export function DetailsChip({ projectId, details }: { projectId: string; details: string[] }) {
  const href = `/projects/${projectId}/details`;
  if (details.length === 0) {
    return (
      <Link
        href={href}
        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <PlusIcon className="size-3" />
        Add project details for better results
      </Link>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FileTextIcon className="size-3" />
          Uses project details
        </Link>
      </TooltipTrigger>
      <TooltipContent className="block max-w-56">
        Writes from the script and your project&rsquo;s {joinList(details.map((detail) => detail.toLowerCase()))}.
      </TooltipContent>
    </Tooltip>
  );
}

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
