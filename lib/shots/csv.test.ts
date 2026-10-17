import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells with commas, quotes and line breaks", () => {
    expect(toCsv([["a", 'say "hi"', "one, two", "line\nbreak", null, 5]])).toBe(
      '\uFEFFa,"say ""hi""","one, two","line\nbreak",,5\r\n',
    );
  });

  it("stops spreadsheet apps from running cells as formulas", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-x", "@cmd", "fine"]])).toBe(
      "\uFEFF'=SUM(A1),'+1,'-x,'@cmd,fine\r\n",
    );
  });
});
