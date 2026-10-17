import { CalendarDaysIcon, ListVideoIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";

export type ProjectSection = { segment: string; label: string; icon: LucideIcon };

export const PROJECT_SECTIONS: ProjectSection[] = [
  { segment: "script", label: "Script", icon: ScrollTextIcon },
  { segment: "shots", label: "Shot list", icon: ListVideoIcon },
  { segment: "schedule", label: "Schedule", icon: CalendarDaysIcon },
];
