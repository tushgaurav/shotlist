import { LinkIcon } from "lucide-react";

import { SidebarWordmark } from "@/app/(app)/sidebar-wordmark";
import { EmptyState } from "@/components/empty-state";

export default function SharedNotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 items-center border-b px-4">
        <SidebarWordmark className="h-6" />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <EmptyState
          icon={LinkIcon}
          title="This link isn't available"
          description="It may have been turned off or replaced with a new one. Ask whoever sent it for the current link."
        />
      </main>
    </div>
  );
}
