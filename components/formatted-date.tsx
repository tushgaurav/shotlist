"use client";

import { useSyncExternalStore } from "react";

const serverFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const localFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const subscribe = () => () => {};

// The server doesn't know the viewer's time zone, so it renders UTC and the browser
// swaps in the local date after hydration.
export function FormattedDate({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => localFormat.format(new Date(value)),
    () => serverFormat.format(new Date(value)),
  );
  return <time dateTime={value}>{text}</time>;
}
