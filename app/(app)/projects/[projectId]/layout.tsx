import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getProject } from "@/lib/dal/projects";
import { PROJECT_KIND_LABELS } from "@/lib/projects";

import { ProjectTabs } from "./project-tabs";

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  return (
    <>
      <div className="border-b">
        <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
          <Suspense fallback={<ProjectHeaderSkeleton />}>
            <ProjectHeader params={params} />
          </Suspense>
        </div>
      </div>
      {children}
    </>
  );
}

async function ProjectHeader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/projects" className="transition-colors hover:text-foreground">
          Projects
        </Link>
      </nav>
      <div className="mt-1 flex min-w-0 items-center gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{project.title}</h1>
        <Badge variant="secondary">{PROJECT_KIND_LABELS[project.kind]}</Badge>
        {project.archivedAt && <Badge variant="outline">Archived</Badge>}
      </div>
      <ProjectTabs projectId={project.id} />
    </>
  );
}

function ProjectHeaderSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-5 w-16" />
      <Skeleton className="mt-2 h-8 w-64" />
      <div className="mt-4 flex gap-6 pb-3">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}
