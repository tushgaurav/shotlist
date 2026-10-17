import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { NewProjectDialog } from "./new-project-dialog";
import { ProjectList } from "./project-list";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each project holds one script and its shot list.
          </p>
        </div>
        <NewProjectDialog />
      </div>
      <Suspense fallback={<ProjectGridSkeleton />}>
        <ProjectList />
      </Suspense>
    </main>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}
