import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

import { breakLongWord, renderNotesPdf } from "./pdf";
import { noteSchema } from "./schema";

const t = (text: string, marks?: object[]) => ({ type: "text", text, ...(marks && { marks }) });
const p = (...content: object[]) => ({ type: "paragraph", content: content.length > 0 ? content : undefined });
const doc = (...content: object[]) => noteSchema().nodeFromJSON({ type: "doc", content });
const link = (href: string) => [{ type: "link", attrs: { href } }];

const fonts = path.resolve("public/fonts/geist");

async function render(...notes: ReturnType<typeof doc>[]) {
  const blob = await renderNotesPdf(notes, { paper: "letter", title: "Notes", projectTitle: "Rooftop Video" }, fonts);
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

/** Where each block of content is moved to on the page, from the top, in points. */
function contentOffsets(pdf: string) {
  const offsets: number[] = [];
  for (const [, stream] of pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(stream, "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const [, y] of content.matchAll(/1 0 0 1 64 (-?[\d.]+) cm/g)) offsets.push(Number(y));
  }
  return offsets;
}

describe("renderNotesPdf", () => {
  it("renders every kind of block, each note from a new page", async () => {
    const first = doc(
      p(t("Rooftop music video")),
      p(t("Golden hour, "), t("handheld", [{ type: "bold" }]), t(" and "), t("loose", [{ type: "italic" }]), t(". Ref: "), t("moodboard", link("https://example.com/moodboard"))),
      p(),
      { type: "heading", attrs: { level: 2 }, content: [t("Shots")] },
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("Wide")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("Drone"))] }] }] }] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(t("Third"))] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("Book the roof"))] }, { type: "taskItem", attrs: { checked: false }, content: [p(t("Permits"))] }] },
      { type: "blockquote", content: [p(t("Summer."))] },
      p(t("Use "), t("24fps", [{ type: "code" }]), t(", "), t("struck", [{ type: "strike" }]), t(", "), t("underlined", [{ type: "underline" }])),
      { type: "codeBlock", content: [t("Call 06:00\nWrap 19:30")] },
      { type: "horizontalRule" },
      { type: "paragraph", content: [t("one"), { type: "hardBreak" }, t("two")] },
    );
    const second = doc({ type: "heading", attrs: { level: 1 }, content: [t("Casting")] }, p(t("Sam for the lead.")));
    const pdf = await render(first, second);

    expect(pdf.startsWith("%PDF-")).toBe(true);
    const sizes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(([, width, height]) => [Number(width), Number(height)]);
    expect(sizes).toEqual([
      [612, 792],
      [612, 792],
    ]);
    for (const font of ["Geist-Regular", "Geist-Italic", "Geist-SemiBold", "Geist-Bold", "GeistMono-Regular"]) {
      expect(pdf).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(pdf).toContain("/URI (https://example.com/moodboard)");
  }, 20000);

  it("keeps the footer on the page and long notes flowing onto more pages", async () => {
    const long = doc(p(t("Long")), ...Array.from({ length: 80 }, (_, i) => p(t(`Line ${i + 1}`))));
    const pdf = await render(long);

    expect([...pdf.matchAll(/\/Type \/Page\b/g)]).toHaveLength(2);
    const offsets = contentOffsets(pdf);
    expect(offsets.every((y) => y >= 0 && y <= 792)).toBe(true);
    // The footer, once per page, in the bottom margin.
    expect(offsets.filter((y) => y > 792 - 72)).toHaveLength(2);
  }, 20000);
});

describe("breakLongWord", () => {
  it("leaves ordinary words alone", () => {
    expect(breakLongWord("handheld")).toEqual(["handheld"]);
    expect(breakLongWord("https://example.com/moodboard")).toEqual(["https://example.com/moodboard"]);
  });

  it("lets long links break after separators, and anything else every few characters", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnopqrstuvwxyz";
    const parts = breakLongWord(url);
    expect(parts.join("")).toBe(url);
    expect(parts.slice(0, 5)).toEqual(["https:/", "/", "www.", "youtube.", "com/"]);
    expect(parts.every((part) => part.length <= 15)).toBe(true);

    expect(breakLongWord("a".repeat(40))).toEqual(["a".repeat(15), "a".repeat(15), "a".repeat(10)]);
  });
});
