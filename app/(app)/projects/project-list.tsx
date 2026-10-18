import { FolderOpenIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FormattedDate } from "@/components/formatted-date";
import { ProjectCover } from "@/components/project-cover";
import { TypeIcon } from "@/components/project-type-icon";
import { Badge } from "@/components/ui/badge";
import { getNewProjectOptions } from "@/lib/dal/project-types";
import { listProjects, type ProjectSummary } from "@/lib/dal/projects";

import { NewProjectDialog } from "./new-project-dialog";
import { ProjectCardMenu } from "./project-card-menu";

export async function ProjectList() {
  const projects = await listProjects();

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpenIcon}
        title="No projects yet"
        description="Create a project for your next production. It will hold the script, the shot list and the shooting schedule."
      >
        <NewProjectDialog {...await getNewProjectOptions()} />
      </EmptyState>
    );
  }

  const active = projects.filter((project) => !project.archivedAt);
  const archived = projects.filter((project) => project.archivedAt);

  return (
    <div className="flex flex-col gap-12">
      {active.length > 0 ? (
        <ProjectGrid projects={active} />
      ) : (
        <p className="text-sm text-muted-foreground">
          All your projects are archived. Restore one below or create a new one.
        </p>
      )}
      {archived.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          <ProjectGrid projects={archived} />
        </section>
      )}
    </div>
  );
}

function ProjectGrid({ projects }: { projects: ProjectSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const archived = project.archivedAt !== null;

  return (
    <div
      data-archived={archived}
      className="group/card relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 data-[archived=true]:bg-muted/40"
    >
      <ProjectCover
        coverImageId={project.coverImageId}
        icon={project.type?.icon}
        variant="thumb"
        className="aspect-video border-b group-data-[archived=true]/card:opacity-60 group-data-[archived=true]/card:grayscale"
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base leading-snug font-medium text-pretty">
            <Link
              href={`/projects/${project.id}/script`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {project.title}
            </Link>
          </h3>
          <ProjectCardMenu projectId={project.id} title={project.title} archived={archived} />
        </div>
        <div className="mt-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {archived ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            project.type && (
              <Badge variant="secondary" className="min-w-0">
                <TypeIcon icon={project.type.icon} data-icon="inline-start" />
                <span className="truncate">{project.type.name}</span>
              </Badge>
            )
          )}
          <span className="shrink-0">
            Updated <FormattedDate value={project.updatedAt.toISOString()} />
          </span>
        </div>
      </div>
    </div>
  );
}
