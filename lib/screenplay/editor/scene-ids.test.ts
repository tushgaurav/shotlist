import { describe, expect, it } from "vitest";

import { findSceneIdFixes } from "./scene-ids";
import { blocks, idFactory, makeDoc, makeState, schema } from "./test-utils";

describe("sceneIds plugin", () => {
  it("gives a pasted copy of a heading a new ID and leaves the original alone", () => {
    const state = makeState(makeDoc(["sceneHeading", "INT. A", "a"], ["action", "Hi"]));
    const copy = schema.node("sceneHeading", { sceneId: "a" }, schema.text("INT. A"));
    const next = state.applyTransaction(state.tr.insert(state.doc.content.size, copy)).state;
    expect(blocks(next)).toEqual([
      ["sceneHeading", "INT. A", "a"],
      "action:Hi",
      ["sceneHeading", "INT. A", "new1"],
    ]);
  });

  it("keeps the original's ID even when the copy lands before it", () => {
    const state = makeState(makeDoc(["action", "Hi"], ["sceneHeading", "INT. A", "a"]));
    const copy = schema.node("sceneHeading", { sceneId: "a" }, schema.text("INT. A"));
    const next = state.applyTransaction(state.tr.insert(0, copy)).state;
    expect(blocks(next)).toEqual([
      ["sceneHeading", "INT. A", "new1"],
      "action:Hi",
      ["sceneHeading", "INT. A", "a"],
    ]);
  });

  it("keeps the ID when a heading is cut and pasted elsewhere", () => {
    const state = makeState(makeDoc(["sceneHeading", "INT. A", "a"], ["action", "Hi"]));
    const heading = state.doc.child(0);
    const tr = state.tr.delete(0, heading.nodeSize);
    tr.insert(tr.doc.content.size, heading);
    const next = state.applyTransaction(tr).state;
    expect(blocks(next)).toEqual(["action:Hi", ["sceneHeading", "INT. A", "a"]]);
  });

  it("fills in missing IDs", () => {
    const fixes = findSceneIdFixes(makeDoc(["sceneHeading", "INT. A", null], ["sceneHeading", "INT. B", "bad id!"]), new Map(), idFactory());
    expect(fixes).toEqual([
      { pos: 0, id: "new1" },
      { pos: 8, id: "new2" },
    ]);
  });
});
