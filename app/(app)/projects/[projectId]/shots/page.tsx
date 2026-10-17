import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getProject } from "@/lib/dal/projects";
import { getShotList } from "@/lib/dal/shots";

import { ShotList } from "./shot-list";

export const metadata: Metadata = { title: "Shot list" };

export default function ShotsPage({ params }: PageProps<"/projects/[projectId]/shots">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<ShotListSkeleton />}>
        <ShotListLoader params={params} />
      </Suspense>
    </main>
  );
}

async function ShotListLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, data] = await Promise.all([getProject(projectId), getShotList(projectId)]);
  return <ShotList key={projectId} projectId={projectId} projectTitle={project.title} data={data} />;
}

function ShotListSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-5 w-56" />
      </div>
      <div className="h-9 border-b bg-muted" />
      {Array.from({ length: 3 }, (_, group) => (
        <div key={group}>
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2.5">
            <Skeleton className="h-5 w-6" />
            <Skeleton className="h-4 w-56" />
          </div>
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="flex items-center gap-6 border-b px-9 py-2.5">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
