import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { listProjectTypes } from "@/lib/dal/project-types";
import { getProject } from "@/lib/dal/projects";
import { storageEnabled } from "@/lib/storage/s3";

import { SettingsCardSkeleton } from "../../../settings/settings-card";
import { CoverField } from "./cover-field";
import { ProjectDetailsForm } from "./project-details-form";

export const metadata: Metadata = { title: "Details" };

export default function DetailsPage({ params }: PageProps<"/projects/[projectId]/details">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 sm:px-6 sm:pt-10">
      <Suspense fallback={<DetailsSkeleton />}>
        <DetailsLoader params={params} />
      </Suspense>
    </main>
  );
}

async function DetailsLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, types] = await Promise.all([getProject(projectId), listProjectTypes()]);

  return (
    <div className="flex flex-col gap-6">
      <CoverField projectId={projectId} coverImageId={project.coverImageId} enabled={storageEnabled()} />
      <ProjectDetailsForm
        key={projectId}
        project={{
          id: project.id,
          title: project.title,
          typeId: project.type?.id ?? null,
          logline: project.logline,
          synopsis: project.synopsis,
          genre: project.genre,
          tone: project.tone,
          targetRuntimeMinutes: project.targetRuntimeMinutes,
          aspectRatio: project.aspectRatio,
          language: project.language,
        }}
        types={types.map(({ id, name, icon }) => ({ id, name, icon }))}
      />
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <Skeleton className="aspect-3/1 rounded-xl" />
      <SettingsCardSkeleton rows={2} />
      <SettingsCardSkeleton rows={4} />
    </div>
  );
}
