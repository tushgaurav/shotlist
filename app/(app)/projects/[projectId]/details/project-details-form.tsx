"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PresetCombobox } from "@/components/preset-combobox";
import { typeChoiceOf, typeSelection, TypeField, type TypeSelection } from "@/components/project-type-picker";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_ASPECT_RATIOS,
  PROJECT_DETAIL_MAX_LENGTH,
  PROJECT_GENRES,
  PROJECT_LANGUAGES,
  PROJECT_TITLE_MAX_LENGTH,
  type ProjectDetails,
  type ProjectInput,
  type ProjectTypeOption,
} from "@/lib/projects";

import { SettingsCard, SettingsRow } from "../../../settings/settings-card";
import { updateProjectAction } from "../../actions";

export type SavedProject = ProjectDetails & { id: string; title: string; typeId: string | null };

const TEXT_FIELDS = ["logline", "synopsis", "genre", "tone", "aspectRatio", "language"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

type FormValues = Record<TextField, string> & { title: string; type: TypeSelection; runtime: string };

function valuesOf(project: SavedProject): FormValues {
  return {
    title: project.title,
    type: typeSelection(project.typeId),
    runtime: project.targetRuntimeMinutes?.toString() ?? "",
    ...(Object.fromEntries(TEXT_FIELDS.map((field) => [field, project[field] ?? ""])) as Record<TextField, string>),
  };
}

/** Only what differs from the saved project, compared the way the server stores it. */
function changesOf(values: FormValues, saved: SavedProject): ProjectInput {
  const patch: ProjectInput = {};
  if (values.title.trim() !== saved.title) patch.title = values.title;
  if (values.type.selected === "new" || values.type.selected !== typeSelection(saved.typeId).selected) {
    patch.type = typeChoiceOf(values.type);
  }
  for (const field of TEXT_FIELDS) {
    if ((values[field].trim() || null) !== saved[field]) patch[field] = values[field];
  }
  const runtime = values.runtime === "" ? null : Number.parseInt(values.runtime, 10);
  if (runtime !== saved.targetRuntimeMinutes) patch.targetRuntimeMinutes = runtime;
  return patch;
}

export function ProjectDetailsForm({ project, types }: { project: SavedProject; types: ProjectTypeOption[] }) {
  const [values, setValues] = useState(() => valuesOf(project));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const changes = changesOf(values, project);
  const dirty = Object.keys(changes).length > 0;

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setError(null);
    startSaving(async () => {
      const result = await updateProjectAction(project.id, changes);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Show sent fields as stored, unless they were edited again while saving.
      setValues((current) => {
        const next = { ...current };
        if (current.title === changes.title) next.title = current.title.trim();
        for (const field of TEXT_FIELDS) {
          if (current[field] === changes[field]) next[field] = current[field].trim();
        }
        // A type created by name now has an ID to select.
        if (result.typeId !== undefined) next.type = typeSelection(result.typeId);
        return next;
      });
      toast.success("Details saved");
    });
  }

  const text = (field: TextField) => ({
    id: `project-${field}`,
    value: values[field],
    maxLength: PROJECT_DETAIL_MAX_LENGTH[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(field, event.target.value),
  });

  const preset = (field: TextField) => ({
    id: `project-${field}`,
    value: values[field],
    maxLength: PROJECT_DETAIL_MAX_LENGTH[field],
    onChange: (value: string) => set(field, value),
    as: Input,
  });

  return (
    <form onSubmit={onSubmit} className="@container/settings flex flex-col gap-6">
      <SettingsCard title="General" description="What the project is called and what kind of work it is.">
        <SettingsRow label="Title" htmlFor="project-title-input">
          <Input
            id="project-title-input"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={PROJECT_TITLE_MAX_LENGTH}
            autoComplete="off"
            required
          />
        </SettingsRow>
        <SettingsRow
          label="Type"
          htmlFor="project-type"
          description={
            <>
              Rename or remove types in{" "}
              <Link href="/settings/project-types" className="underline underline-offset-4 hover:text-foreground">
                Settings
              </Link>
              .
            </>
          }
        >
          <TypeField id="project-type" types={types} value={values.type} onChange={(type) => set("type", type)} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Story" description="What it's about, in a sentence and in a few paragraphs.">
        <SettingsRow
          label="Logline"
          htmlFor="project-logline"
          description="One sentence: who wants what, and what stands in their way."
        >
          <Textarea {...text("logline")} />
        </SettingsRow>
        <StackedRow label="Synopsis" htmlFor="project-synopsis" description="The story from start to finish.">
          <Textarea className="min-h-36" {...text("synopsis")} />
        </StackedRow>
        <SettingsRow label="Genre" htmlFor="project-genre" description="Separate several with commas.">
          <PresetCombobox {...preset("genre")} options={PROJECT_GENRES} multiple placeholder="e.g. Drama, Thriller" />
        </SettingsRow>
        <SettingsRow
          label="Tone and Style"
          htmlFor="project-tone"
          description="How it should feel, and any references."
        >
          <Textarea placeholder="e.g. Dry and deadpan, handheld, natural light" {...text("tone")} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Format" description="How long it runs, how it's framed and the language it's in.">
        <SettingsRow label="Target Runtime" htmlFor="project-runtime" description="In minutes.">
          <div className="relative">
            <Input
              id="project-runtime"
              inputMode="numeric"
              value={values.runtime}
              onChange={(event) => set("runtime", event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="e.g. 12"
              autoComplete="off"
              aria-describedby="project-runtime-unit"
              className="pr-12 tabular-nums"
            />
            <span
              id="project-runtime-unit"
              className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
            >
              min
            </span>
          </div>
        </SettingsRow>
        <SettingsRow label="Aspect Ratio" htmlFor="project-aspectRatio">
          <PresetCombobox {...preset("aspectRatio")} options={PROJECT_ASPECT_RATIOS} placeholder="e.g. 16:9" />
        </SettingsRow>
        <SettingsRow label="Language" htmlFor="project-language">
          <PresetCombobox {...preset("language")} options={PROJECT_LANGUAGES} placeholder="e.g. English" />
        </SettingsRow>
      </SettingsCard>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {error ? (
          <FieldError className="mr-auto">{error}</FieldError>
        ) : (
          dirty && <p className="mr-auto text-sm text-muted-foreground">Unsaved Changes</p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            setValues(valuesOf(project));
            setError(null);
          }}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

/** A row whose control spans the full width, for long text. */
function StackedRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 px-4 py-4">
      <div className="grid gap-1">
        <Label htmlFor={htmlFor} className="w-fit leading-snug">
          {label}
        </Label>
        <p className="text-sm leading-snug text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
