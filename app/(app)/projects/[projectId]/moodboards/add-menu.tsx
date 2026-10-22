"use client";

import { HeadingIcon, ImagePlusIcon, ImagesIcon, LinkIcon, PlusIcon, SwatchBookIcon, TypeIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useBoardActions } from "./context";

/** A hidden file input for several images, and a function that opens it. */
function useImagesPicker(onFiles: (files: File[]) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      tabIndex={-1}
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  );
  return { input, open: () => inputRef.current?.click() };
}

/** Everything that can be added to a board. */
export function AddMenu({ boardId, trigger }: { boardId: string; trigger?: ReactNode }) {
  const actions = useBoardActions();
  const picker = useImagesPicker((files) => actions.uploadImages(boardId, files));
  // The menu returns focus to its button when it closes; a new text box gets it instead.
  const added = useRef<string | null>(null);

  return (
    <>
      {picker.input}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="sm">
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          onCloseAutoFocus={(event) => {
            if (!added.current) return;
            event.preventDefault();
            actions.focusItem(added.current, "text");
            added.current = null;
          }}
        >
          <DropdownMenuItem onSelect={() => actions.requireImages() && picker.open()}>
            <ImagePlusIcon />
            Images…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.addFromProject(boardId)}>
            <ImagesIcon />
            Images from Project…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => (added.current = actions.addText(boardId, "heading"))}>
            <HeadingIcon />
            Heading
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => (added.current = actions.addText(boardId, "body"))}>
            <TypeIcon />
            Text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.editPalette(boardId)}>
            <SwatchBookIcon />
            Palette…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.addLink(boardId)}>
            <LinkIcon />
            Video Link…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
