import {
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  CameraIcon,
  ClapperboardIcon,
  DramaIcon,
  FilmIcon,
  FolderIcon,
  Gamepad2Icon,
  GraduationCapIcon,
  HeartIcon,
  MegaphoneIcon,
  MicIcon,
  MonitorPlayIcon,
  MusicIcon,
  NewspaperIcon,
  PaletteIcon,
  PlaneIcon,
  PodcastIcon,
  ProjectorIcon,
  SmartphoneIcon,
  SparklesIcon,
  TvIcon,
  VideoIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

import type { ProjectTypeIcon } from "@/lib/projects";

export const PROJECT_TYPE_ICON_DETAILS: Record<ProjectTypeIcon, { label: string; Icon: LucideIcon }> = {
  film: { label: "Film", Icon: FilmIcon },
  projector: { label: "Projector", Icon: ProjectorIcon },
  clapperboard: { label: "Clapperboard", Icon: ClapperboardIcon },
  megaphone: { label: "Megaphone", Icon: MegaphoneIcon },
  music: { label: "Music", Icon: MusicIcon },
  "monitor-play": { label: "Video Player", Icon: MonitorPlayIcon },
  smartphone: { label: "Phone", Icon: SmartphoneIcon },
  tv: { label: "TV", Icon: TvIcon },
  video: { label: "Video Camera", Icon: VideoIcon },
  camera: { label: "Camera", Icon: CameraIcon },
  mic: { label: "Microphone", Icon: MicIcon },
  podcast: { label: "Podcast", Icon: PodcastIcon },
  "graduation-cap": { label: "Graduation Cap", Icon: GraduationCapIcon },
  briefcase: { label: "Briefcase", Icon: BriefcaseIcon },
  building: { label: "Building", Icon: Building2Icon },
  heart: { label: "Heart", Icon: HeartIcon },
  plane: { label: "Plane", Icon: PlaneIcon },
  gamepad: { label: "Game Controller", Icon: Gamepad2Icon },
  newspaper: { label: "Newspaper", Icon: NewspaperIcon },
  drama: { label: "Theatre Masks", Icon: DramaIcon },
  palette: { label: "Palette", Icon: PaletteIcon },
  sparkles: { label: "Sparkles", Icon: SparklesIcon },
  "book-open": { label: "Book", Icon: BookOpenIcon },
  folder: { label: "Folder", Icon: FolderIcon },
};

/** A project type's icon. A folder for projects without a type, or for icons this version doesn't know. */
export function TypeIcon({ icon, ...props }: { icon: string | null | undefined } & LucideProps) {
  const { Icon } = PROJECT_TYPE_ICON_DETAILS[icon as ProjectTypeIcon] ?? PROJECT_TYPE_ICON_DETAILS.folder;
  return <Icon {...props} />;
}
