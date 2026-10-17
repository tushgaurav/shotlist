import { FolderOpenIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FormattedDate } from "@/components/formatted-date";
import { Badge } from "@/components/ui/badge";
import { listProjects, type ProjectSummary } from "@/lib/dal/projects";
import { PROJECT_KIND_LABELS } from "@/lib/projects";

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
        <NewProjectDialog />
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
      className="relative flex min-h-32 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 data-[archived=true]:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="leading-snug font-medium text-pretty">
          <Link
            href={`/projects/${project.id}/script`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {project.title}
          </Link>
        </h3>
        <ProjectCardMenu projectId={project.id} title={project.title} archived={archived} />
      </div>
      <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={archived ? "outline" : "secondary"}>
          {archived ? "Archived" : PROJECT_KIND_LABELS[project.kind]}
        </Badge>
        <span>
          Updated <FormattedDate value={project.updatedAt.toISOString()} />
        </span>
      </div>
    </div>
  );
}
