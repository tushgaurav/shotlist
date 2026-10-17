import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useIsMac() {
  return useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => true,
  );
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Alt: "⌥", Shift: "⇧", Enter: "↩" };
const PC_NAMES: Record<string, string> = { Mod: "Ctrl" };

/** ["Mod", "Alt", "1"] → "⌘⌥1" on a Mac, "Ctrl+Alt+1" elsewhere. */
export function shortcutLabel(keys: string[], isMac: boolean) {
  return isMac
    ? keys.map((key) => MAC_SYMBOLS[key] ?? key).join("")
    : keys.map((key) => PC_NAMES[key] ?? key).join("+");
}
