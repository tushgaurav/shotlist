"use client";

import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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

/** Exact, then prefix, then anywhere in the value or hint; -1 for no match. */
function matchRank(option: PresetOption, query: string) {
  const value = option.value.toLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.includes(query)) return 2;
  return option.hint?.toLowerCase().includes(query) ? 3 : -1;
}

/**
 * Free text with suggestions. They open while typing, on click, or with Ctrl+Space;
 * arrows pick one and Enter or Tab accepts it. With `multiple`, values are comma-separated
 * and suggestions complete the last one.
 */
export function PresetCell({
  value,
  label,
  onChange,
  options,
  multiple = false,
}: CellProps<string | null> & { options: PresetOption[]; multiple?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const text = value ?? "";
  const parts = multiple ? text.split(",") : [text];
  const earlier = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
  const query = (parts.at(-1) ?? "").trim().toLowerCase();
  const taken = new Set(earlier.map((part) => part.toLowerCase()));

  const matches = options
    .filter((option) => !taken.has(option.value.toLowerCase()))
    .map((option) => ({ option, rank: matchRank(option, query) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8)
    .map(({ option }) => option);
  const exact = matches.length === 1 && matches[0].value.toLowerCase() === query;
  const visible = open && matches.length > 0 && !exact;
  const activeIndex = Math.min(active, matches.length - 1);

  const show = () => {
    setOpen(true);
    setActive(0);
  };

  const choose = (option: PresetOption) => {
    onChange(multiple ? [...earlier, option.value].join(", ") : option.value);
    setOpen(false);
  };

  return (
    <Popover open={visible} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          data-cell-control
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible ? `${listId}-${activeIndex}` : undefined}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            show();
          }}
          onClick={show}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === " ") {
              event.preventDefault();
              show();
              return;
            }
            if (!visible) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((activeIndex + step + matches.length) % matches.length);
            } else if (event.key === "Enter" || event.key === "Tab") {
              if (event.key === "Enter") event.preventDefault();
              choose(matches[activeIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          className={control}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-auto min-w-44 gap-0 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
          {matches.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
              className="flex cursor-default items-baseline justify-between gap-4 rounded-md px-2 py-1 text-sm aria-selected:bg-muted"
            >
              <span>{option.value}</span>
              {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
