import type { ScreenplayBlock } from "./blocks";

export type ParsedHeading = {
  intExt: "INT" | "EXT" | "INT/EXT" | null;
  location: string | null;
  timeOfDay: string | null;
};

export type ExtractedScene = ParsedHeading & {
  id: string;
  position: number;
  number: string;
  heading: string;
  contentHash: string;
};

const HEADING_PREFIX = /^(INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)(?:\.\s*|\s+|$)/i;

/** True once a line starts with a scene heading prefix that ends in a period, e.g. "INT." */
export function startsLikeSceneHeading(text: string) {
  return /^(?:INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)\./i.test(text);
}

/** Matches the prefixes Fountain recognises as a scene heading without forcing. */
export function isFountainSceneHeading(text: string) {
  return /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i.test(text);
}

export function parseHeading(heading: string): ParsedHeading {
  const text = heading.trim().toUpperCase();
  const prefix = text.match(HEADING_PREFIX);

  let intExt: ParsedHeading["intExt"] = null;
  let rest = text;
  if (prefix) {
    const kind = prefix[1].replace(".", "");
    intExt = kind === "INT" ? "INT" : kind === "EXT" || kind === "EST" ? "EXT" : "INT/EXT";
    rest = text.slice(prefix[0].length);
  }

  const separators = [...rest.matchAll(/\s+[-–—]\s*|\s*[-–—]\s+/g)];
  const last = separators.at(-1);
  const location = last ? rest.slice(0, last.index) : rest;
  const timeOfDay = last ? rest.slice(last.index + last[0].length) : "";

  return {
    intExt,
    location: location.trim() || null,
    timeOfDay: timeOfDay.trim() || null,
  };
}

/**
 * Splits blocks into scenes. A scene is a heading plus everything up to the next heading;
 * text before the first heading belongs to no scene.
 */
export function extractScenes(blocks: ScreenplayBlock[]): ExtractedScene[] {
  const scenes: ExtractedScene[] = [];
  let current: { scene: Omit<ExtractedScene, "contentHash">; content: string[] } | null = null;

  const finish = () => {
    if (current) scenes.push({ ...current.scene, contentHash: hash(current.content.join("\n")) });
  };

  for (const block of blocks) {
    if (block.type === "sceneHeading" && block.sceneId) {
      finish();
      const position = scenes.length;
      current = {
        scene: {
          id: block.sceneId,
          position,
          number: String(position + 1),
          heading: block.text.trim().toUpperCase(),
          ...parseHeading(block.text),
        },
        content: [],
      };
    }
    current?.content.push(`${block.type}:${block.text}`);
  }
  finish();

  return scenes;
}

/** cyrb53: a fast, well-distributed 53-bit string hash. Used only to detect changes. */
function hash(input: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}
