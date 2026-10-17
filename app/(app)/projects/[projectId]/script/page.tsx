import { FileTextIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Script" };

export default function ScriptPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <EmptyState
        icon={FileTextIcon}
        title="Script editor"
        description="Write your screenplay here, with saved versions you can compare and restore. This is the next milestone."
      />
    </main>
  );
}
