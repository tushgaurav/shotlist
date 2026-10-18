import { Suspense } from "react";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getNewProjectOptions } from "@/lib/dal/project-types";
import { listProjects } from "@/lib/dal/projects";

import { ProjectSwitcher, SidebarToggle } from "./header-controls";

/** The bar at the top of every signed-in page: sidebar toggle, page title, project switcher. */
export function AppHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <SidebarToggle />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      <Suspense fallback={<Skeleton className="h-7 w-36" />}>
        <ProjectSwitcherLoader />
      </Suspense>
    </header>
  );
}

async function ProjectSwitcherLoader() {
  const [projects, newProject] = await Promise.all([listProjects(), getNewProjectOptions()]);
  return (
    <ProjectSwitcher
      projects={projects.map(({ id, title, type, archivedAt }) => ({
        id,
        title,
        icon: type?.icon ?? null,
        archived: archivedAt !== null,
      }))}
      newProject={newProject}
    />
  );
}
