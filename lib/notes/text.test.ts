import { describe, expect, it } from "vitest";

import { noteSchema, parseNoteDoc } from "./schema";
import { notePreview, noteText, noteTitle } from "./text";

const p = (text?: string) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });
const doc = (...content: object[]) => noteSchema().nodeFromJSON({ type: "doc", content });

describe("noteText", () => {
  it("renders headings, lists, checklists and quotes with Markdown-style markers", () => {
    const text = noteText(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Rooftop music video" }] },
        p("Golden hour, handheld."),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [p("Wide of the skyline"), { type: "bulletList", content: [{ type: "listItem", content: [p("Drone?")] }] }] },
            { type: "listItem", content: [p("Close on hands")] },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [p("Third")] }],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p("Book the roof")] },
            { type: "taskItem", attrs: { checked: false }, content: [p("Permits")] },
          ],
        },
        { type: "blockquote", content: [p("Make it feel like summer.")] },
        { type: "horizontalRule" },
        p(),
      ),
    );

    expect(text).toBe(
      [
        "# Rooftop music video",
        "Golden hour, handheld.",
        "- Wide of the skyline",
        "  - Drone?",
        "- Close on hands",
        "3. Third",
        "[x] Book the roof",
        "[ ] Permits",
        "> Make it feel like summer.",
        "---",
      ].join("\n"),
    );
  });

  it("keeps hard breaks as line breaks and collapses runs of empty lines", () => {
    const text = noteText(
      doc(
        { type: "paragraph", content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }] },
        p(),
        p(),
        p(),
        p("three"),
      ),
    );
    expect(text).toBe("one\ntwo\n\nthree");
  });

  it("is empty for an empty note", () => {
    expect(noteText(doc(p()))).toBe("");
  });
});

describe("noteTitle and notePreview", () => {
  it("takes the first non-empty line as the title, without markers", () => {
    const text = "\n# Ideas\n- Shoot at night\n[ ] Ask Sam\n---\nMore";
    expect(noteTitle(text)).toBe("Ideas");
    expect(notePreview(text)).toBe("Shoot at night Ask Sam More");
  });

  it("shortens long previews", () => {
    expect(notePreview(`Title\n${"word ".repeat(100)}`, 20)).toBe("word word word word…");
  });

  it("is empty for an empty note", () => {
    expect(noteTitle("")).toBe("");
    expect(notePreview("")).toBe("");
  });
});

describe("parseNoteDoc", () => {
  it("accepts a note", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "ref", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] }],
    };
    expect(parseNoteDoc(json).textContent).toBe("ref");
  });

  it("rejects unknown nodes and unsafe links", () => {
    expect(() => parseNoteDoc({ type: "doc", content: [{ type: "sceneHeading" }] })).toThrow();
    expect(() => parseNoteDoc({ type: "paragraph" })).toThrow();
    expect(() =>
      parseNoteDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
      }),
    ).toThrow();
  });
});
