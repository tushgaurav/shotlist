import {
  CalendarDaysIcon,
  ImagesIcon,
  InfoIcon,
  ListVideoIcon,
  NotebookPenIcon,
  ScrollTextIcon,
  type LucideIcon,
} from "lucide-react";

export type ProjectSection = { segment: string; label: string; icon: LucideIcon };

export const PROJECT_SECTIONS: ProjectSection[] = [
  { segment: "notes", label: "Notes", icon: NotebookPenIcon },
  { segment: "moodboards", label: "Mood Boards", icon: ImagesIcon },
  { segment: "script", label: "Script", icon: ScrollTextIcon },
  { segment: "shots", label: "Shot List", icon: ListVideoIcon },
  { segment: "schedule", label: "Schedule", icon: CalendarDaysIcon },
  { segment: "details", label: "Details", icon: InfoIcon },
];
