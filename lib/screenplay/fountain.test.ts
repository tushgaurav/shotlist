import { describe, expect, it } from "vitest";

import { toFountain } from "./fountain";
import type { BlockJSON, ScreenplayDocJSON } from "./types";

const b = (type: string, text: string, marks?: string[]): BlockJSON => ({
  type,
  content: text ? [{ type: "text", text, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) }] : [],
});
const doc = (...content: BlockJSON[]): ScreenplayDocJSON => ({ type: "doc", content });

describe("toFountain", () => {
  it("exports a title page and a scene", () => {
    const output = toFountain(
      doc(
        { type: "sceneHeading", attrs: { sceneId: "a" }, content: [{ type: "text", text: "int. kitchen - night" }] },
        b("action", "Mary stirs a pot."),
        b("character", "Mary"),
        b("parenthetical", "quietly"),
        b("dialogue", "It's ready."),
        b("character", "JOHN (V.O.)"),
        b("dialogue", "Coming."),
        b("transition", "CUT TO:"),
      ),
      { title: "The Pot", author: "Tush", contact: "tush@example.com\n+91 00000" },
    );

    expect(output).toBe(
      [
        "Title: The Pot",
        "Author: Tush",
        "Contact:",
        "   tush@example.com",
        "   +91 00000",
        "",
        "INT. KITCHEN - NIGHT",
        "",
        "Mary stirs a pot.",
        "",
        "MARY",
        "(quietly)",
        "It's ready.",
        "",
        "JOHN (V.O.)",
        "Coming.",
        "",
        "CUT TO:",
        "",
      ].join("\n"),
    );
  });

  it("forces elements Fountain would otherwise misread", () => {
    const output = toFountain(
      doc(
        { type: "sceneHeading", attrs: { sceneId: "a" }, content: [{ type: "text", text: "Flashback" }] },
        b("action", "INT. looks like a heading"),
        b("action", "SMASH CUT TO:"),
        b("transition", "Fade out."),
        b("character", "123"),
        b("dialogue", "Numbers."),
      ),
    );

    expect(output).toBe(
      [".FLASHBACK", "!INT. looks like a heading", "!SMASH CUT TO:", "> FADE OUT.", "@123\nNumbers."].join("\n\n") + "\n",
    );
  });

  it("converts marks and escapes emphasis characters", () => {
    const output = toFountain(
      doc({
        type: "action",
        content: [
          { type: "text", text: "A " },
          { type: "text", text: "loud", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "soft", marks: [{ type: "italic" }, { type: "underline" }] },
          { type: "text", text: " 5*3 file_name" },
        ],
      }),
    );
    expect(output).toBe("A **loud** and _*soft*_ 5\\*3 file\\_name\n");
  });

  it("skips empty elements", () => {
    expect(toFountain(doc(b("action", ""), b("action", "Hi."), b("character", "  ")))).toBe("Hi.\n");
  });
});
