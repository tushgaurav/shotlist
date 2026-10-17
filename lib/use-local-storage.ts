import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "shotlist:local-storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** A raw localStorage value that updates when it changes in this tab or another. null on the server. */
export function useLocalStorage(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null,
  );
}

export function writeLocalStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the preference just isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
