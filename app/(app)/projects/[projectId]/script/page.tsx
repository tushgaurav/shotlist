import { cn } from "cn";
import type { Metadata } from "next";
import { Courier_Prime } from "next/font/google";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { filledDetails } from "@/lib/ai/context";
import { aiEnabled } from "@/lib/ai/provider";
import { getProject } from "@/lib/dal/projects";
import { getOrCreateScript } from "@/lib/dal/scripts";
import { getShotList } from "@/lib/dal/shots";
import { storageEnabled } from "@/lib/storage/s3";

import { ScriptWorkspace } from "./script-workspace";

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-screenplay",
});

export const metadata: Metadata = { title: "Script" };

export default function ScriptPage({ params }: PageProps<"/projects/[projectId]/script">) {
  return (
    <main className={cn("flex flex-1 flex-col", courierPrime.variable)}>
      <Suspense fallback={<ScriptSkeleton />}>
        <ScriptLoader params={params} />
      </Suspense>
    </main>
  );
}

async function ScriptLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, script, shots] = await Promise.all([
    getProject(projectId),
    getOrCreateScript(projectId),
    getShotList(projectId),
  ]);

  return (
    <ScriptWorkspace
      key={script.id}
      projectId={projectId}
      projectTitle={project.title}
      script={{
        id: script.id,
        draft: script.draft,
        draftRevision: script.draftRevision,
        titlePage: script.titlePage,
      }}
      shots={shots}
      imagesEnabled={storageEnabled()}
      ai={{
        enabled: aiEnabled(),
        details: filledDetails({ ...project, typeName: project.type?.name ?? null }),
        targetRuntimeMinutes: project.targetRuntimeMinutes,
      }}
    />
  );
}

function ScriptSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-5 w-48" />
      </div>
      <div className="flex-1 bg-muted/60 px-3 py-6 sm:px-8 sm:py-10">
        <div className="screenplay-page space-y-4" style={{ minHeight: "11in" }}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
