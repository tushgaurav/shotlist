"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PROJECT_TYPE_ICON,
  PROJECT_TYPE_ICONS,
  PROJECT_TYPE_NAME_MAX_LENGTH,
  type ProjectTypeChoice,
  type ProjectTypeIcon,
  type ProjectTypeOption,
} from "@/lib/projects";

import { PROJECT_TYPE_ICON_DETAILS, TypeIcon } from "./project-type-icon";

/** An icon button that opens a grid of the icons a type can use. */
export function TypeIconPicker({
  value,
  onChange,
  name,
}: {
  value: ProjectTypeIcon;
  onChange: (icon: ProjectTypeIcon) => void;
  /** Also submits the icon with a form under this name. */
  name?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={`Icon: ${PROJECT_TYPE_ICON_DETAILS[value].label}. Change icon`}
        >
          <TypeIcon icon={value} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5">
        <div className="grid grid-cols-6 gap-1">
          {PROJECT_TYPE_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={PROJECT_TYPE_ICON_DETAILS[icon].label}
              aria-pressed={icon === value}
              title={PROJECT_TYPE_ICON_DETAILS[icon].label}
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 aria-pressed:bg-primary/10 aria-pressed:text-primary"
            >
              <TypeIcon icon={icon} className="size-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
      {name && <input type="hidden" name={name} value={value} />}
    </Popover>
  );
}

/** What the type picker has selected: "none", "new" or a type's ID, plus the new type being named. */
export type TypeSelection = { selected: string; newName: string; newIcon: ProjectTypeIcon };

export function typeSelection(typeId: string | null): TypeSelection {
  return { selected: typeId ?? "none", newName: "", newIcon: DEFAULT_PROJECT_TYPE_ICON };
}

export function typeChoiceOf(selection: TypeSelection): ProjectTypeChoice {
  if (selection.selected === "new") return { newType: { name: selection.newName, icon: selection.newIcon } };
  return { typeId: selection.selected === "none" ? null : selection.selected };
}

/**
 * One of the user's types, no type, or "New type…", which asks for a name and an icon. In a form
 * it submits `typeId` ("none", "new" or an ID), `newTypeName` and `newTypeIcon`.
 */
export function TypeField({
  id,
  types,
  value,
  onChange,
}: {
  id: string;
  types: ProjectTypeOption[];
  value: TypeSelection;
  onChange: (value: TypeSelection) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Select name="typeId" value={value.selected} onValueChange={(selected) => onChange({ ...value, selected })}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">No type</span>
          </SelectItem>
          {types.map((type) => (
            <SelectItem key={type.id} value={type.id}>
              <TypeIcon icon={type.icon} className="text-muted-foreground" />
              {type.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="new">
            <PlusIcon className="text-muted-foreground" />
            New type…
          </SelectItem>
        </SelectContent>
      </Select>
      {value.selected === "new" && (
        <div className="flex gap-2">
          <TypeIconPicker
            name="newTypeIcon"
            value={value.newIcon}
            onChange={(newIcon) => onChange({ ...value, newIcon })}
          />
          <Input
            name="newTypeName"
            aria-label="New type name"
            placeholder="e.g. YouTube video"
            value={value.newName}
            onChange={(event) => onChange({ ...value, newName: event.target.value })}
            maxLength={PROJECT_TYPE_NAME_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            required
          />
        </div>
      )}
    </div>
  );
}
