import type { PaperSize } from "./screenplay/pagination";

/** Where US Letter is the usual paper size; A4 everywhere else. */
const LETTER_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "PR", "GT", "CR", "PA", "DO", "SV", "NI"]);

/** The paper size usual where the browser is set up. Browser only. */
export function defaultPaper(): PaperSize {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && !LETTER_REGIONS.has(region) ? "a4" : "letter";
  } catch {
    return "letter";
  }
}
