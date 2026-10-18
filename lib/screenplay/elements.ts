export const ELEMENT_TYPES = [
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export function isElementType(value: string): value is ElementType {
  return (ELEMENT_TYPES as readonly string[]).includes(value);
}

export const ELEMENT_LABELS: Record<ElementType, string> = {
  sceneHeading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
};

export const ELEMENT_PLACEHOLDERS: Record<ElementType, string> = {
  sceneHeading: "INT. LOCATION – DAY",
  action: "Action",
  character: "Character",
  parenthetical: "(beat)",
  dialogue: "Dialogue",
  transition: "CUT TO:",
};

/** The element Enter creates when pressed at the end of a line. */
export const NEXT_ELEMENT: Record<ElementType, ElementType> = {
  sceneHeading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "sceneHeading",
};

/** The order Tab moves through. Shift+Tab goes backwards. */
export const TAB_CYCLE: readonly ElementType[] = [
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "sceneHeading",
];

/** Mod+Alt+1 … Mod+Alt+6, in this order. */
export const SHORTCUT_ORDER: readonly ElementType[] = [
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
];

/** Elements that are always shown and exported in capitals. */
export const UPPERCASE_ELEMENTS: ReadonlySet<ElementType> = new Set([
  "sceneHeading",
  "character",
  "transition",
]);
