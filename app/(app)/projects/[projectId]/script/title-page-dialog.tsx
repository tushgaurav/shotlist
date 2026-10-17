"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import type { TitlePage } from "@/lib/screenplay/types";

import { updateTitlePageAction } from "./actions";

type Props = {
  scriptId: string;
  projectTitle: string;
  titlePage: TitlePage;
  onTitlePageSaved: (titlePage: TitlePage) => void;
};

export function TitlePageDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Title page
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <TitlePageForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const FIELDS: { name: keyof TitlePage; label: string; placeholder?: string; multiline?: boolean }[] = [
  { name: "title", label: "Title" },
  { name: "credit", label: "Credit", placeholder: "Written by" },
  { name: "author", label: "Author" },
  { name: "source", label: "Source", placeholder: "Based on the novel by…", multiline: true },
  { name: "draftDate", label: "Draft date", placeholder: "e.g. First draft, 17 Oct 2026" },
  { name: "contact", label: "Contact", placeholder: "Email, phone, agent", multiline: true },
];

function TitlePageForm({
  scriptId,
  projectTitle,
  titlePage,
  onTitlePageSaved,
  onDone,
}: Props & { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = Object.fromEntries(FIELDS.map(({ name }) => [name, String(data.get(name) ?? "")]));

    startTransition(async () => {
      const result = await updateTitlePageAction(scriptId, input);
      if (result.error || !result.titlePage) {
        setError(result.error ?? "Couldn't save the title page.");
        return;
      }
      onTitlePageSaved(result.titlePage);
      toast.success("Title page saved.");
      onDone();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Title page</DialogTitle>
        <DialogDescription>Printed on the first page when you export the script.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        {FIELDS.map(({ name, label, placeholder, multiline }) => {
          const id = `title-page-${name}`;
          const common = {
            id,
            name,
            defaultValue: titlePage[name] ?? "",
            placeholder: name === "title" ? projectTitle : placeholder,
            maxLength: multiline ? 1000 : 200,
          };
          return (
            <Field key={name}>
              <FieldLabel htmlFor={id}>{label}</FieldLabel>
              {multiline ? <Textarea rows={2} {...common} /> : <Input autoComplete="off" {...common} />}
            </Field>
          );
        })}
        <FieldError>{error}</FieldError>
      </FieldGroup>
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
