import { ListVideoIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Shot list" };

export default function ShotsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <EmptyState
        icon={ListVideoIcon}
        title="Shot list"
        description="Plan every shot scene by scene, then switch to a storyboard view. Shots will link to the scenes in your script."
      />
    </main>
  );
}
