"use client";

import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, InfoIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PROJECT_TITLE_MAX_LENGTH } from "@/lib/projects";

import { renameProjectAction, setProjectArchivedAction, type ProjectFormState } from "./actions";

export function ProjectCardMenu({
  projectId,
  title,
  archived,
}: {
  projectId: string;
  title: string;
  archived: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [, startTransition] = useTransition();

  function setArchived(next: boolean) {
    startTransition(async () => {
      try {
        await setProjectArchivedAction(projectId, next);
      } catch {
        toast.error("Couldn't update the project. Try again.");
        return;
      }
      if (next) {
        toast(`Archived “${title}”`, {
          action: { label: "Undo", onClick: () => setArchived(false) },
        });
      } else {
        toast(`Restored “${title}”`);
      }
    });
  }

  return (
    <>
      {/* Non-modal so focus isn't trapped when the rename dialog opens from it. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative z-10 -mt-1 -mr-1.5 text-muted-foreground"
            aria-label={`Actions for ${title}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/projects/${projectId}/details`}>
              <InfoIcon />
              Edit Details
            </Link>
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onSelect={() => setArchived(false)}>
              <ArchiveRestoreIcon />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setArchived(true)}>
              <ArchiveIcon />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <RenameProjectForm
            projectId={projectId}
            title={title}
            onDone={() => setRenaming(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameProjectForm({
  projectId,
  title,
  onDone,
}: {
  projectId: string;
  title: string;
  onDone: () => void;
}) {
  const inputId = useId();
  const [state, formAction, pending] = useActionState(
    async (_prev: ProjectFormState, formData: FormData) => {
      const result = await renameProjectAction(projectId, formData);
      if (!result.error) onDone();
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Rename Project</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={inputId} className="sr-only">
          Title
        </FieldLabel>
        <Input
          id={inputId}
          name="title"
          defaultValue={title}
          maxLength={PROJECT_TITLE_MAX_LENGTH}
          autoComplete="off"
          required
          autoFocus
        />
        <FieldError>{state.error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
