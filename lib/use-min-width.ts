import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether an element is at least `rem` wide, measured like a CSS container query
 * (rem from the root font size). false on the server and until the element mounts.
 */
export function useMinWidth(element: HTMLElement | null, rem: number) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!element) return () => {};
      const observer = new ResizeObserver(onChange);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [element],
  );
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!element) return false;
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return element.clientWidth >= rem * rootFontSize;
    },
    () => false,
  );
}
