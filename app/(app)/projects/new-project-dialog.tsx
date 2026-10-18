"use client";

import { PlusIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { typeSelection, TypeField } from "@/components/project-type-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PROJECT_TITLE_MAX_LENGTH, type ProjectTypeOption } from "@/lib/projects";

import { createProjectAction } from "./actions";

export type NewProjectOptions = { types: ProjectTypeOption[]; defaultTypeId: string | null };

/** Brings its own button, unless `open` is passed to control it from elsewhere. */
export function NewProjectDialog({
  types,
  defaultTypeId,
  open,
  onOpenChange,
}: NewProjectOptions & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <DialogTrigger asChild>
          <NewProjectButton />
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <NewProjectForm types={types} defaultTypeId={defaultTypeId} />
      </DialogContent>
    </Dialog>
  );
}

export function NewProjectButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button {...props}>
      <PlusIcon data-icon="inline-start" />
      New Project
    </Button>
  );
}

// Rendered only while the dialog is open, so errors reset each time it opens.
function NewProjectForm({ types, defaultTypeId }: NewProjectOptions) {
  const [state, formAction, pending] = useActionState(createProjectAction, {});
  const [type, setType] = useState(() => typeSelection(defaultTypeId));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
        <DialogDescription>
          One project per production. You can add a logline, header image and more under Details.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="project-title">Title</FieldLabel>
          <Input
            id="project-title"
            name="title"
            placeholder="e.g. Midnight Diner"
            maxLength={PROJECT_TITLE_MAX_LENGTH}
            autoComplete="off"
            required
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="project-type">Type</FieldLabel>
          <TypeField id="project-type" types={types} value={type} onChange={setType} />
        </Field>
        <FieldError>{state.error}</FieldError>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create Project"}
        </Button>
      </DialogFooter>
    </form>
  );
}
