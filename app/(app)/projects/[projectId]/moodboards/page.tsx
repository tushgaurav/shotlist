import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getMoodboards, listProjectImages } from "@/lib/dal/moodboards";
import { getProject } from "@/lib/dal/projects";
import { storageEnabled } from "@/lib/storage/s3";

import { MoodboardsWorkspace } from "./moodboards-workspace";

export const metadata: Metadata = { title: "Mood Boards" };

export default function MoodboardsPage({ params }: PageProps<"/projects/[projectId]/moodboards">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<MoodboardsSkeleton />}>
        <MoodboardsLoader params={params} />
      </Suspense>
    </main>
  );
}

// Every board loads at once, as notes do, so switching between them is instant.
async function MoodboardsLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, data, images] = await Promise.all([
    getProject(projectId),
    getMoodboards(projectId),
    listProjectImages(projectId),
  ]);

  return (
    <MoodboardsWorkspace
      key={projectId}
      projectId={projectId}
      projectTitle={project.title}
      data={data}
      images={images}
      imagesEnabled={storageEnabled()}
    />
  );
}

function MoodboardsSkeleton() {
  return (
    <div aria-hidden className="flex flex-1">
      <div className="hidden w-72 shrink-0 flex-col gap-1 border-r p-2 md:flex">
        <Skeleton className="mx-2 my-2.5 h-7 w-28" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-2 py-1.5">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="h-12 border-b" />
        <div className="grid flex-1 grid-cols-2 items-start gap-3 bg-muted/40 p-3 sm:p-5 lg:grid-cols-3">
          {[4 / 3, 3 / 4, 1, 16 / 9, 4 / 5, 3 / 2].map((aspect, index) => (
            <Skeleton key={index} className="w-full rounded-lg" style={{ aspectRatio: aspect }} />
          ))}
        </div>
      </div>
    </div>
  );
}
