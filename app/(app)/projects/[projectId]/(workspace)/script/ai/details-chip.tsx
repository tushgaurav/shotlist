"use client";

import { cn } from "cn";

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useProjectDetails } from "./use-ai-model";

/** Turns the project's details on or off for the AI. Hidden when the project has none. */
export function DetailsChip({ details }: { details: string[] }) {
  const [enabled, setEnabled] = useProjectDetails();
  if (details.length === 0) return null;

  const list = joinList(details.map((detail) => detail.toLowerCase()));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={cn(
            "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs whitespace-nowrap transition-colors select-none hover:bg-muted hover:text-foreground",
            enabled ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} className="size-3.5" />
          {/* Shortens inside a narrow `@container/ai-controls`; without that container the full label shows. */}
          <span className="@max-[21rem]/ai-controls:hidden">Use Project Details</span>
          <span className="hidden @max-[21rem]/ai-controls:inline">Details</span>
        </label>
      </TooltipTrigger>
      <TooltipContent className="block max-w-56">
        {enabled
          ? `The AI reads the script and your project's ${list}.`
          : `The AI reads only the script. Turn on to include your project's ${list}.`}
      </TooltipContent>
    </Tooltip>
  );
}

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
