import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-6">
      <EmptyState
        icon={SearchXIcon}
        title="Project not found"
        description="It may have been removed, or it belongs to a different account."
      >
        <Button asChild variant="outline">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
