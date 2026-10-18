import path from "node:path";
import { describe, expect, it } from "vitest";

import { layoutScreenplay } from "./pagination";
import { renderScreenplayPdf } from "./pdf";
import type { ScreenplayDocJSON } from "./types";

const doc: ScreenplayDocJSON = {
  type: "doc",
  content: [
    { type: "sceneHeading", attrs: { sceneId: "a" }, content: [{ type: "text", text: "INT. KITCHEN - NIGHT" }] },
    ...Array.from({ length: 40 }, (_, i) => ({
      type: "action",
      content: [{ type: "text" as const, text: `Beat ${i + 1}.` }],
    })),
  ],
};

describe("renderScreenplayPdf", () => {
  it("renders every page at the chosen paper size", async () => {
    const layout = layoutScreenplay(doc, { paper: "a4", titlePage: { title: "The Pot" } });
    const blob = await renderScreenplayPdf(layout, { title: "The Pot" }, path.resolve("public/fonts/courier-prime"));
    const pdf = Buffer.from(await blob.arrayBuffer()).toString("latin1");

    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("CourierPrime-Regular");
    const sizes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(([, width, height]) => [
      Math.round(Number(width) * 100) / 100,
      Math.round(Number(height) * 100) / 100,
    ]);
    expect(sizes).toEqual(Array(1 + layout.pages.length).fill([595.44, 841.68]));
  }, 20000);
});
