import { CalendarDaysIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <EmptyState
        icon={CalendarDaysIcon}
        title="Shooting Schedule"
        description="Group shots into setups and shoot days, with time estimates for each day."
      />
    </main>
  );
}
