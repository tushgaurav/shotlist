import { describe, expect, it } from "vitest";

import { describeDevice, deviceLabel } from "./user-agent";

const label = (userAgent: string | null) => deviceLabel(describeDevice(userAgent));

describe("describeDevice", () => {
  it("names common desktop browsers", () => {
    expect(
      label(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      label(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0")).toBe(
      "Firefox on Windows",
    );
    expect(
      label(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(
      label(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0",
      ),
    ).toBe("Opera on Linux");
  });

  it("tells phones apart", () => {
    const iphone = describeDevice(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
    );
    expect(iphone).toEqual({ browser: "Chrome", os: "iOS", mobile: true });

    const android = describeDevice(
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    );
    expect(android).toEqual({ browser: "Chrome", os: "Android", mobile: true });

    const tablet = describeDevice(
      "Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    );
    expect(tablet.mobile).toBe(false);
  });

  it("falls back when it can't tell", () => {
    expect(label(null)).toBe("Unknown device");
    expect(label("curl/8.7.1")).toBe("Unknown device");
    expect(label("Mozilla/5.0 (X11; Linux x86_64) SomeBrowser/1.0")).toBe("Linux");
  });
});
