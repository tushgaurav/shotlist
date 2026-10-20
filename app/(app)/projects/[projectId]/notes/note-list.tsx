"use client";

import { cn } from "cn";
import { SquarePenIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { notePreview, noteTitle } from "@/lib/notes/text";

import type { NoteState } from "./notes-workspace";

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  className,
}: {
  notes: NoteState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-label="Notes"
      className={cn(
        "sticky top-12 flex h-[calc(100svh-3rem)] w-full shrink-0 flex-col border-r bg-background md:w-72",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Notes <span className="ml-1 tabular-nums">{notes.length}</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <SquarePenIcon data-icon="inline-start" />
          New Note
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              aria-current={note.id === selectedId ? "page" : undefined}
              onClick={() => onSelect(note.id)}
              className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-muted"
            >
              <span className="truncate text-sm font-medium">{noteTitle(note.text) || "New Note"}</span>
              <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
                <NoteDate value={note.updatedAt} />
                <span className="truncate">{notePreview(note.text) || "No additional text"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const subscribe = () => () => {};
const serverFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Today's notes show the time, older ones the date. The server doesn't know the viewer's
// time zone, so it renders the UTC date and the browser swaps in the local one.
function NoteDate({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => localLabel(new Date(value)),
    () => serverFormat.format(new Date(value)),
  );
  return (
    <time dateTime={value} className="shrink-0">
      {text}
    </time>
  );
}

function localLabel(date: Date) {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFormat.format(date);
  return (date.getFullYear() === now.getFullYear() ? dayFormat : dateFormat).format(date);
}
