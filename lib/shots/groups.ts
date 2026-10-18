import { toCsv } from "./csv";
import { shotLabel } from "./numbering";
import { SHOT_STATUS_LABELS, type ShotRecord, type ShotScene } from "./types";

export type ShotGroup =
  | { kind: "unlinked"; key: "unlinked"; scene: null; shots: ShotRecord[] }
  | { kind: "scene"; key: string; scene: ShotScene; shots: ShotRecord[] }
  | { kind: "standalone"; key: "standalone"; scene: null; shots: ShotRecord[] };

/**
 * Unlinked shots (their scene was removed) first, then scenes in script order, then
 * standalone shots. Shots must already be sorted.
 */
export function groupShots(scenes: ShotScene[], shots: ShotRecord[]): ShotGroup[] {
  const live = new Map(scenes.filter((scene) => !scene.removed).map((scene) => [scene.id, scene]));
  const byScene = new Map<string, ShotRecord[]>();
  const unlinked: ShotRecord[] = [];
  const standalone: ShotRecord[] = [];

  for (const shot of shots) {
    if (shot.sceneId === null) standalone.push(shot);
    else if (!live.has(shot.sceneId)) unlinked.push(shot);
    else byScene.set(shot.sceneId, [...(byScene.get(shot.sceneId) ?? []), shot]);
  }

  const groups: ShotGroup[] = [];
  if (unlinked.length > 0) groups.push({ kind: "unlinked", key: "unlinked", scene: null, shots: unlinked });
  for (const scene of live.values()) {
    groups.push({ kind: "scene", key: `scene:${scene.id}`, scene, shots: byScene.get(scene.id) ?? [] });
  }
  groups.push({ kind: "standalone", key: "standalone", scene: null, shots: standalone });
  return groups;
}

/** Shots with changes to their scene's text since they were last reviewed. */
export function sceneChanged(scene: ShotScene, shotCount: number) {
  return shotCount > 0 && scene.reviewedHash !== scene.contentHash;
}

/** Omitted shots don't count towards shooting time. */
export function totalMinutes(shots: ShotRecord[]) {
  return shots.reduce(
    (total, shot) => total + (shot.status === "omitted" ? 0 : (shot.estShootMinutes ?? 0)),
    0,
  );
}

/** 45 → "45m", 125 → "2h 5m". */
export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function shotListCsv(scenes: ShotScene[], shots: ShotRecord[]) {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const rows = groupShots(scenes, shots).flatMap((group) =>
    group.shots.map((shot) => {
      const scene = shot.sceneId ? byId.get(shot.sceneId) : undefined;
      return [
        scene ? (scene.removed ? `${scene.number} (removed)` : scene.number) : "",
        scene?.heading ?? "",
        shotLabel(scene?.number, shot.suffix, shot.customLabel),
        shot.description,
        shot.size,
        shot.shotType,
        shot.angle,
        shot.movement,
        shot.lens,
        shot.camera,
        shot.frameRate,
        shot.subjects,
        shot.equipment,
        shot.sound,
        shot.locationNote,
        shot.vfx ? "Yes" : "",
        shot.estShootMinutes,
        SHOT_STATUS_LABELS[shot.status],
        shot.notes,
      ];
    }),
  );
  return toCsv([
    [
      "Scene",
      "Heading",
      "Shot",
      "Description",
      "Size",
      "Type",
      "Angle",
      "Movement",
      "Lens",
      "Camera",
      "Frame Rate",
      "Subjects",
      "Equipment",
      "Sound",
      "Location Note",
      "VFX",
      "Est. Minutes",
      "Status",
      "Notes",
    ],
    ...rows,
  ]);
}
