"use client";

import { CheckIcon, ChevronsUpDownIcon, FolderOpenIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

import { TypeIcon } from "@/components/project-type-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import type { ProjectTypeIcon } from "@/lib/projects";

import { PROJECT_SECTIONS } from "./projects/[projectId]/sections";
import { NewProjectDialog, type NewProjectOptions } from "./projects/new-project-dialog";

export type SwitcherProject = { id: string; title: string; icon: ProjectTypeIcon | null; archived: boolean };

export function SidebarToggle() {
  const isMac = useIsMac();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger className="-ml-1" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Toggle sidebar <Kbd>{shortcutLabel(["Mod", "B"], isMac)}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Opens another project at the section you're already on. */
export function ProjectSwitcher({
  projects,
  newProject,
}: {
  projects: SwitcherProject[];
  newProject: NewProjectOptions;
}) {
  const { projectId } = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  // Tied to the path so the dialog closes once the new project's page opens.
  const [creatingOn, setCreatingOn] = useState<string | null>(null);

  const current = projects.find((project) => project.id === projectId);
  const segment = pathname.split("/")[3];
  const section = PROJECT_SECTIONS.find((item) => item.segment === segment) ?? PROJECT_SECTIONS[0];
  const listed = projects.filter((project) => !project.archived || project === current);

  return (
    <>
      {/* Non-modal so the new project dialog can take focus as the menu closes. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="max-w-48 sm:max-w-72"
            aria-label={current ? `Switch project, current: ${current.title}` : "Select a project"}
          >
            {current ? (
              <TypeIcon icon={current.icon} data-icon="inline-start" className="text-muted-foreground" />
            ) : (
              <FolderOpenIcon data-icon="inline-start" className="text-muted-foreground" />
            )}
            <span className="truncate">{current?.title ?? "Select project"}</span>
            <ChevronsUpDownIcon data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {listed.length > 0 && (
            <>
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              {listed.map((project) => {
                const isCurrent = project === current;
                return (
                  <DropdownMenuItem key={project.id} asChild>
                    <Link
                      href={`/projects/${project.id}/${section.segment}`}
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      <TypeIcon icon={project.icon} />
                      <span className="truncate">{project.title}</span>
                      {isCurrent && <CheckIcon className="ml-auto" />}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href="/projects">
              <LayoutGridIcon />
              All projects
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreatingOn(pathname)}>
            <PlusIcon />
            New project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewProjectDialog
        {...newProject}
        open={creatingOn === pathname}
        onOpenChange={(open) => setCreatingOn(open ? pathname : null)}
      />
    </>
  );
}
