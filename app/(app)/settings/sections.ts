import { ShapesIcon, ShieldCheckIcon, UserIcon, type LucideIcon } from "lucide-react";

export type SettingsSection = { segment: string; label: string; icon: LucideIcon };

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { segment: "profile", label: "Profile", icon: UserIcon },
  { segment: "security", label: "Security", icon: ShieldCheckIcon },
  { segment: "project-types", label: "Project Types", icon: ShapesIcon },
];
