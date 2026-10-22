"use client";

import { LoaderCircleIcon } from "lucide-react";
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
import { parseLink } from "@/lib/moodboards/video-links";

export function LinkDialog({
  open,
  onAdd,
  onClose,
}: {
  open: boolean;
  /** Resolves once the link is on the board. */
  onAdd: (url: URL) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">{open && <LinkForm onAdd={onAdd} />}</DialogContent>
    </Dialog>
  );
}

function LinkForm({ onAdd }: { onAdd: (url: URL) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault();
        const url = parseLink(value);
        if (!url) {
          setError("That isn't a link. Paste the video's address, e.g. https://youtu.be/…");
          return;
        }
        setPending(true);
        await onAdd(url);
        setPending(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a Video Link</DialogTitle>
        <DialogDescription>
          YouTube and Vimeo videos play right on the board. Other links are kept as link cards.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Input
          autoFocus
          type="url"
          inputMode="url"
          value={value}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="Link"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "link-error" : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id="link-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          Add Link
        </Button>
      </DialogFooter>
    </form>
  );
}
