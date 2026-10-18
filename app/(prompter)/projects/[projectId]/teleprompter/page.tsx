import type { Metadata } from "next";
import { Suspense } from "react";

import { getOrCreateScript } from "@/lib/dal/scripts";

import { Teleprompter } from "./teleprompter";

export const metadata: Metadata = { title: "Teleprompter" };

// Outside the (app) group so it fills the screen without the sidebar and header.
export default function TeleprompterPage({ params }: PageProps<"/projects/[projectId]/teleprompter">) {
  return (
    <main className="fixed inset-0 bg-black">
      <Suspense fallback={<p className="grid h-full place-items-center text-sm text-white/50">Loading script…</p>}>
        <TeleprompterLoader params={params} />
      </Suspense>
    </main>
  );
}

async function TeleprompterLoader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const script = await getOrCreateScript(projectId);
  return <Teleprompter key={script.id} projectId={projectId} draft={script.draft} />;
}
