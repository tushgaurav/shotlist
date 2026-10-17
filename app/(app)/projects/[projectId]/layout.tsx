import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { getProject } from "@/lib/dal/projects";

import { AppHeader } from "../../app-header";
import { SectionCrumb } from "./section-crumb";

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  return (
    <>
      <AppHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Suspense fallback={<Skeleton className="h-4 w-16" />}>
                <SectionCrumb />
              </Suspense>
              <Suspense>
                <ArchivedBadge params={params} />
              </Suspense>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </AppHeader>
      {children}
    </>
  );
}

// Also what turns an unknown project id into the not-found page for every section.
async function ArchivedBadge({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return project.archivedAt ? (
    <Badge variant="outline" className="ml-1">
      Archived
    </Badge>
  ) : null;
}
