import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { LoadedShotList } from "./shot-list";

export const metadata: Metadata = { title: "Shot List" };

// The data comes from the (workspace) layout, so there's nothing to wait for here when
// switching over from the script.
export default function ShotsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<ShotListSkeleton />}>
        <LoadedShotList />
      </Suspense>
    </main>
  );
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
