import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { listNotes } from "@/lib/dal/notes";
import { getProject } from "@/lib/dal/projects";

import { NotesWorkspace } from "./notes-workspace";

export const metadata: Metadata = { title: "Notes" };

export default function NotesPage({ params }: PageProps<"/projects/[projectId]/notes">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<NotesSkeleton />}>
        <NotesLoader params={params} />
      </Suspense>
    </main>
  );
}

// Notes are short, so the page loads all of them and switching between them is instant.
async function NotesLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, notes] = await Promise.all([getProject(projectId), listNotes(projectId)]);

  return (
    <NotesWorkspace
      key={projectId}
      projectId={projectId}
      projectTitle={project.title}
      notes={notes.map((note) => ({ ...note, updatedAt: note.updatedAt.toISOString() }))}
    />
  );
}

function NotesSkeleton() {
  return (
    <div aria-hidden className="flex flex-1">
      <div className="hidden w-72 shrink-0 flex-col gap-1 border-r p-2 md:flex">
        <Skeleton className="mx-2 my-2.5 h-7 w-28" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-1.5 px-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="flex-1">
        <div className="h-12 border-b" />
        <div className="mx-auto max-w-2xl space-y-3 px-6 py-8 sm:px-10">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
