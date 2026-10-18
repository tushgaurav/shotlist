export type Device = { browser: string | null; os: string | null; mobile: boolean };

// Order matters: most browsers also claim to be Chrome and Safari.
const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/|EdgiOS\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

function match(table: [RegExp, string][], userAgent: string) {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** A rough browser and OS for listing signed-in devices. Not for feature detection. */
export function describeDevice(userAgent: string | null | undefined): Device {
  if (!userAgent) return { browser: null, os: null, mobile: false };
  return {
    browser: match(BROWSERS, userAgent),
    os: match(SYSTEMS, userAgent),
    mobile: /Mobi|iPhone|iPod|Android.*Mobile/.test(userAgent),
  };
}

export function deviceLabel({ browser, os }: Device) {
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown Device";
}
