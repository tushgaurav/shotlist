import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { getNewProjectOptions } from "@/lib/dal/project-types";

import { AppHeader } from "../app-header";
import { NewProjectButton, NewProjectDialog } from "./new-project-dialog";
import { ProjectList } from "./project-list";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <AppHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Projects</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </AppHeader>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project holds one script and its shot list.
            </p>
          </div>
          <Suspense fallback={<NewProjectButton disabled />}>
            <NewProjectDialogLoader />
          </Suspense>
        </div>
        <Suspense fallback={<ProjectGridSkeleton />}>
          <ProjectList />
        </Suspense>
      </main>
    </>
  );
}

async function NewProjectDialogLoader() {
  return <NewProjectDialog {...await getNewProjectOptions()} />;
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-video rounded-none" />
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
