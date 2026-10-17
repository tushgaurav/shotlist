"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const TABS = [
  { segment: "script", label: "Script" },
  { segment: "shots", label: "Shot list" },
  { segment: "schedule", label: "Schedule" },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const activeSegment = useSelectedLayoutSegment();

  return (
    <nav aria-label="Project sections" className="-mb-px mt-4 flex gap-6">
      {TABS.map((tab) => (
        <Link
          key={tab.segment}
          href={`/projects/${projectId}/${tab.segment}`}
          aria-current={activeSegment === tab.segment ? "page" : undefined}
          className="border-b-2 border-transparent pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
