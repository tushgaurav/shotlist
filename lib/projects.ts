export const PROJECT_KINDS = [
  "short",
  "feature",
  "commercial",
  "music_video",
  "other",
] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  short: "Short film",
  feature: "Feature film",
  commercial: "Commercial",
  music_video: "Music video",
  other: "Other",
};

export const PROJECT_TITLE_MAX_LENGTH = 120;
