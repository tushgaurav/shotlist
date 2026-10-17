export const SHOT_STATUSES = ["planned", "shot", "omitted"] as const;
export type ShotStatus = (typeof SHOT_STATUSES)[number];

export const SHOT_STATUS_LABELS: Record<ShotStatus, string> = {
  planned: "Planned",
  shot: "Shot",
  omitted: "Omitted",
};

/** Free-text fields. Empty strings are stored as null (description as ""). */
export const SHOT_TEXT_FIELDS = [
  "customLabel",
  "description",
  "size",
  "shotType",
  "angle",
  "movement",
  "lens",
  "camera",
  "frameRate",
  "subjects",
  "equipment",
  "sound",
  "locationNote",
  "notes",
] as const;
export type ShotTextField = (typeof SHOT_TEXT_FIELDS)[number];

export type ShotRecord = {
  id: string;
  sceneId: string | null;
  position: string;
  suffix: string | null;
  customLabel: string | null;
  description: string;
  size: string | null;
  shotType: string | null;
  angle: string | null;
  movement: string | null;
  lens: string | null;
  camera: string | null;
  frameRate: string | null;
  subjects: string | null;
  equipment: string | null;
  sound: string | null;
  locationNote: string | null;
  vfx: boolean;
  estShootMinutes: number | null;
  status: ShotStatus;
  notes: string | null;
};

export type EditableShotField = ShotTextField | "vfx" | "estShootMinutes" | "status";
export type ShotPatch = Partial<Pick<ShotRecord, EditableShotField>>;

export type ShotScene = {
  id: string;
  position: number;
  number: string;
  heading: string;
  removed: boolean;
  contentHash: string;
  reviewedHash: string | null;
  /** Characters with dialogue in the scene, for the subjects column. */
  characters: string[];
};

export const SHOT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type ShotListData = {
  scenes: ShotScene[];
  shots: ShotRecord[];
};

export type ShotMutationError = "unauthorized" | "not_found" | "invalid";
export type ShotMutation<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ShotMutationError };

export const EMPTY_SHOT: Omit<ShotRecord, "id" | "sceneId" | "position" | "suffix"> = {
  customLabel: null,
  description: "",
  size: null,
  shotType: null,
  angle: null,
  movement: null,
  lens: null,
  camera: null,
  frameRate: null,
  subjects: null,
  equipment: null,
  sound: null,
  locationNote: null,
  vfx: false,
  estShootMinutes: null,
  status: "planned",
  notes: null,
};

type Ordered = { position: string; id: string };

/** Order keys are compared as plain strings (code units), never with a locale. */
export function compareShots(a: Ordered, b: Ordered) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
