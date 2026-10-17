"use client";

import { PlusIcon } from "lucide-react";
import { useActionState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_KIND_LABELS, PROJECT_KINDS, PROJECT_TITLE_MAX_LENGTH } from "@/lib/projects";

import { createProjectAction } from "./actions";

export function NewProjectDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <NewProjectForm />
      </DialogContent>
    </Dialog>
  );
}

// Rendered only while the dialog is open, so errors reset each time it opens.
function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>One project per production. You can rename it later.</DialogDescription>
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
          <FieldLabel htmlFor="project-kind">Type</FieldLabel>
          <Select name="kind" defaultValue="short">
            <SelectTrigger id="project-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {PROJECT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          {pending ? "Creating…" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}
