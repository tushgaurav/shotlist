"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeHex } from "@/lib/moodboards/palette";
import { CAPTION_MAX_LENGTH, MAX_PALETTE_COLORS } from "@/lib/moodboards/types";

export type PaletteDraft = { colors: string[]; name: string };

/** Starting colors for a new palette: neutral, so they're obviously meant to be changed. */
const NEW_PALETTE: PaletteDraft = { colors: ["#f5f0e8", "#c9a27e", "#7a5c43", "#2f2a26"], name: "" };

export function PaletteDialog({
  palette,
  onSave,
  onClose,
}: {
  /** The palette being edited, "new" for a new one, or null when closed. */
  palette: PaletteDraft | "new" | null;
  onSave: (palette: PaletteDraft) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={palette !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {palette && (
          <PaletteForm
            initial={palette === "new" ? NEW_PALETTE : palette}
            isNew={palette === "new"}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaletteForm({
  initial,
  isNew,
  onSave,
}: {
  initial: PaletteDraft;
  isNew: boolean;
  onSave: (palette: PaletteDraft) => void;
}) {
  const [colors, setColors] = useState(initial.colors);
  const [name, setName] = useState(initial.name);
  const setColor = (index: number, color: string) =>
    setColors((current) => current.map((value, i) => (i === index ? color : value)));

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (colors.length > 0) onSave({ colors, name: name.trim() });
      }}
    >
      <DialogHeader>
        <DialogTitle>{isNew ? "New Palette" : "Edit Palette"}</DialogTitle>
        <DialogDescription>Up to {MAX_PALETTE_COLORS} colors. Pick one, or type its hex code.</DialogDescription>
      </DialogHeader>

      <div className="flex h-12 overflow-hidden rounded-lg ring-1 ring-foreground/10" aria-hidden>
        {colors.map((color, index) => (
          <span key={index} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>

      <ul className="grid gap-2">
        {colors.map((color, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              aria-label={`Color ${index + 1}`}
              onChange={(event) => setColor(index, event.target.value)}
              className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
            />
            <HexInput value={color} label={`Hex code, color ${index + 1}`} onChange={(value) => setColor(index, value)} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove color ${index + 1}`}
              disabled={colors.length === 1}
              onClick={() => setColors((current) => current.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={colors.length >= MAX_PALETTE_COLORS}
        onClick={() => setColors((current) => [...current, current.at(-1) ?? "#808080"])}
      >
        <PlusIcon data-icon="inline-start" />
        Add Color
      </Button>

      <div className="grid gap-1.5">
        <Label htmlFor="palette-name">Name</Label>
        <Input
          id="palette-name"
          value={name}
          maxLength={CAPTION_MAX_LENGTH}
          placeholder="e.g. Dusk exteriors"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">{isNew ? "Add Palette" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}

/** A hex code field that only takes the value once it's a valid color. */
function HexInput({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      value={draft ?? value}
      aria-label={label}
      spellCheck={false}
      maxLength={7}
      className="h-8 font-mono text-sm"
      onFocus={() => setDraft(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        const color = normalizeHex(event.target.value);
        if (color && event.target.value.replace("#", "").length === 6) onChange(color);
      }}
      onBlur={() => {
        const color = draft === null ? null : normalizeHex(draft);
        if (color) onChange(color);
        setDraft(null);
      }}
    />
  );
}
