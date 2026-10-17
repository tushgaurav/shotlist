import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { nanoid } from "nanoid";

import { SCENE_ID_PATTERN } from "../types";

export const sceneIdsKey = new PluginKey("sceneIds");

type SceneIdFix = { pos: number; id: string };

/**
 * Every scene heading needs a unique, valid `sceneId`; shots link to scenes through it.
 * When two headings share an ID (paste, split), the one at `keepers.get(id)` keeps it —
 * that's where the original heading moved to — and the rest get new IDs.
 */
export function findSceneIdFixes(
  doc: ProseMirrorNode,
  keepers: ReadonlyMap<string, number> = new Map(),
  createId: () => string = nanoid,
): SceneIdFix[] {
  const fixes: SceneIdFix[] = [];
  const occurrences = new Map<string, number[]>();

  doc.forEach((node, pos) => {
    if (node.type.name !== "sceneHeading") return;
    const id = node.attrs.sceneId;
    if (typeof id !== "string" || !SCENE_ID_PATTERN.test(id)) {
      fixes.push({ pos, id: createId() });
      return;
    }
    occurrences.set(id, [...(occurrences.get(id) ?? []), pos]);
  });

  for (const [id, positions] of occurrences) {
    if (positions.length < 2) continue;
    const keeperPos = keepers.get(id);
    const keep = keeperPos !== undefined && positions.includes(keeperPos) ? keeperPos : positions[0];
    for (const pos of positions) {
      if (pos !== keep) fixes.push({ pos, id: createId() });
    }
  }

  return fixes;
}

function applyFixes(tr: Transaction, fixes: SceneIdFix[]) {
  for (const fix of fixes) tr.setNodeAttribute(fix.pos, "sceneId", fix.id);
  return tr;
}

export function sceneIdsPlugin(createId: () => string = nanoid) {
  return new Plugin({
    key: sceneIdsKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const mapping = new Mapping();
      for (const tr of transactions) mapping.appendMapping(tr.mapping);

      const keepers = new Map<string, number>();
      oldState.doc.forEach((node, pos) => {
        if (node.type.name !== "sceneHeading" || !node.attrs.sceneId) return;
        const result = mapping.mapResult(pos, 1);
        if (!result.deleted) keepers.set(node.attrs.sceneId, result.pos);
      });

      const fixes = findSceneIdFixes(newState.doc, keepers, createId);
      return fixes.length > 0 ? applyFixes(newState.tr, fixes) : null;
    },
    view(view) {
      // Repair the initial document once the view (and the editor wrapping it) is ready.
      queueMicrotask(() => {
        if (view.isDestroyed) return;
        const fixes = findSceneIdFixes(view.state.doc, new Map(), createId);
        if (fixes.length > 0) {
          view.dispatch(applyFixes(view.state.tr, fixes).setMeta("addToHistory", false));
        }
      });
      return {};
    },
  });
}
