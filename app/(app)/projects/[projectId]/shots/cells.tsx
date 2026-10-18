"use client";

import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { PresetCombobox } from "@/components/preset-combobox";
import type { PresetOption } from "@/lib/shots/presets";
import { SHOT_STATUS_LABELS, SHOT_STATUSES, type ShotStatus } from "@/lib/shots/types";

const control =
  "block w-full min-w-0 self-stretch rounded-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:bg-background focus:ring-2 focus:ring-ring/60 focus:ring-inset";

type CellProps<T> = { value: T; label: string; onChange: (value: T) => void };

export function TextCell({
  value,
  label,
  onChange,
  placeholder,
  title,
  className,
}: CellProps<string | null> & { placeholder?: string; title?: string; className?: string }) {
  return (
    <input
      data-cell-control
      type="text"
      value={value ?? ""}
      aria-label={label}
      title={title}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      className={cn(control, className)}
    />
  );
}

/** Grows with its content. Shift+Enter adds a line; Enter moves to the next row. */
export function LongTextCell({
  value,
  label,
  onChange,
  placeholder,
}: CellProps<string | null> & { placeholder?: string }) {
  return (
    <textarea
      data-cell-control
      rows={1}
      value={value ?? ""}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn(control, "field-sizing-content resize-none leading-5")}
    />
  );
}

export function NumberCell({ value, label, onChange }: CellProps<number | null>) {
  // Holds the text while the cell is focused, so partial input isn't saved.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const next = draft === "" ? null : Number.parseInt(draft, 10);
    if (next !== value) onChange(next);
    setDraft(null);
  };

  return (
    <input
      data-cell-control
      type="text"
      inputMode="numeric"
      value={draft ?? value?.toString() ?? ""}
      aria-label={label}
      placeholder="–"
      autoComplete="off"
      onFocus={() => setDraft(value?.toString() ?? "")}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 5))}
      onBlur={commit}
      className={cn(control, "text-right tabular-nums")}
    />
  );
}

export function CheckCell({ value, label, onChange }: CellProps<boolean>) {
  return (
    <div className="flex w-full items-center justify-center">
      <input
        data-cell-control
        type="checkbox"
        checked={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
      />
    </div>
  );
}

export const STATUS_DOTS: Record<ShotStatus, string> = {
  planned: "border border-muted-foreground/60",
  shot: "bg-emerald-500",
  omitted: "bg-muted-foreground/40",
};

export function StatusCell({ value, label, onChange }: CellProps<ShotStatus>) {
  return (
    <div className="relative flex w-full items-center">
      <span
        aria-hidden
        className={cn("pointer-events-none absolute left-2.5 size-2 rounded-full", STATUS_DOTS[value])}
      />
      <select
        data-cell-control
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as ShotStatus)}
        className={cn(control, "cursor-pointer appearance-none pr-6 pl-7")}
      >
        {SHOT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {SHOT_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground"
      />
    </div>
  );
}

/** Free text with suggestions; see `PresetCombobox`. */
export function PresetCell({
  value,
  label,
  onChange,
  options,
  multiple = false,
}: CellProps<string | null> & { options: PresetOption[]; multiple?: boolean }) {
  return (
    <PresetCombobox
      data-cell-control
      aria-label={label}
      value={value ?? ""}
      onChange={onChange}
      options={options}
      multiple={multiple}
      className={control}
    />
  );
}
