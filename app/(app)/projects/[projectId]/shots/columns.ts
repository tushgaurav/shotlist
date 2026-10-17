import { useMemo, useSyncExternalStore } from "react";

import {
  SHOT_ANGLES,
  SHOT_CAMERAS,
  SHOT_EQUIPMENT,
  SHOT_FRAME_RATES,
  SHOT_LENSES,
  SHOT_MOVEMENTS,
  SHOT_SIZES,
  SHOT_SOUND,
  SHOT_TYPES,
  type PresetOption,
} from "@/lib/shots/presets";
import type { ShotTextField } from "@/lib/shots/types";

type Base = { label: string; width: number; defaultVisible: boolean; grow?: boolean };

export type ShotColumn = Base &
  (
    | { kind: "text" | "longtext"; field: ShotTextField; placeholder?: string }
    | {
        kind: "preset";
        field: ShotTextField;
        /** "characters" offers the speaking characters of the shot's scene. */
        presets: PresetOption[] | "characters";
        /** Comma-separated values; suggestions complete the last one. */
        multiple?: boolean;
      }
    | { kind: "number"; field: "estShootMinutes" }
    | { kind: "check"; field: "vfx" }
    | { kind: "status"; field: "status" }
  );

export type ColumnField = ShotColumn["field"];

export const SHOT_COLUMNS: ShotColumn[] = [
  { field: "description", label: "Description", kind: "longtext", width: 280, grow: true, defaultVisible: true, placeholder: "What we see" },
  { field: "size", label: "Size", kind: "preset", presets: SHOT_SIZES, width: 84, defaultVisible: true },
  { field: "shotType", label: "Type", kind: "preset", presets: SHOT_TYPES, width: 116, defaultVisible: true },
  { field: "angle", label: "Angle", kind: "preset", presets: SHOT_ANGLES, width: 112, defaultVisible: false },
  { field: "movement", label: "Movement", kind: "preset", presets: SHOT_MOVEMENTS, width: 120, defaultVisible: true },
  { field: "lens", label: "Lens", kind: "preset", presets: SHOT_LENSES, width: 84, defaultVisible: true },
  { field: "camera", label: "Camera", kind: "preset", presets: SHOT_CAMERAS, width: 80, defaultVisible: false },
  { field: "frameRate", label: "Frame rate", kind: "preset", presets: SHOT_FRAME_RATES, width: 96, defaultVisible: false },
  { field: "subjects", label: "Subjects", kind: "preset", presets: "characters", multiple: true, width: 160, defaultVisible: true },
  { field: "equipment", label: "Equipment", kind: "preset", presets: SHOT_EQUIPMENT, multiple: true, width: 140, defaultVisible: false },
  { field: "sound", label: "Sound", kind: "preset", presets: SHOT_SOUND, width: 100, defaultVisible: false },
  { field: "locationNote", label: "Location note", kind: "text", width: 160, defaultVisible: false },
  { field: "vfx", label: "VFX", kind: "check", width: 56, defaultVisible: false },
  { field: "estShootMinutes", label: "Minutes", kind: "number", width: 76, defaultVisible: true },
  { field: "status", label: "Status", kind: "status", width: 112, defaultVisible: true },
  { field: "notes", label: "Notes", kind: "longtext", width: 220, defaultVisible: false },
];

const DEFAULT_VISIBLE = SHOT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.field);
const CHANGE_EVENT = "shotlist:columns-change";

const storageKey = (projectId: string) => `shotlist:shot-columns:${projectId}`;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function parse(raw: string | null): ColumnField[] {
  if (!raw) return DEFAULT_VISIBLE;
  try {
    const fields: unknown = JSON.parse(raw);
    if (!Array.isArray(fields)) return DEFAULT_VISIBLE;
    return SHOT_COLUMNS.filter((c) => fields.includes(c.field)).map((c) => c.field);
  } catch {
    return DEFAULT_VISIBLE;
  }
}

/** Which columns are shown, remembered per project on this device. */
export function useColumnVisibility(projectId: string) {
  const key = storageKey(projectId);
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null,
  );

  return useMemo(() => {
    const visible = parse(raw);
    const save = (fields: ColumnField[] | null) => {
      if (fields) window.localStorage.setItem(key, JSON.stringify(fields));
      else window.localStorage.removeItem(key);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    };
    return {
      columns: SHOT_COLUMNS.filter((c) => visible.includes(c.field)),
      isVisible: (field: ColumnField) => visible.includes(field),
      toggle: (field: ColumnField) =>
        save(visible.includes(field) ? visible.filter((f) => f !== field) : [...visible, field]),
      reset: () => save(null),
    };
  }, [key, raw]);
}

/** Drag handle and label on the left, row menu on the right. */
export function gridTemplate(columns: ShotColumn[]) {
  const middle = columns.map((c) => (c.grow ? `minmax(${c.width}px, 1fr)` : `${c.width}px`));
  return {
    gridTemplateColumns: ["28px", "72px", ...middle, "40px"].join(" "),
    minWidth: 28 + 72 + 40 + columns.reduce((sum, c) => sum + c.width, 0),
  };
}
