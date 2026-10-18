"use client";

import { useId, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { PresetOption } from "@/lib/shots/presets";

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
export function PresetCombobox({
  value,
  onChange,
  options,
  multiple = false,
  as: Control = "input",
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  options: PresetOption[];
  multiple?: boolean;
  /** `Input` for the form field look; a bare input by default. */
  as?: "input" | typeof Input;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const parts = multiple ? value.split(",") : [value];
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
        <Control
          {...props}
          type="text"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible ? `${listId}-${activeIndex}` : undefined}
          value={value}
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
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-auto min-w-44 gap-0 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ul
          id={listId}
          role="listbox"
          aria-label={props["aria-label"] ? `${props["aria-label"]} suggestions` : "Suggestions"}
        >
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
