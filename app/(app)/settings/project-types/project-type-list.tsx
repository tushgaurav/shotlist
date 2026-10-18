"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TypeIcon } from "@/components/project-type-icon";
import { TypeIconPicker } from "@/components/project-type-picker";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PROJECT_TYPE_ICON,
  PROJECT_TYPE_NAME_MAX_LENGTH,
  type ProjectTypeIcon,
  type ProjectTypeOption,
} from "@/lib/projects";

import { createProjectTypeAction, deleteProjectTypeAction, updateProjectTypeAction } from "../actions";
import { SettingsCard } from "../settings-card";

export type ProjectTypeRow = ProjectTypeOption & { projectCount: number };

const projectCount = (count: number) => (count === 1 ? "1 project" : `${count} projects`);

export function ProjectTypeList({ types }: { types: ProjectTypeRow[] }) {
  // The type being edited, or "new".
  const [editing, setEditing] = useState<ProjectTypeRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectTypeRow | null>(null);

  return (
    <SettingsCard
      title="Project Types"
      description="Group your projects by the kind of work. Add your own, like “YouTube Video” or “Podcast”."
      action={
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          New Type
        </Button>
      }
    >
      {types.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No types yet. Projects can still go without one.
        </p>
      )}
      {types.map((type) => (
        <div key={type.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <TypeIcon icon={type.icon} className="size-4" />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-sm font-medium">{type.name}</span>
            <span className="text-sm text-muted-foreground">
              {type.projectCount > 0 ? projectCount(type.projectCount) : "Not used yet"}
            </span>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${type.name}`} onClick={() => setEditing(type)}>
            <PencilIcon />
          </Button>
          <DeleteButton type={type} onConfirm={() => setDeleting(type)} />
        </div>
      ))}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          {editing && (
            <ProjectTypeForm type={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          {deleting && <ConfirmDelete type={deleting} onDone={() => setDeleting(null)} />}
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

/** Deletes an unused type straight away; asks first when projects use it. */
function DeleteButton({ type, onConfirm }: { type: ProjectTypeRow; onConfirm: () => void }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (type.projectCount > 0) {
      onConfirm();
      return;
    }
    startTransition(async () => {
      await deleteProjectTypeAction(type.id);
      toast(`Deleted “${type.name}”`);
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${type.name}`}
      disabled={pending}
      onClick={onClick}
      className="hover:text-destructive"
    >
      <Trash2Icon />
    </Button>
  );
}

function ConfirmDelete({ type, onDone }: { type: ProjectTypeRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      await deleteProjectTypeAction(type.id);
      toast(`Deleted “${type.name}”`);
      onDone();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete “{type.name}”?</DialogTitle>
        <DialogDescription>
          {projectCount(type.projectCount)} {type.projectCount === 1 ? "uses" : "use"} this type.{" "}
          {type.projectCount === 1 ? "It" : "They"}&apos;ll be left without a type.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="destructive" disabled={pending} onClick={onDelete}>
          {pending ? "Deleting…" : "Delete Type"}
        </Button>
      </DialogFooter>
    </>
  );
}

// Rendered only while the dialog is open, so it starts from the type each time.
function ProjectTypeForm({ type, onDone }: { type: ProjectTypeRow | null; onDone: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [icon, setIcon] = useState<ProjectTypeIcon>(type?.icon ?? DEFAULT_PROJECT_TYPE_ICON);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, icon };
      const result = type ? await updateProjectTypeAction(type.id, input) : await createProjectTypeAction(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>{type ? "Edit Type" : "New Type"}</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="project-type-name">Name</FieldLabel>
        <div className="flex gap-2">
          <TypeIconPicker value={icon} onChange={setIcon} />
          <Input
            id="project-type-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. YouTube Video"
            maxLength={PROJECT_TYPE_NAME_MAX_LENGTH}
            autoComplete="off"
            required
            autoFocus
          />
        </div>
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : type ? "Save" : "Add Type"}
        </Button>
      </DialogFooter>
    </form>
  );
}
