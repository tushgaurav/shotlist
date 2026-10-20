import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { noteSchema } from "@/lib/notes/schema";
import { screenplaySchema } from "@/lib/screenplay/editor/schema";

import { renderDoc } from "./render";

const html = (doc: Parameters<typeof renderDoc>[0]) => renderToStaticMarkup(renderDoc(doc));
const text = (value: string, marks?: object[]) => ({ type: "text", text: value, marks });

describe("renderDoc", () => {
  it("renders screenplay elements with the editor's classes and scene IDs", () => {
    const doc = screenplaySchema().nodeFromJSON({
      type: "doc",
      content: [
        { type: "sceneHeading", attrs: { sceneId: "s1" }, content: [text("INT. KITCHEN - NIGHT")] },
        { type: "character", content: [text("MARY")] },
        { type: "dialogue", content: [text("No. "), text("Never.", [{ type: "bold" }, { type: "italic" }])] },
      ],
    });

    expect(html(doc)).toBe(
      '<p data-scene-id="s1" data-type="sceneHeading" class="sp-sceneHeading" data-textblock="">INT. KITCHEN - NIGHT</p>' +
        '<p data-type="character" class="sp-character" data-textblock="">MARY</p>' +
        '<p data-type="dialogue" class="sp-dialogue" data-textblock="">No. <strong><em>Never.</em></strong></p>',
    );
  });

  it("renders checklists that readers can't tick", () => {
    const doc = noteSchema().nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [text("Book the roof")] }] }],
        },
      ],
    });

    expect(html(doc)).toBe(
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem">' +
        '<label><input type="checkbox" disabled="" checked=""/><span></span></label>' +
        '<div><p data-textblock="">Book the roof</p></div></li></ul>',
    );
  });

  it("keeps safe links and drops unsafe ones", () => {
    const link = (href: string) => [{ type: "link", attrs: { href } }];
    const doc = noteSchema().nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [text("safe", link("https://example.com"))] },
        { type: "paragraph", content: [text("unsafe", link("javascript:alert(1)"))] },
      ],
    });

    const markup = html(doc);
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('rel="noopener noreferrer nofollow"');
    expect(markup).not.toContain("javascript:");
  });

  it("escapes text", () => {
    const doc = noteSchema().nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", content: [text("<script>alert(1)</script>")] }],
    });
    expect(html(doc)).toBe('<p data-textblock="">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});
