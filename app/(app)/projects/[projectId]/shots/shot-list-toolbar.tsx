"use client";

import { Columns3Icon, DownloadIcon, KeyboardIcon } from "lucide-react";

import { SaveStatusIndicator, type SaveTone } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import { formatMinutes } from "@/lib/shots/groups";
import type { ShotSaveStatus } from "@/lib/shots/shot-store";

import { SHOT_COLUMNS, type useColumnVisibility } from "./columns";

const STATUS: Record<ShotSaveStatus, { tone: SaveTone; label: string }> = {
  saved: { tone: "saved", label: "Saved" },
  saving: { tone: "saving", label: "Saving…" },
  offline: { tone: "warning", label: "Offline — retrying" },
  error: { tone: "error", label: "Some changes weren't saved" },
};

type Props = {
  status: ShotSaveStatus;
  shotCount: number;
  minutes: number;
  changedScenes: number;
  visibility: ReturnType<typeof useColumnVisibility>;
  onExport: () => void;
};

export function ShotListToolbar({ status, shotCount, minutes, changedScenes, visibility, onExport }: Props) {
  return (
    <div className="sticky top-14 z-30 border-b bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
        <p className="truncate text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{shotCount}</span>{" "}
          {shotCount === 1 ? "shot" : "shots"}
          {minutes > 0 && <> · {formatMinutes(minutes)} estimated</>}
          {changedScenes > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}
              · {changedScenes} {changedScenes === 1 ? "scene" : "scenes"} changed
            </span>
          )}
        </p>

        <div className="ml-auto flex items-center gap-1">
          <SaveStatusIndicator status={status} {...STATUS[status]} />
          <Separator orientation="vertical" className="mx-1.5 h-5!" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Columns3Icon data-icon="inline-start" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {SHOT_COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.field}
                  checked={visibility.isVisible(column.field)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => visibility.toggle(column.field)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={visibility.reset}>Reset to default</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" disabled={shotCount === 0} onClick={onExport}>
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>

          <ShortcutsPopover />
        </div>
      </div>
    </div>
  );
}

function ShortcutsPopover() {
  const isMac = useIsMac();
  const rows: [string, string[][]][] = [
    ["Move between cells", [["↑"], ["↓"], ["←"], ["→"]]],
    ["Next row, or a new shot after the last one", [["Enter"]]],
    ["New line in description and notes", [["Shift", "Enter"]]],
    ["Move the shot up or down", [["Alt", "↑"], ["Alt", "↓"]]],
    ["Show suggestions", [["Ctrl", "Space"]]],
    ["Leave the cell", [["Esc"]]],
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts">
          <KeyboardIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="font-medium">Keyboard shortcuts</p>
        <dl className="grid gap-2 text-sm">
          {rows.map(([action, combos]) => (
            <div key={action} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{action}</dt>
              <dd className="flex shrink-0 gap-1">
                {combos.map((keys) => (
                  <Kbd key={keys.join("+")}>
                    {keys[0] === "Ctrl" ? keys.join("+") : shortcutLabel(keys, isMac)}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
