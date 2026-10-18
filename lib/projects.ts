import type { PresetOption } from "./shots/presets";

export const PROJECT_TITLE_MAX_LENGTH = 120;
export const PROJECT_TYPE_NAME_MAX_LENGTH = 40;

/** Icons a project type can use. The keys are stored, so don't rename them. */
export const PROJECT_TYPE_ICONS = [
  "film",
  "projector",
  "clapperboard",
  "megaphone",
  "music",
  "monitor-play",
  "smartphone",
  "tv",
  "video",
  "camera",
  "mic",
  "podcast",
  "graduation-cap",
  "briefcase",
  "building",
  "heart",
  "plane",
  "gamepad",
  "newspaper",
  "drama",
  "palette",
  "sparkles",
  "book-open",
  "folder",
] as const;

export type ProjectTypeIcon = (typeof PROJECT_TYPE_ICONS)[number];

export const DEFAULT_PROJECT_TYPE_ICON: ProjectTypeIcon = "folder";

/** Every account starts with these. They're ordinary types: the user can rename or delete them. */
export const DEFAULT_PROJECT_TYPES: { name: string; icon: ProjectTypeIcon }[] = [
  { name: "Short Film", icon: "film" },
  { name: "Feature Film", icon: "projector" },
  { name: "Commercial", icon: "megaphone" },
  { name: "Music Video", icon: "music" },
];

export type ProjectTypeOption = { id: string; name: string; icon: ProjectTypeIcon };

/** One of the user's types, none, or a type picked by name (created if it doesn't exist yet). */
export type ProjectTypeChoice = { typeId: string | null } | { newType: { name: string; icon: ProjectTypeIcon } };

/** The type of the newest project, which new projects start with. */
export function lastUsedTypeId(types: { id: string; lastUsedAt: Date | null }[]) {
  let latest: { id: string; lastUsedAt: Date | null } | undefined;
  for (const type of types) {
    if (type.lastUsedAt && (!latest?.lastUsedAt || type.lastUsedAt > latest.lastUsedAt)) latest = type;
  }
  return latest?.id ?? null;
}

/** Optional details about the story and format, also meant as context for AI features. */
export type ProjectDetails = {
  logline: string | null;
  synopsis: string | null;
  genre: string | null;
  tone: string | null;
  targetRuntimeMinutes: number | null;
  aspectRatio: string | null;
  language: string | null;
};

export type ProjectInput = Partial<ProjectDetails & { title: string; type: ProjectTypeChoice }>;

export const PROJECT_DETAIL_MAX_LENGTH = {
  logline: 300,
  synopsis: 5000,
  genre: 200,
  tone: 1000,
  aspectRatio: 20,
  language: 60,
} satisfies Partial<Record<keyof ProjectDetails, number>>;

export const PROJECT_RUNTIME_MAX_MINUTES = 6000;

const options = (values: string[]): PresetOption[] => values.map((value) => ({ value }));

export const PROJECT_GENRES = options([
  "Drama",
  "Comedy",
  "Thriller",
  "Horror",
  "Action",
  "Romance",
  "Sci-Fi",
  "Fantasy",
  "Mystery",
  "Crime",
  "Documentary",
  "Animation",
  "Family",
  "Musical",
  "Experimental",
]);

export const PROJECT_ASPECT_RATIOS: PresetOption[] = [
  { value: "16:9", hint: "HD, YouTube" },
  { value: "2.39:1", hint: "Anamorphic Widescreen" },
  { value: "1.85:1", hint: "Flat Widescreen" },
  { value: "2:1", hint: "Univisium" },
  { value: "4:3", hint: "Academy, Classic TV" },
  { value: "1:1", hint: "Square" },
  { value: "4:5", hint: "Instagram Feed" },
  { value: "9:16", hint: "Vertical: Reels, Shorts, TikTok" },
];

export const PROJECT_LANGUAGES = options([
  "English",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Korean",
  "Mandarin",
  "Arabic",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
]);
