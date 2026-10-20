import { cn } from "cn";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { courierPrime } from "@/lib/screenplay/font";

import { LoadedScriptWorkspace } from "./script-workspace";

export const metadata: Metadata = { title: "Script" };

// The data comes from the (workspace) layout, so there's nothing to wait for here when
// switching over from the shot list.
export default function ScriptPage() {
  return (
    <main className={cn("flex flex-1 flex-col", courierPrime.variable)}>
      <Suspense fallback={<ScriptSkeleton />}>
        <LoadedScriptWorkspace />
      </Suspense>
    </main>
  );
}

function ScriptSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-5 w-48" />
      </div>
      <div className="@container/page flex-1 bg-muted/60 px-3 py-6 sm:px-8 sm:py-10">
        <div className="screenplay-page space-y-4" style={{ minHeight: "11in" }}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
