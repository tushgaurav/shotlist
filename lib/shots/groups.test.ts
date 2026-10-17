import { describe, expect, it } from "vitest";

import { formatMinutes, groupShots, sceneChanged, shotListCsv, totalMinutes } from "./groups";
import { EMPTY_SHOT, type ShotRecord, type ShotScene } from "./types";

const scene = (id: string, number: string, removed = false): ShotScene => ({
  id,
  number,
  position: Number(number) - 1,
  heading: `INT. ROOM ${number} - DAY`,
  removed,
  contentHash: "h",
  reviewedHash: "h",
  characters: [],
});

const shot = (id: string, sceneId: string | null, extra: Partial<ShotRecord> = {}): ShotRecord => ({
  ...EMPTY_SHOT,
  id,
  sceneId,
  position: `a${id}`,
  suffix: sceneId ? "A" : null,
  ...extra,
});

describe("groupShots", () => {
  it("puts unlinked shots first, scenes in order, standalone last", () => {
    const groups = groupShots(
      [scene("s1", "1"), scene("gone", "2", true), scene("s3", "3")],
      [shot("1", "s3"), shot("2", null), shot("3", "gone"), shot("4", "s1")],
    );
    expect(groups.map((g) => [g.key, g.shots.map((s) => s.id)])).toEqual([
      ["unlinked", ["3"]],
      ["scene:s1", ["4"]],
      ["scene:s3", ["1"]],
      ["standalone", ["2"]],
    ]);
  });

  it("always shows the standalone group, and no unlinked group when there's nothing in it", () => {
    expect(groupShots([], []).map((g) => g.key)).toEqual(["standalone"]);
  });
});

describe("sceneChanged", () => {
  it("only flags scenes that have shots", () => {
    const changed = { ...scene("s1", "1"), reviewedHash: "old" };
    expect(sceneChanged(changed, 2)).toBe(true);
    expect(sceneChanged(changed, 0)).toBe(false);
    expect(sceneChanged(scene("s1", "1"), 2)).toBe(false);
  });
});

describe("time", () => {
  it("leaves omitted shots out of the total", () => {
    expect(
      totalMinutes([
        shot("1", null, { estShootMinutes: 30 }),
        shot("2", null, { estShootMinutes: 15, status: "omitted" }),
        shot("3", null),
      ]),
    ).toBe(30);
  });

  it("formats hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(125)).toBe("2h 5m");
  });
});

describe("shotListCsv", () => {
  it("writes one row per shot with its label and scene", () => {
    const csv = shotListCsv(
      [scene("s1", "12"), scene("gone", "3", true)],
      [
        shot("1", "s1", { suffix: "B", description: "Wide, establishing", vfx: true, estShootMinutes: 20 }),
        shot("2", null, { customLabel: "BR1", status: "shot" }),
        shot("3", "gone"),
      ],
    );
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0].startsWith("Scene,Heading,Shot,Description")).toBe(true);
    expect(lines.slice(1)).toEqual([
      "3 (removed),INT. ROOM 3 - DAY,3A,,,,,,,,,,,,,,,Planned,",
      '12,INT. ROOM 12 - DAY,12B,"Wide, establishing",,,,,,,,,,,,Yes,20,Planned,',
      ",,BR1,,,,,,,,,,,,,,,Shot,",
    ]);
  });
});
