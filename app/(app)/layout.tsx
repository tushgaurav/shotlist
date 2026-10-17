import { Suspense } from "react";

import { Brand } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Brand />
          <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
